const WebSocket = require('ws')
const crypto = require('crypto')
const { isBinaryFile } = require('isbinaryfile')
const Logger = require('./logger')
const { getConfig } = require('./config')

/**
 * WebSocket 连接处理器
 */
class WebSocketHandler {
  constructor(tunnelClient) {
    this.tunnelClient = tunnelClient
    this.wsConnections = new Map() // WebSocket连接存储
  }

  /**
   * 处理WebSocket升级请求
   */
  async handleWebSocketUpgrade(message, getTargetHosts, lastSuccessfulHost) {
    Logger.info(`🔄 处理WebSocket升级请求: ${message.upgrade_id} ${message.url}`)

    // 智能获取目标主机列表
    const discoveredHosts = await getTargetHosts()

    const targetHosts = lastSuccessfulHost
      ? [lastSuccessfulHost, ...discoveredHosts.filter((h) => h !== lastSuccessfulHost)]
      : discoveredHosts

    Logger.info(`🔍 尝试 WebSocket 连接 ${targetHosts.length} 个潜在的 Home Assistant 主机...`)

    for (const hostname of targetHosts) {
      try {
        const success = await this.attemptWebSocketConnection(message, hostname)
        if (success) {
          Logger.info(`✅ WebSocket成功连接到Home Assistant: ${hostname}:${getConfig().local_ha_port}`)
          return hostname
        }
      } catch (error) {
        Logger.debug(`❌ WebSocket 连接失败 ${hostname}: ${error.message}`)
        continue
      }
    }

    this.sendWebSocketUpgradeError(message, targetHosts)
    return null
  }

  /**
   * 处理WebSocket数据
   */
  async handleWebSocketData(message) {
    const { upgrade_id, data } = message
    const wsConnection = this.wsConnections.get(upgrade_id)
    if (!wsConnection || !wsConnection.socket) {
      Logger.warn(`未找到WebSocket连接: ${upgrade_id}`)
      return
    }

    try {
      // 将 base64 解码为 Buffer
      const binaryData = Buffer.from(data, 'base64')

      // 使用异步方法判断是否为二进制消息
      const isBinaryMessage = await this.isBinaryWebSocketMessageAsync(binaryData)

      if (isBinaryMessage) {
        // 二进制消息直接发送
        Logger.info(`📦 发送二进制WebSocket数据到HA: ${upgrade_id}, 大小: ${binaryData.length} bytes`)
        wsConnection.socket.send(binaryData)
      } else {
        // 文本消息，尝试解码为UTF-8字符串
        const stringData = binaryData.toString('utf8')

        // 验证是否为有效的UTF-8字符串
        if (this.isValidUTF8String(stringData)) {
          // 尝试解析JSON以获取更多信息
          try {
            const jsonMessage = JSON.parse(stringData)
            Logger.info(`✅ WebSocket JSON数据已发送到HA: ${upgrade_id}, 类型: ${jsonMessage.type}`)
          } catch (jsonError) {
            Logger.info(`📄 WebSocket文本数据已发送到HA: ${upgrade_id}, 长度: ${stringData.length}`)
          }

          // 发送文本数据
          wsConnection.socket.send(stringData)
        } else {
          // UTF-8解码失败，当作二进制数据处理
          Logger.warn(`⚠️ UTF-8解码失败，作为二进制数据发送: ${upgrade_id}`)
          wsConnection.socket.send(binaryData)
        }
      }
    } catch (error) {
      Logger.error(`WebSocket数据转发失败: ${error.message}`)
    }
  }

  /**
   * 处理WebSocket关闭
   */
  handleWebSocketClose(message) {
    const { upgrade_id } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection) {
      if (wsConnection.socket) {
        wsConnection.socket.destroy()
      }
      this.wsConnections.delete(upgrade_id)
    }
  }

  /**
   * 异步检测Buffer是否包含二进制数据（使用 isbinaryfile 库）
   * @param {Buffer} buffer - 要检查的数据缓冲区
   * @returns {Promise<boolean>} - true表示二进制数据，false表示文本数据
   */
  async isBinaryWebSocketMessageAsync(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false
    }

    try {
      return await isBinaryFile(buffer)
    } catch (error) {
      Logger.error(`异步二进制检测错误: ${error.message}`)
      return buffer.includes(0x00)
    }
  }

  /**
   * 验证是否为有效的UTF-8字符串或Buffer
   * @param {string|Buffer} input - 要验证的字符串或Buffer
   * @returns {boolean} - true表示有效的UTF-8
   */
  isValidUTF8String(input) {
    try {
      let text
      let buffer

      if (Buffer.isBuffer(input)) {
        buffer = input
        text = buffer.toString('utf8')
      } else if (typeof input === 'string') {
        text = input
        buffer = Buffer.from(text, 'utf8')
      } else {
        return false
      }

      // 检查字符串是否包含替换字符（�），这通常表示UTF-8解码失败
      if (text.includes('\uFFFD')) {
        return false
      }

      // 检查字符串长度
      if (text.length === 0) {
        return true
      }

      // 尝试重新编码验证一致性
      if (Buffer.isBuffer(input)) {
        const reencoded = Buffer.from(text, 'utf8')
        return reencoded.equals(buffer)
      } else {
        const reencoded = Buffer.from(text, 'utf8').toString('utf8')
        return reencoded === text
      }
    } catch (error) {
      return false
    }
  }

  /**
   * 尝试WebSocket连接
   */
  attemptWebSocketConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const protocol = config.local_ha_port === 443 ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${hostname}:${config.local_ha_port}${message.url}`

      const headers = { ...message.headers }
      headers['host'] = `${hostname}:${config.local_ha_port}`
      delete headers['connection']
      delete headers['upgrade']

      const ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 5000,
      })

      let authenticationState = {
        required: false,
        response: null,
        successful: false
      }

      let resolved = false

      ws.on('open', () => {
        if (resolved) return
        resolved = true
        Logger.info(`✅ WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`)

        this.wsConnections.set(message.upgrade_id, {
          socket: ws,
          hostname: hostname,
          timestamp: Date.now(),
        })

        const websocketKey = message.headers['sec-websocket-key']
        const websocketAccept = websocketKey
          ? crypto
            .createHash('sha1')
            .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64')
          : 'dummy-accept-key'

        const response = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 101,
          headers: {
            upgrade: 'websocket',
            connection: 'upgrade',
            'sec-websocket-accept': websocketAccept,
          },
        }
        this.tunnelClient.send(response)
        Logger.info(`📤 发送WebSocket升级响应: ${message.upgrade_id}, 状态: 101`)

        ws.on('message', (data) => {
          Logger.info(`📥 WebSocket收到HA消息: ${message.upgrade_id}, 长度: ${data.length}, 内容: ${data.toString()}`)

          let isAuthMessage = false
          let messageType = null
          try {
            const parsed = JSON.parse(data.toString())
            messageType = parsed.type
            if (parsed.type === 'auth_required') {
              Logger.info(`🔐 HA要求WebSocket认证: ${message.upgrade_id}`)
              authenticationState.required = true
              isAuthMessage = true
            } else if (parsed.type === 'auth_invalid') {
              Logger.warn(`❌ WebSocket认证失败: ${message.upgrade_id} - 请检查浏览器中的访问令牌是否有效`)
              Logger.info(`💡 提示：需要在HA中生成长期访问令牌，并在浏览器中正确配置`)
              authenticationState.response = 'invalid'
              authenticationState.successful = false
              isAuthMessage = true
            } else if (parsed.type === 'auth_ok') {
              Logger.info(`✅ WebSocket认证成功: ${message.upgrade_id}`)
              authenticationState.response = 'ok'
              authenticationState.successful = true
              isAuthMessage = true
            }
          } catch (e) {
            // 正常的非JSON消息
          }

          const response = {
            type: 'websocket_data',
            upgrade_id: message.upgrade_id,
            data: data.toString('base64'),
          }

          try {
            if (isAuthMessage) {
              // 认证消息使用同步发送，并添加多重保障
              Logger.info(`🔐 准备立即发送认证消息: ${messageType} - ${message.upgrade_id}`)
              this.sendAuthMessage(response, messageType, message.upgrade_id)
            } else {
              this.tunnelClient.send(response)
              Logger.info(`📤 已转发WebSocket消息: ${message.upgrade_id}`)
            }
          } catch (error) {
            Logger.error(`❌ WebSocket消息转发失败: ${error.message}`)
            Logger.error(error.stack)
          }
        })

        resolve(true)
      })

      ws.on('error', (error) => {
        Logger.error(`🔴 ws error: ${error}`)
        if (resolved) return
        resolved = true

        const errorResponse = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 502,
          headers: {},
        }
        this.tunnelClient.send(errorResponse)
        reject(error)
      })

      ws.on('close', (code, reason) => {
        Logger.info(`🔴 WebSocket连接关闭: ${hostname}, upgrade_id: ${message.upgrade_id}, 代码: ${code}, 原因: ${reason || '无'}`)

        const closeAnalysis = this.analyzeCloseReason(code, authenticationState)
        Logger.info(`ℹ️  ${closeAnalysis}`)

        // 延迟发送关闭通知
        setTimeout(() => {
          this.sendCloseNotification(message.upgrade_id)
        }, 1000)
      })

      // 设置连接超时
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          reject(new Error('WebSocket连接超时'))
        }
      }, 5000)
    })
  }

  /**
   * 发送认证消息
   */
  sendAuthMessage(response, messageType, upgradeId) {
    const sendSuccess = this.tunnelClient.send(response)
    if (!sendSuccess) {
      Logger.error(`❌ 认证消息发送失败: ${upgradeId}`)
      return
    }

    // 强制刷新网络缓冲区
    setImmediate(() => {
      if (this.tunnelClient.socket && typeof this.tunnelClient.socket._flush === 'function') {
        this.tunnelClient.socket._flush()
      }

      if (this.tunnelClient.socket && typeof this.tunnelClient.socket.uncork === 'function') {
        this.tunnelClient.socket.cork()
        process.nextTick(() => {
          this.tunnelClient.socket.uncork()
        })
      }
    })

    // 对于auth_ok和auth_invalid消息，添加额外的确认机制
    if (messageType === 'auth_ok' || messageType === 'auth_invalid') {
      setTimeout(() => {
        Logger.info(`🔄 再次确认${messageType}消息已发送: ${upgradeId}`)
        if (this.tunnelClient && this.tunnelClient.isConnected) {
          Logger.info(`✅ 隧道连接状态正常，${messageType}消息应已传输`)
        } else {
          Logger.warn(`⚠️  隧道连接异常，${messageType}消息可能未完全传输`)
        }
      }, 50)
    }

    Logger.info(`📤 已立即转发WebSocket认证消息: ${upgradeId}`)
  }

  /**
   * 分析关闭原因
   */
  analyzeCloseReason(code, authenticationState) {
    if (authenticationState.required) {
      if (authenticationState.response === 'invalid') {
        return 'HA在认证失败后正常关闭连接（安全机制）'
      } else if (authenticationState.response === 'ok') {
        return '认证成功后的连接关闭（可能是客户端主动断开或其他原因）'
      } else if (authenticationState.response === null && code === 1000) {
        return 'HA在认证过程中关闭连接（可能是auth_invalid消息丢失或网络问题）'
      } else {
        return '认证过程中的异常关闭'
      }
    } else {
      if (code === 1000) {
        return '正常关闭（可能是客户端主动断开）'
      } else if (code === 1006) {
        return '异常关闭（网络问题或服务器错误）'
      } else {
        return `关闭代码: ${code}`
      }
    }
  }

  /**
   * 发送关闭通知
   */
  sendCloseNotification(upgrade_id) {
    this.wsConnections.delete(upgrade_id)

    const response = {
      type: 'websocket_close',
      upgrade_id: upgrade_id,
    }

    try {
      this.tunnelClient.send(response)
      Logger.info(`📤 通知服务器WebSocket连接关闭: ${upgrade_id}`)
    } catch (error) {
      Logger.error(`❌ 发送关闭通知失败: ${error.message}`)
    }
  }

  /**
   * 发送WebSocket升级错误
   */
  sendWebSocketUpgradeError(message, attemptedHosts) {
    const errorResponse = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }

    this.tunnelClient.send(errorResponse)
    Logger.error(`WebSocket升级失败，尝试的主机: ${attemptedHosts.join(', ')}`)
  }

  /**
   * 获取WebSocket连接统计
   */
  getConnectionStats() {
    return {
      activeConnections: this.wsConnections.size,
      connections: Array.from(this.wsConnections.entries()).map(([id, conn]) => ({
        upgradeId: id,
        hostname: conn.hostname,
        timestamp: conn.timestamp,
        age: Date.now() - conn.timestamp
      }))
    }
  }
}

module.exports = WebSocketHandler
