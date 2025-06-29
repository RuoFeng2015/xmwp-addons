const WebSocket = require('ws')
const crypto = require('crypto')
const { isBinaryFile } = require('isbinaryfile')
const Logger = require('./logger')
const { getConfig } = require('./config')
const iOSDebugLogger = require('./ios-websocket-debug')

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

    // iOS兼容性检查（现在只记录，不阻断连接）
    const isValidiOSRequest = this.validateiOSWebSocketRequest(message)
    if (!isValidiOSRequest) {
      Logger.warn(`⚠️ WebSocket请求可能存在iOS兼容性问题，但仍将尝试连接: ${message.upgrade_id}`)
    }

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
        
        // 如果是扩展相关错误，尝试iOS兼容模式
        if (error.message.includes('extension') || error.message.includes('Sec-WebSocket-Extensions')) {
          Logger.info(`🔄 尝试iOS兼容模式连接: ${hostname}`)
          try {
            const iOSSuccess = await this.attemptWebSocketConnectionWithiOSFallback(message, hostname)
            if (iOSSuccess) {
              Logger.info(`✅ iOS兼容模式WebSocket连接成功: ${hostname}:${getConfig().local_ha_port}`)
              return hostname
            }
          } catch (iOSError) {
            Logger.debug(`❌ iOS兼容模式也失败: ${iOSError.message}`)
          }
        }
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
      
      Logger.info(`📥 [WebSocket] 收到来自客户端的数据: ${upgrade_id}, 长度: ${binaryData.length}`)

      // 使用异步方法判断是否为二进制消息
      const isBinaryMessage = await this.isBinaryWebSocketMessageAsync(binaryData)

      if (isBinaryMessage) {
        // 二进制消息直接发送
        Logger.info(`📦 发送二进制WebSocket数据到HA: ${upgrade_id}, 大小: ${binaryData.length} bytes`)
        // 检查WebSocket状态
        if (wsConnection.socket.readyState === wsConnection.socket.OPEN) {
          wsConnection.socket.send(binaryData)
        } else {
          Logger.warn(`⚠️ WebSocket连接未打开，无法发送二进制数据: ${upgrade_id}, 状态: ${wsConnection.socket.readyState}`)
        }
      } else {
        // 文本消息，尝试解码为UTF-8字符串
        const stringData = binaryData.toString('utf8')

        // 验证是否为有效的UTF-8字符串
        if (this.isValidUTF8String(stringData)) {
          // 尝试解析JSON以获取更多信息
          try {
            const jsonMessage = JSON.parse(stringData)
            Logger.info(`🔍 [iOS监控] 收到JSON消息: ${upgrade_id}, 类型: ${jsonMessage.type || '未知'}`)
            
            // 特别关注认证相关消息 - 这是关键！
            if (jsonMessage.type === 'auth') {
              Logger.info(`🔐 [认证监控] *** 收到来自iOS的认证消息! ***`)
              Logger.info(`🔐 [认证监控] 连接ID: ${upgrade_id}`)
              Logger.info(`🔐 [认证监控] 消息完整内容: ${JSON.stringify(jsonMessage, null, 2)}`)
              Logger.info(`🔐 [认证监控] 现在将立即转发到HA...`)
            } else if (jsonMessage.type) {
              Logger.info(`📨 [消息监控] 收到${jsonMessage.type}类型消息: ${upgrade_id}`)
            }
            
            Logger.info(`✅ WebSocket JSON数据已发送到HA: ${upgrade_id}, 类型: ${jsonMessage.type}`)
          } catch (jsonError) {
            Logger.info(`📄 WebSocket文本数据已发送到HA: ${upgrade_id}, 长度: ${stringData.length}`)
            Logger.info(`📄 内容预览: ${stringData.substring(0, 100)}...`)
            
            // 检查是否可能是iOS发送的认证数据但格式不同
            if (stringData.includes('auth') || stringData.includes('token') || stringData.includes('access_token')) {
              Logger.warn(`🔍 [认证监控] 可能包含认证信息的非JSON数据: ${stringData}`)
            }
          }

          // 发送文本数据
          if (wsConnection.socket.readyState === wsConnection.socket.OPEN) {
            wsConnection.socket.send(stringData)
          } else {
            Logger.warn(`⚠️ WebSocket连接未打开，无法发送文本数据: ${upgrade_id}, 状态: ${wsConnection.socket.readyState}`)
          }
        } else {
          // UTF-8解码失败，当作二进制数据处理
          Logger.warn(`⚠️ UTF-8解码失败，作为二进制数据发送: ${upgrade_id}`)
          if (wsConnection.socket.readyState === wsConnection.socket.OPEN) {
            wsConnection.socket.send(binaryData)
          } else {
            Logger.warn(`⚠️ WebSocket连接未打开，无法发送二进制数据: ${upgrade_id}, 状态: ${wsConnection.socket.readyState}`)
          }
        }
      }
    } catch (error) {
      Logger.error(`WebSocket数据转发失败: ${error.message}`)
      Logger.error(`🔍 [错误监控] 连接ID: ${upgrade_id}, 数据长度: ${data ? data.length : 0}`)
    }
  }

  /**
   * 处理WebSocket关闭
   */
  handleWebSocketClose(message) {
    const { upgrade_id } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection && wsConnection.socket) {
      try {
        // 检查socket状态和可用的关闭方法
        const ws = wsConnection.socket
        
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          Logger.info(`🔄 正常关闭WebSocket连接: ${upgrade_id}`)
          ws.close(1000, 'Normal closure')
        } else if (ws.readyState === ws.CLOSING) {
          Logger.info(`⏳ WebSocket正在关闭中: ${upgrade_id}`)
        } else {
          Logger.info(`🔴 WebSocket已关闭: ${upgrade_id}, 状态: ${ws.readyState}`)
        }
        
        // 使用正确的终止方法
        if (typeof ws.terminate === 'function') {
          setTimeout(() => {
            try {
              ws.terminate()
            } catch (termError) {
              Logger.warn(`⚠️ WebSocket终止警告: ${termError.message}`)
            }
          }, 1000)
        }
      } catch (error) {
        Logger.error(`❌ WebSocket关闭处理错误: ${error.message}`)
      }
      
      this.wsConnections.delete(upgrade_id)
    } else {
      Logger.warn(`⚠️ 尝试关闭不存在的WebSocket连接: ${upgrade_id}`)
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

      // 记录连接尝试用于iOS调试
      const debugAttempt = iOSDebugLogger.logConnectionAttempt(
        message.upgrade_id, 
        hostname, 
        message.headers,
        message.headers['user-agent']
      )

      // 优化头信息处理以支持iOS
      const headers = { ...message.headers }
      headers['host'] = `${hostname}:${config.local_ha_port}`
      
      // 确保关键的WebSocket头信息存在
      if (!headers['connection']) {
        headers['connection'] = 'Upgrade'
        Logger.info(`🔧 [iOS Fix] 添加缺失的Connection头: Upgrade`)
      }
      
      if (!headers['upgrade']) {
        headers['upgrade'] = 'websocket'
        Logger.info(`🔧 [iOS Fix] 添加缺失的Upgrade头: websocket`)
      }
      
      if (!headers['sec-websocket-version']) {
        headers['sec-websocket-version'] = '13'
        Logger.info(`🔧 [iOS Fix] 添加缺失的Sec-WebSocket-Version头: 13`)
      }
      
      // 确保有Origin头（iOS需要）
      if (!headers['origin']) {
        headers['origin'] = `${protocol}://${hostname}:${config.local_ha_port}`
        Logger.info(`🔧 [iOS Fix] 添加缺失的Origin头: ${headers['origin']}`)
      }
      
      // 处理WebSocket扩展问题 - 如果客户端请求了扩展但服务器不支持，或反之
      if (headers['sec-websocket-extensions']) {
        Logger.info(`🔧 [iOS Fix] 原始扩展头: ${headers['sec-websocket-extensions']}`)
        // 移除可能导致问题的扩展头，让服务器决定
        delete headers['sec-websocket-extensions']
        Logger.info(`🔧 [iOS Fix] 已删除扩展头以避免协商问题`)
      }
      
      // 清理不需要的头信息
      delete headers['connection']
      delete headers['upgrade']

      Logger.info(`🔍 [WebSocket] 最终连接头信息:`)
      Object.entries(headers).forEach(([key, value]) => {
        Logger.info(`   ${key}: ${value}`)
      })

      // 增加超时时间，减少iOS连接失败
      const ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 10000, // 增加到10秒
        handshakeTimeout: 8000, // 握手超时8秒
        perMessageDeflate: false, // 禁用压缩，提高iOS兼容性
        skipUTF8Validation: false, // 确保UTF8验证
        extensions: [], // 明确禁用所有WebSocket扩展
        maxPayload: 100 * 1024 * 1024, // 设置最大负载大小
      })

      let authenticationState = {
        required: false,
        response: null,
        successful: false
      }

      let resolved = false
      
      // 设置更短的错误检测超时
      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          const timeoutError = 'WebSocket connection timeout'
          Logger.error(`⏰ WebSocket连接超时: ${hostname}:${config.local_ha_port}`)
          
          // 记录调试结果
          iOSDebugLogger.logConnectionResult(message.upgrade_id, false, timeoutError, 408)
          
          const timeoutResponse = {
            type: 'websocket_upgrade_response',
            upgrade_id: message.upgrade_id,
            status_code: 408,
            headers: {
              'Connection': 'close',
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache',
              'X-Error-Reason': 'Connection timeout'
            },
            error: 'WebSocket connection timeout'
          }
          this.safeTunnelSend(timeoutResponse, `WebSocket连接超时: ${message.upgrade_id}`)
          
          try {
            ws.terminate()
          } catch (e) {
            // 忽略终止错误
          }
          reject(new Error(timeoutError))
        }
      }, 12000) // 12秒总超时

      ws.on('open', () => {
        if (resolved) return
        resolved = true
        clearTimeout(connectionTimeout) // 清除超时定时器
        
        Logger.info(`✅ WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`)
        
        // 记录成功连接用于调试
        iOSDebugLogger.logConnectionResult(message.upgrade_id, true, null, 101)

        this.wsConnections.set(message.upgrade_id, {
          socket: ws,
          hostname: hostname,
          timestamp: Date.now(),
          userAgent: message.headers['user-agent']
        })

        // 修复 WebSocket 握手响应头，确保完全符合 RFC 6455 标准
        const websocketKey = message.headers['sec-websocket-key']
        if (!websocketKey) {
          Logger.error(`缺少 Sec-WebSocket-Key 头，WebSocket 升级失败: ${message.upgrade_id}`)
          reject(new Error('Missing Sec-WebSocket-Key header'))
          return
        }

        // 使用严格的iOS兼容响应头生成
        const { headers: responseHeaders, accept: websocketAccept } = this.createStrictWebSocketResponse(message)

        const response = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 101,
          headers: responseHeaders,
        }
        
        this.safeTunnelSend(response, `WebSocket升级响应: ${message.upgrade_id}`)
        Logger.info(`📤 发送WebSocket升级响应: ${message.upgrade_id}, 状态: 101, Accept: ${websocketAccept}`)
        Logger.info(`🍎 [iOS修复] 升级响应已发送，检查iOS是否接受`)
        Logger.debug(`🔧 响应头: ${JSON.stringify(responseHeaders, null, 2)}`)

        // 为iOS添加连接稳定性监控
        this.setupiOSConnectionMonitoring(ws, message.upgrade_id)
        
        // 模拟浏览器行为以提高iOS兼容性
        this.setupBrowserLikeWebSocket(ws, message.upgrade_id, message.headers)

        // 添加iOS专用的连接监控
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
              // 使用iOS专用认证处理器
              Logger.info(`🔐 准备发送认证消息: ${messageType} - ${message.upgrade_id}`)
              this.handleiOSAuthMessage(ws, response, messageType, message.upgrade_id, authenticationState)
            } else {
              this.safeTunnelSend(response, `WebSocket消息转发: ${message.upgrade_id}`)
              Logger.info(`📤 已转发WebSocket消息: ${message.upgrade_id}`)
            }
          } catch (error) {
            Logger.error(`转发WebSocket消息失败: ${error.message}`)
          }
        })

        // 添加专门的iOS错误诊断
        ws.on('error', (error) => {
          Logger.error(`WebSocket错误: ${error.message}`)
          Logger.error(`🍎 [iOS Debug] WebSocket连接错误详情:`)
          Logger.error(`   ID: ${message.upgrade_id}`)
          Logger.error(`   错误: ${error.message}`)
          Logger.error(`   Client: ${message.headers['user-agent']}`)
          
          // 检查是否是iOS客户端
          const userAgent = message.headers['user-agent'] || ''
          if (userAgent.includes('Home Assistant') && userAgent.includes('iOS')) {
            Logger.error(`🍎 [iOS特定错误] 可能的原因:`)
            Logger.error(`   1. WebSocket响应头不兼容`)
            Logger.error(`   2. 子协议协商失败`)
            Logger.error(`   3. 扩展协商问题`)
            Logger.error(`   4. 证书或TLS问题`)
          }
        })

        resolve(true)
      })

      ws.on('error', (error) => {
        Logger.error(`🔴 WebSocket连接错误: ${hostname}:${config.local_ha_port} - ${error.message}`)
        if (resolved) return
        resolved = true
        clearTimeout(connectionTimeout) // 清除超时定时器

        // 记录错误连接用于调试
        iOSDebugLogger.logConnectionResult(message.upgrade_id, false, error.message, null)

        // 为 iOS 客户端提供更详细的错误信息，特别针对Starscream
        let statusCode = 502
        let errorMessage = 'WebSocket connection failed'
        let errorCode = 'CONNECTION_FAILED'
        
        if (error.message.includes('ECONNREFUSED')) {
          statusCode = 502
          errorMessage = 'Home Assistant service unavailable'
          errorCode = 'SERVICE_UNAVAILABLE'
        } else if (error.message.includes('timeout')) {
          statusCode = 504
          errorMessage = 'Connection timeout'
          errorCode = 'TIMEOUT'
        } else if (error.message.includes('EHOSTUNREACH')) {
          statusCode = 503
          errorMessage = 'Host unreachable'
          errorCode = 'HOST_UNREACHABLE'
        } else if (error.message.includes('ENOTFOUND')) {
          statusCode = 502
          errorMessage = 'DNS resolution failed'
          errorCode = 'DNS_FAILED'
        } else if (error.message.includes('certificate')) {
          statusCode = 502
          errorMessage = 'SSL certificate error'
          errorCode = 'SSL_ERROR'
        }

        const errorResponse = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: statusCode,
          headers: {
            'Connection': 'close',
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Error-Code': errorCode,
            'X-Error-Detail': error.message
          },
          error: errorMessage
        }
        
        Logger.error(`📤 发送WebSocket错误响应: ${statusCode} - ${errorMessage} (${errorCode})`)
        this.safeTunnelSend(errorResponse, `WebSocket错误响应: ${statusCode}`)
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
   * iOS Starscream特定的WebSocket连接测试
   */
  async attemptWebSocketConnectionWithiOSFallback(message, hostname) {
    Logger.info(`🔄 尝试WebSocket连接(iOS兼容模式): ${hostname}`)
    
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const protocol = config.local_ha_port === 443 ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${hostname}:${config.local_ha_port}${message.url}`

      // iOS Starscream优化的连接头 - 移除所有可能导致问题的扩展
      const headers = {}
      
      // 只保留最基础的WebSocket头信息
      headers['host'] = `${hostname}:${config.local_ha_port}`
      headers['sec-websocket-key'] = message.headers['sec-websocket-key']
      headers['sec-websocket-version'] = '13'
      headers['origin'] = message.headers['origin'] || `${protocol}://${hostname}:${config.local_ha_port}`
      headers['user-agent'] = message.headers['user-agent'] || 'iOS-Compatible-WebSocket/1.0'
      
      // 明确不包含任何扩展头
      Logger.info(`🔧 [iOS兼容模式] 使用最小化头信息集:`)
      Object.entries(headers).forEach(([key, value]) => {
        Logger.info(`   ${key}: ${value}`)
      })

      // iOS优化的WebSocket配置 - 最大兼容性
      const ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 15000,
        handshakeTimeout: 12000,
        perMessageDeflate: false, // 禁用压缩
        skipUTF8Validation: false,
        protocolVersion: 13,
        followRedirects: false,
        extensions: [], // 完全禁用扩展
        maxPayload: 10 * 1024 * 1024, // 10MB限制
      })

      let resolved = false
      
      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          Logger.error(`⏰ iOS兼容模式WebSocket连接超时: ${hostname}:${config.local_ha_port}`)
          try {
            ws.terminate()
          } catch (e) {
            // 忽略终止错误
          }
          reject(new Error('iOS compatible WebSocket connection timeout'))
        }
      }, 18000)
      
      ws.on('open', () => {
        if (resolved) return
        resolved = true
        clearTimeout(connectionTimeout)
        
        Logger.info(`✅ iOS兼容模式WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`)

        this.wsConnections.set(message.upgrade_id, {
          socket: ws,
          hostname: hostname,
          timestamp: Date.now(),
          isIOSCompatMode: true, // 标记为iOS兼容模式
        })

        // iOS特化的WebSocket握手响应
        const websocketKey = message.headers['sec-websocket-key']
        const websocketAccept = crypto
          .createHash('sha1')
          .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64')

        const responseHeaders = {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Accept': websocketAccept,
          'Sec-WebSocket-Version': '13',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-iOS-Compatible': 'true',
          'X-Extensions-Disabled': 'true'
        }

        const response = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 101,
          headers: responseHeaders,
        }
        
        this.safeTunnelSend(response, `iOS兼容模式WebSocket升级响应: ${message.upgrade_id}`)
        Logger.info(`📤 发送iOS兼容模式WebSocket升级响应: ${message.upgrade_id}`)

        // iOS消息处理
        ws.on('message', (data) => {
          const response = {
            type: 'websocket_data',
            upgrade_id: message.upgrade_id,
            data: data.toString('base64'),
          }
          this.safeTunnelSend(response, `iOS兼容模式WebSocket消息: ${message.upgrade_id}`)
        })

        resolve(true)
      })

      ws.on('error', (error) => {
        Logger.error(`🔴 iOS兼容模式WebSocket连接错误: ${hostname}:${config.local_ha_port} - ${error.message}`)
        if (resolved) return
        resolved = true
        clearTimeout(connectionTimeout)
        reject(error)
      })

      ws.on('close', (code, reason) => {
        Logger.info(`🔴 iOS兼容模式WebSocket连接关闭: ${hostname}, 代码: ${code}, 原因: ${reason || '无'}`)
        if (resolved) {
          setTimeout(() => {
            this.sendCloseNotification(message.upgrade_id)
          }, 100)
        }
      })
    })
  }

  /**
   * 发送认证消息
   */
  sendAuthMessage(response, messageType, upgradeId) {
    const sendSuccess = this.safeTunnelSend(response, `认证消息: ${messageType} - ${upgradeId}`)
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
      this.safeTunnelSend(response, `WebSocket连接关闭通知: ${upgrade_id}`)
      Logger.info(`📤 通知服务器WebSocket连接关闭: ${upgrade_id}`)
    } catch (error) {
      Logger.error(`❌ 发送关闭通知失败: ${error.message}`)
    }
  }

  /**
   * 发送WebSocket升级错误
   */
  sendWebSocketUpgradeError(message, attemptedHosts) {
    Logger.error(`🔴 WebSocket升级失败，所有主机都无法连接: ${message.upgrade_id}`)
    Logger.error(`🔴 尝试的主机列表: ${attemptedHosts.join(', ')}`)

    // 为iOS提供详细的错误信息
    const errorResponse = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 502,
      headers: {
        'Connection': 'close',
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Error-Code': 'ALL_HOSTS_FAILED',
        'X-Attempted-Hosts': attemptedHosts.join(',')
      },
      error: `Home Assistant WebSocket service unavailable. Attempted hosts: ${attemptedHosts.join(', ')}`
    }

    Logger.error(`📤 发送WebSocket升级错误响应: ${message.upgrade_id} - ${errorResponse.error}`)
    this.safeTunnelSend(errorResponse, `WebSocket升级错误: ${message.upgrade_id}`)
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

  /**
   * 验证WebSocket请求的iOS兼容性
   * 特别针对Starscream客户端的要求
   */
  validateiOSWebSocketRequest(message) {
    const issues = []
    const headers = message.headers || {}
    
    // 先记录所有收到的头信息用于调试
    Logger.info(`🔍 [iOS Debug] 收到的WebSocket头信息: ${message.upgrade_id}`)
    Object.entries(headers).forEach(([key, value]) => {
      Logger.info(`   ${key}: ${value}`)
    })
    
    // 检查必要的WebSocket头（必须有）
    if (!headers['sec-websocket-key']) {
      issues.push('Missing Sec-WebSocket-Key header')
    }
    
    // WebSocket版本检查（可选，如果存在则必须是13）
    if (headers['sec-websocket-version'] && headers['sec-websocket-version'] !== '13') {
      issues.push(`Unsupported WebSocket version: ${headers['sec-websocket-version']}`)
    }
    
    // Upgrade头检查（必须有且为websocket）
    if (!headers['upgrade'] || headers['upgrade'].toLowerCase() !== 'websocket') {
      issues.push('Invalid or missing Upgrade header')
    }
    
    // Connection头检查（更宽松的检查）
    const connectionHeader = headers['connection']
    if (connectionHeader) {
      const connectionLower = connectionHeader.toLowerCase()
      // 检查是否包含upgrade（可能是"Upgrade"或"keep-alive, Upgrade"等）
      if (!connectionLower.includes('upgrade')) {
        issues.push(`Invalid Connection header: ${connectionHeader} (should contain 'upgrade')`)
      }
    } else {
      // Connection头缺失，这可能是代理处理时被删除了，我们给一个警告但不拒绝
      Logger.warn(`⚠️ Missing Connection header for WebSocket request: ${message.upgrade_id}`)
      Logger.warn(`⚠️ This might be normal if the proxy server removes this header`)
    }
    
    // 检查Origin头（iOS Safari推荐但不强制）
    if (!headers['origin'] && !headers['sec-websocket-origin']) {
      Logger.info(`⚠️ WebSocket请求缺少Origin头，可能影响iOS兼容性: ${message.upgrade_id}`)
    }
    
    if (issues.length > 0) {
      Logger.error(`❌ WebSocket请求不符合iOS兼容性要求: ${message.upgrade_id}`)
      issues.forEach(issue => Logger.error(`   - ${issue}`))
      return false
    }
    
    Logger.info(`✅ WebSocket请求通过iOS兼容性检查: ${message.upgrade_id}`)
    return true
  }

  /**
   * 创建iOS兼容的WebSocket响应头
   * 严格按照RFC 6455和iOS Starscream的期望
   */
  createiOSCompatibleHeaders(message) {
    const websocketKey = message.headers['sec-websocket-key']
    if (!websocketKey) {
      throw new Error('Missing Sec-WebSocket-Key header')
    }

    // 计算WebSocket Accept key
    const websocketAccept = crypto
      .createHash('sha1')
      .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    // 构建最小化的、严格符合标准的响应头
    const responseHeaders = {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade', 
      'Sec-WebSocket-Accept': websocketAccept
    }

    // 记录iOS调试信息
    Logger.info(`🔧 [iOS Fix] 生成WebSocket响应头:`)
    Logger.info(`   Sec-WebSocket-Key: ${websocketKey}`)
    Logger.info(`   Sec-WebSocket-Accept: ${websocketAccept}`)
    
    // 检查子协议请求
    const requestedProtocols = message.headers['sec-websocket-protocol']
    if (requestedProtocols) {
      Logger.info(`🔧 [iOS Fix] 客户端请求子协议: ${requestedProtocols}`)
      Logger.info(`🔧 [iOS Fix] 不设置子协议响应，保持与HA服务器一致`)
    }

    // 检查扩展请求
    const requestedExtensions = message.headers['sec-websocket-extensions'] 
    if (requestedExtensions) {
      Logger.info(`🔧 [iOS Fix] 客户端请求扩展: ${requestedExtensions}`)
      Logger.info(`🔧 [iOS Fix] 不设置扩展响应，避免协商问题`)
    }

    return { responseHeaders, websocketAccept }
  }

  /**
   * 创建严格的WebSocket响应以确保iOS兼容性
   */
  createStrictWebSocketResponse(message) {
    Logger.info(`🔧 [iOS修复] 创建严格的WebSocket响应`)
    
    // 重新计算Accept key以确保正确性
    const key = message.headers['sec-websocket-key']
    const magicString = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
    const sha1Hash = crypto.createHash('sha1')
    sha1Hash.update(key + magicString)
    const accept = sha1Hash.digest('base64')
    
    Logger.info(`🔧 [iOS修复] WebSocket密钥交换:`)
    Logger.info(`   Client Key: ${key}`)
    Logger.info(`   Accept Key: ${accept}`)
    
    // 创建最小但完整的WebSocket响应头
    const headers = {}
    headers['Upgrade'] = 'websocket'  // 严格按照RFC大小写
    headers['Connection'] = 'Upgrade'
    headers['Sec-WebSocket-Accept'] = accept
    
    // 重要：检查并严格处理扩展和协议
    const extensions = message.headers['sec-websocket-extensions']
    const protocols = message.headers['sec-websocket-protocol']
    
    if (extensions) {
      Logger.info(`🔧 [iOS修复] 客户端请求扩展: ${extensions}`)
      Logger.info(`🔧 [iOS修复] 不回复扩展以避免协商失败`)
      // 不设置 Sec-WebSocket-Extensions 响应头
    }
    
    if (protocols) {
      Logger.info(`🔧 [iOS修复] 客户端请求协议: ${protocols}`)
      
      // 检查是否是Home Assistant相关的协议
      const protocolList = protocols.split(',').map(p => p.trim())
      const haProtocol = protocolList.find(p => 
        p.includes('homeassistant') || 
        p.includes('hass') || 
        p.includes('websocket')
      )
      
      if (haProtocol) {
        Logger.info(`🔧 [iOS修复] 找到HA相关协议: ${haProtocol}，将添加到响应`)
        headers['Sec-WebSocket-Protocol'] = haProtocol
      } else {
        Logger.info(`🔧 [iOS修复] 未找到HA协议，不设置协议响应`)
      }
    }
    
    Logger.info(`🔧 [iOS修复] 最终响应头:`)
    Object.entries(headers).forEach(([k, v]) => {
      Logger.info(`   ${k}: ${v}`)
    })
    
    return { headers, accept }
  }

  /**
   * 设置iOS WebSocket连接监控
   */
  setupiOSConnectionMonitoring(ws, upgradeId) {
    Logger.info(`🍎 [iOS监控] 设置连接监控: ${upgradeId}`)
    
    // 监控连接状态
    let connectionAlive = true
    let pingInterval = null
    
    // 检查用户代理是否为iOS
    const wsConnection = this.wsConnections.get(upgradeId)
    if (wsConnection && wsConnection.userAgent && wsConnection.userAgent.includes('iOS')) {
      Logger.info(`🍎 [iOS监控] 检测到iOS客户端，启用特殊监控`)
      
      // iOS WebSocket心跳检测
      pingInterval = setInterval(() => {
        if (connectionAlive && ws.readyState === ws.OPEN) {
          Logger.info(`🍎 [iOS心跳] 发送心跳检测: ${upgradeId}`)
          try {
            ws.ping()
            connectionAlive = false
            
            // 如果3秒内没有pong响应，认为连接有问题
            setTimeout(() => {
              if (!connectionAlive) {
                Logger.warn(`🍎 [iOS心跳] 心跳超时，连接可能有问题: ${upgradeId}`)
              }
            }, 3000)
          } catch (error) {
            Logger.error(`🍎 [iOS心跳] 心跳发送失败: ${error.message}`)
          }
        }
      }, 30000) // 每30秒一次心跳
    }
    
    // 监听pong响应
    ws.on('pong', () => {
      connectionAlive = true
      Logger.info(`🍎 [iOS心跳] 收到pong响应: ${upgradeId}`)
    })
    
    // 连接关闭时清理
    ws.on('close', () => {
      if (pingInterval) {
        clearInterval(pingInterval)
        Logger.info(`🍎 [iOS监控] 清理连接监控: ${upgradeId}`)
      }
    })
  }

  /**
   * iOS专用的认证消息处理
   */
  handleiOSAuthMessage(ws, data, messageType, upgradeId, authenticationState) {
    Logger.info(`🍎 [iOS认证] 处理认证消息: ${messageType}`)
    
    const userAgent = this.wsConnections.get(upgradeId)?.userAgent || ''
    const isiOS = userAgent.includes('Home Assistant') && userAgent.includes('iOS')
    
    if (!isiOS) {
      // 不是iOS，使用标准处理
      return this.sendAuthMessage(data, messageType, upgradeId)
    }
    
    // iOS专用处理
    if (messageType === 'auth_required') {
      Logger.info(`🍎 [iOS认证] iOS客户端收到认证要求`)
      
      // 重新编码消息以确保iOS兼容性
      const originalData = data.data
      const reEncodedData = this.encodeiOSWebSocketMessage(
        Buffer.from(originalData, 'base64').toString('utf8'), 
        upgradeId
      )
      
      // 检查Starscream可能的问题
      const response = {
        type: 'websocket_data',
        upgrade_id: upgradeId,
        data: reEncodedData,
      }
      
      // 为iOS添加额外的确保措施
      try {
        // 立即发送，不缓冲
        const sendResult = this.safeTunnelSend(response, `iOS认证消息: ${upgradeId}`)
        Logger.info(`🍎 [iOS认证] 认证消息发送状态: ${sendResult}`)
        
        // 强制刷新socket缓冲区
        setImmediate(() => {
          if (this.tunnelClient.socket) {
            try {
              if (typeof this.tunnelClient.socket.flush === 'function') {
                this.tunnelClient.socket.flush()
              }
              if (typeof this.tunnelClient.socket._flush === 'function') {
                this.tunnelClient.socket._flush()
              }
            } catch (flushError) {
              Logger.warn(`🍎 [iOS认证] Socket flush失败: ${flushError.message}`)
            }
          }
        })
        
        // 添加iOS认证超时监控
        setTimeout(() => {
          if (!authenticationState.responseSent) {
            Logger.warn(`🍎 [iOS认证] 5秒内未收到iOS认证响应`)
            Logger.warn(`🍎 [iOS认证] 可能原因:`)
            Logger.warn(`   1. iOS应用WebSocket库不兼容`)
            Logger.warn(`   2. 消息格式问题`)
            Logger.warn(`   3. 认证流程中断`)
            Logger.warn(`   4. Starscream协议错误`)
          }
        }, 5000)
        
        Logger.info(`🍎 [iOS认证] 已发送认证要求给iOS客户端`)
        
      } catch (error) {
        Logger.error(`🍎 [iOS认证] 发送认证消息失败: ${error.message}`)
      }
    }
  }

  /**
   * iOS专用的WebSocket消息编码处理
   */
  encodeiOSWebSocketMessage(message, upgradeId) {
    try {
      // 确保消息是有效的UTF-8 JSON
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
      
      // 验证JSON格式
      const parsed = JSON.parse(messageStr)
      
      // 重新序列化以确保格式正确
      const cleanJson = JSON.stringify(parsed)
      
      // 转换为base64
      const base64Data = Buffer.from(cleanJson, 'utf8').toString('base64')
      
      Logger.info(`🍎 [iOS编码] 消息编码验证通过: ${upgradeId}`)
      Logger.info(`🍎 [iOS编码] 原始长度: ${messageStr.length}, 编码后长度: ${base64Data.length}`)
      
      return base64Data
      
    } catch (error) {
      Logger.error(`🍎 [iOS编码] 消息编码失败: ${error.message}`)
      Logger.error(`🍎 [iOS编码] 原始消息: ${JSON.stringify(message)}`)
      
      // 回退到原始编码
      const fallbackStr = typeof message === 'string' ? message : JSON.stringify(message)
      return Buffer.from(fallbackStr, 'utf8').toString('base64')
    }
  }

  /**
   * 模拟浏览器WebSocket行为以提高iOS兼容性
   */
  setupBrowserLikeWebSocket(ws, upgradeId, headers) {
    const userAgent = headers['user-agent'] || ''
    const isiOS = userAgent.includes('Home Assistant') && userAgent.includes('iOS')
    
    if (!isiOS) return
    
    Logger.info(`🍎 [浏览器模拟] 为iOS设置浏览器兼容模式`)
    
    // 添加浏览器特有的事件处理
    ws.on('open', () => {
      Logger.info(`🍎 [浏览器模拟] WebSocket连接已打开: ${upgradeId}`)
      
      // 模拟浏览器的初始化行为
      setTimeout(() => {
        if (ws.readyState === ws.OPEN) {
          try {
            // 发送一个空的ping来模拟浏览器行为
            ws.ping(Buffer.alloc(0))
            Logger.info(`🍎 [浏览器模拟] 发送初始ping: ${upgradeId}`)
          } catch (error) {
            Logger.warn(`🍎 [浏览器模拟] 初始ping失败: ${error.message}`)
          }
        }
      }, 100)
    })
    
    // 处理pong响应
    ws.on('pong', (data) => {
      Logger.info(`🍎 [浏览器模拟] 收到pong响应: ${upgradeId}`)
    })
    
    // 监听连接状态变化
    ws.on('close', (code, reason) => {
      Logger.info(`🍎 [浏览器模拟] 连接关闭: ${upgradeId}, 代码: ${code}`)
      
      // 分析关闭原因
      if (code === 1002) {
        Logger.error(`🍎 [浏览器模拟] 协议错误关闭，可能是Starscream兼容性问题`)
      } else if (code === 1006) {
        Logger.error(`🍎 [浏览器模拟] 异常关闭，可能是网络或协议问题`)
      }
    })
  }

  /**
   * 安全地发送数据到tunnel client，避免EPIPE错误
   */
  safeTunnelSend(data, context = '') {
    try {
      if (!this.tunnelClient) {
        Logger.warn(`⚠️ TunnelClient不存在，无法发送数据: ${context}`)
        return false
      }

      // 检查tunnel client的连接状态
      if (!this.tunnelClient.isConnected || !this.tunnelClient.socket) {
        Logger.warn(`⚠️ TunnelClient连接未建立，无法发送数据: ${context}`)
        return false
      }

      // 检查socket状态
      if (this.tunnelClient.socket.destroyed || this.tunnelClient.socket.readyState !== 'open') {
        Logger.warn(`⚠️ TunnelClient socket异常，无法发送数据: ${context}, destroyed: ${this.tunnelClient.socket.destroyed}`)
        return false
      }

      return this.tunnelClient.send(data)
    } catch (error) {
      Logger.error(`❌ 发送数据到tunnel client失败: ${error.message}, 上下文: ${context}`)
      return false
    }
  }
}

module.exports = WebSocketHandler
