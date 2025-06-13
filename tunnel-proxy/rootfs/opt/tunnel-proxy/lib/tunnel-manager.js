const WebSocket = require('ws')
const http = require('http')
const crypto = require('crypto')
const Logger = require('./logger')
const { getConfig } = require('./config')
const TunnelClient = require('../tunnel-client')

/**
 * 隧道连接管理类
 */
class TunnelManager {
  constructor() {
    this.lastSuccessfulHost = null
    this.wsConnections = new Map() // WebSocket连接存储
    this.tunnelClient = null
    this.connectionStatus = 'disconnected'
    this.lastHeartbeat = null
  }

  async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        const config = getConfig()
        Logger.info(
          `正在连接到中转服务器: ${config.server_host}:${config.server_port}`
        )

        this.tunnelClient = new TunnelClient({
          host: config.server_host,
          port: config.server_port,
          username: config.username,
          password: config.password,
          clientId: config.client_id,
        })

        this.tunnelClient.on('connected', () => {
          Logger.info('隧道连接建立成功')
          this.connectionStatus = 'connecting'
        })

        this.tunnelClient.on('authenticated', () => {
          Logger.info('服务器认证成功')
          this.connectionStatus = 'connected'
          this.lastHeartbeat = Date.now()
          resolve()
        })

        this.tunnelClient.on('auth_failed', (reason) => {
          Logger.error(`服务器认证失败: ${reason}`)
          this.connectionStatus = 'auth_failed'
          reject(new Error(`认证失败: ${reason}`))
        })

        this.tunnelClient.on('disconnected', () => {
          Logger.warn('隧道连接已断开')
          this.connectionStatus = 'disconnected'
        })

        this.tunnelClient.on('reconnecting', (attempt) => {
          Logger.info(`正在尝试重连 (${attempt}/10)`)
          this.connectionStatus = 'reconnecting'
        })

        this.tunnelClient.on('error', (error) => {
          Logger.error(`隧道连接错误: ${error.message}`)
          this.connectionStatus = 'error'
          reject(error)
        })

        this.tunnelClient.on('proxy_request', (message) => {
          this.handleProxyRequest(message)
        })

        this.tunnelClient.on('websocket_upgrade', (message) => {
          this.handleWebSocketUpgrade(message)
        })

        this.tunnelClient.on('websocket_data', (message) => {
          this.handleWebSocketData(message)
        })

        this.tunnelClient.on('websocket_close', (message) => {
          Logger.error(`websocket_close: ${JSON.stringify(message)}`)
          this.handleWebSocketClose(message)
        })

        this.tunnelClient.connect()
      } catch (error) {
        Logger.error(`隧道连接失败: ${error.message}`)
        reject(error)
      }
    })
  }

  handleProxyRequest(message) {
    this.smartConnectToHA(message)
  }

  handleWebSocketUpgrade(message) {
    Logger.info(
      `🔄 处理WebSocket升级请求: ${message.upgrade_id} ${message.url}`
    )
    this.smartConnectWebSocketToHA(message)
  }

  handleWebSocketData(message) {
    const { upgrade_id, data } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection && wsConnection.socket) {
      try {
        const binaryData = Buffer.from(data, 'base64')
        Logger.info(
          `📨 WebSocket数据转发到HA: ${upgrade_id}, 长度: ${binaryData.length}, 内容: ${binaryData.toString()}`
        )
        wsConnection.socket.send(binaryData)
        Logger.info(`✅ WebSocket数据已发送到HA: ${upgrade_id}`)
      } catch (error) {
        Logger.error(`WebSocket数据转发失败: ${error.message}`)
      }
    } else {
      Logger.warn(`未找到WebSocket连接: ${upgrade_id}`)
    }
  }

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

  async smartConnectToHA(message) {
    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...this.getTargetHosts().filter((h) => h !== this.lastSuccessfulHost),
      ]
      : this.getTargetHosts()

    for (const hostname of targetHosts) {
      try {
        const success = await this.attemptHAConnection(message, hostname)
        if (success) {
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
          }
          return
        }
      } catch (error) {
        continue
      }
    }

    this.sendDetailedError(message, targetHosts)
  }

  getTargetHosts() {
    return [
      '127.0.0.1',
      'localhost',
      '192.168.6.170',
      'hassio.local',
      '172.30.32.2',
      '192.168.6.1',
      '192.168.1.170',
      '10.0.0.170',
    ]
  }

  attemptHAConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: message.url,
        method: message.method,
        headers: { ...message.headers },
        family: 4,
        timeout: 5000,
      }

      options.headers['host'] = `${hostname}:${config.local_ha_port}`
      delete options.headers['connection']
      delete options.headers['content-length']
      delete options.headers['transfer-encoding']
      delete options.headers['accept-encoding']

      if (!options.headers['user-agent']) {
        options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.0.8'
      }

      const proxyReq = http.request(options, (proxyRes) => {
        let responseBody = Buffer.alloc(0)
        proxyRes.on('data', (chunk) => {
          responseBody = Buffer.concat([responseBody, chunk])
        })
        proxyRes.on('end', () => {
          const response = {
            type: 'proxy_response',
            request_id: message.request_id,
            status_code: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody.toString('base64'),
          }

          this.tunnelClient.send(response)
          resolve(true)
        })
      })

      proxyReq.on('error', (error) => {
        reject(error)
      })

      proxyReq.on('timeout', () => {
        proxyReq.destroy()
        reject(new Error('连接超时'))
      })

      if (message.body) {
        proxyReq.write(message.body)
      }

      proxyReq.end()
    })
  }

  sendDetailedError(message, attemptedHosts) {
    const config = getConfig()
    const errorResponse = {
      type: 'proxy_response',
      request_id: message.request_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Home Assistant 连接错误</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
              .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              h1 { color: #d73527; margin-top: 0; }
              .info-box { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .error-box { background: #ffebee; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .success-box { background: #e8f5e8; padding: 15px; border-radius: 4px; margin: 15px 0; }
              ul { margin: 10px 0; padding-left: 20px; }
              .highlight { background: #fff3cd; padding: 2px 4px; border-radius: 2px; }
              .code { font-family: monospace; background: #f8f9fa; padding: 2px 4px; border-radius: 2px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚫 Home Assistant 连接失败</h1>
              
              <div class="error-box">
                <h3>❌ 问题描述</h3>
                <p>无法连接到本地的Home Assistant实例。代理服务器尝试了多个地址但都失败了。</p>
              </div>

              <div class="info-box">
                <h3>🔍 尝试的地址</h3>
                <ul>
                  ${attemptedHosts
          .map(
            (host) =>
              `<li><span class="code">${host}:${config.local_ha_port}</span></li>`
          )
          .join('')}
                </ul>
              </div>

              <div class="info-box">
                <h3>📋 当前配置</h3>
                <ul>
                  <li><strong>local_ha_port:</strong> <span class="code">${config.local_ha_port}</span></li>
                  <li><strong>已知HA地址:</strong> <span class="highlight">192.168.6.170:8123</span></li>
                  <li><strong>client_id:</strong> <span class="code">${config.client_id}</span></li>
                </ul>
              </div>

              <div class="success-box">
                <h3>🔧 解决方案</h3>
                <ol>
                  <li><strong>检查 Home Assistant 状态：</strong> 确认 HA 正在运行: <span class="code">http://192.168.6.170:8123</span></li>
                  <li><strong>检查网络配置：</strong> 编辑 <span class="code">configuration.yaml</span>: <span class="code">http: server_host: 0.0.0.0</span></li>
                  <li><strong>验证连接：</strong> 在 HA 设备上测试: <span class="code">curl http://127.0.0.1:8123</span></li>
                </ol>
              </div>

              <div class="info-box">
                <h3>🐛 调试信息</h3>
                <ul>
                  <li><strong>请求URL:</strong> <span class="code">${message.url}</span></li>
                  <li><strong>请求方法:</strong> <span class="code">${message.method}</span></li>
                  <li><strong>时间戳:</strong> <span class="code">${new Date().toISOString()}</span></li>
                  <li><strong>插件版本:</strong> <span class="code">1.0.7</span></li>
                </ul>
              </div>
            </div>
          </body>
        </html>
      `,
    }

    this.tunnelClient.send(errorResponse)
    Logger.error(`发送详细错误页面: ${message.request_id}`)
  }

  async smartConnectWebSocketToHA(message) {
    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...this.getTargetHosts().filter((h) => h !== this.lastSuccessfulHost),
      ]
      : this.getTargetHosts()

    for (const hostname of targetHosts) {
      try {
        const success = await this.attemptWebSocketConnection(message, hostname)
        if (success) {
          Logger.info(
            `✅ WebSocket成功连接到Home Assistant: ${hostname}:${getConfig().local_ha_port}`
          )
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
            Logger.info(`🎯 记住成功地址: ${hostname}`)
          }
          return
        }
      } catch (error) {
        continue
      }
    }

    this.sendWebSocketUpgradeError(message, targetHosts)
  }

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
        Logger.info(
          `✅ WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`
        )

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
        Logger.info(
          `📤 发送WebSocket升级响应: ${message.upgrade_id}, 状态: 101`
        )

        ws.on('message', (data) => {
          Logger.info(
            `📥 WebSocket收到HA消息: ${message.upgrade_id}, 长度: ${data.length}, 内容: ${data.toString()}`
          )

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

              // 1. 立即发送消息
              const sendSuccess = this.tunnelClient.send(response)
              if (!sendSuccess) {
                Logger.error(`❌ 认证消息发送失败: ${message.upgrade_id}`)
                return
              }

              // 2. 强制刷新网络缓冲区
              setImmediate(() => {
                if (this.tunnelClient.socket && typeof this.tunnelClient.socket._flush === 'function') {
                  this.tunnelClient.socket._flush()
                }

                // 3. 使用cork/uncork机制确保立即传输
                if (this.tunnelClient.socket && typeof this.tunnelClient.socket.uncork === 'function') {
                  this.tunnelClient.socket.cork()
                  process.nextTick(() => {
                    this.tunnelClient.socket.uncork()
                  })
                }
              })

              // 4. 对于auth_ok和auth_invalid消息，添加额外的确认机制
              if (messageType === 'auth_ok' || messageType === 'auth_invalid') {
                setTimeout(() => {
                  Logger.info(`🔄 再次确认${messageType}消息已发送: ${message.upgrade_id}`)
                  // 检查连接状态
                  if (this.tunnelClient && this.tunnelClient.isConnected) {
                    Logger.info(`✅ 隧道连接状态正常，${messageType}消息应已传输`)
                  } else {
                    Logger.warn(`⚠️  隧道连接异常，${messageType}消息可能未完全传输`)
                  }
                }, 50)
              }

              Logger.info(`📤 已立即转发WebSocket认证消息: ${message.upgrade_id}`)
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
        Logger.info(
          `🔴 WebSocket连接关闭: ${hostname}, upgrade_id: ${message.upgrade_id}, 代码: ${code}, 原因: ${reason || '无'}`
        )

        let closeAnalysis = ''
        let delayMs = 1000
        let needsAuthInvalidCompensation = false

        if (authenticationState.required) {
          if (authenticationState.response === 'invalid') {
            closeAnalysis = 'HA在认证失败后正常关闭连接（安全机制）'
            delayMs = 1500
          } else if (authenticationState.response === 'ok') {
            closeAnalysis = '认证成功后的连接关闭（可能是客户端主动断开或其他原因）'
            delayMs = 2000
          } else if (authenticationState.response === null && code === 1000) {
            closeAnalysis = 'HA在认证过程中关闭连接（可能是auth_invalid消息丢失或网络问题）'
            needsAuthInvalidCompensation = true
            delayMs = 1500
          } else {
            closeAnalysis = '认证过程中的异常关闭'
            delayMs = 1000
          }
        } else {
          if (code === 1000) {
            closeAnalysis = '正常关闭（可能是客户端主动断开）'
          } else if (code === 1006) {
            closeAnalysis = '异常关闭（网络问题或服务器错误）'
          } else {
            closeAnalysis = `关闭代码: ${code}`
          }
        }
        Logger.info(`ℹ️  ${closeAnalysis}`)

        // 特殊处理：当检测到可能的auth_invalid消息丢失时，主动发送认证失败消息
        // if (needsAuthInvalidCompensation) {
        //   Logger.warn(`🚨 检测到可能的auth_invalid消息丢失，主动发送认证失败消息`)

        //   try {
        //     // 构造auth_invalid消息
        //     const authInvalidMessage = {
        //       type: 'auth_invalid',
        //       message: '访问令牌无效或已过期'
        //     }

        //     const compensationResponse = {
        //       type: 'websocket_data',
        //       upgrade_id: message.upgrade_id,
        //       data: Buffer.from(JSON.stringify(authInvalidMessage)).toString('base64')
        //     }

        //     // 立即发送补偿消息
        //     this.tunnelClient.send(compensationResponse)
        //     Logger.info(`📤 已补发auth_invalid消息: ${message.upgrade_id}`)

        //     // 等待一小段时间确保消息传输
        //     setTimeout(() => {
        //       this.sendCloseNotification(message.upgrade_id)
        //     }, 500)
        //     return

        //   } catch (error) {
        //     Logger.error(`❌ 发送补偿auth_invalid消息失败: ${error.message}`)
        //   }
        // }

        // 正常的关闭处理
        setTimeout(() => {
          this.sendCloseNotification(message.upgrade_id)
        }, delayMs)
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

  async testLocalConnection() {
    const targetHosts = this.getTargetHosts()

    for (const hostname of targetHosts) {
      try {
        const success = await this.testSingleHost(hostname)
        if (success) {
          this.lastSuccessfulHost = hostname
          return true
        }
      } catch (error) {
        // continue
      }
    }

    return false
  }

  testSingleHost(hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: '/',
        method: 'GET',
        timeout: 3000,
        family: 4,
        headers: {
          host: `${hostname}:${config.local_ha_port}`,
          'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8',
        },
      }

      const req = http.request(options, (res) => {
        resolve(true)
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('连接超时'))
      })

      req.end()
    })
  }

  getStatus() {
    if (this.tunnelClient) {
      const status = this.tunnelClient.getStatus()
      return {
        connected: status.connected,
        authenticated: status.authenticated,
        last_heartbeat: status.last_heartbeat,
        connection_attempts: status.connection_attempts,
        status: this.connectionStatus,
        last_successful_host: this.lastSuccessfulHost,
      }
    }
    return {
      connected: false,
      authenticated: false,
      last_heartbeat: null,
      connection_attempts: 0,
      status: this.connectionStatus,
      last_successful_host: this.lastSuccessfulHost,
    }
  }

  disconnect() {
    if (this.tunnelClient) {
      this.tunnelClient.disconnect()
      this.tunnelClient = null
    }
    this.connectionStatus = 'disconnected'
  }
}

module.exports = TunnelManager
