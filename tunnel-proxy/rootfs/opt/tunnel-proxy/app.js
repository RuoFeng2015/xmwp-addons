const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const cors = require('@koa/cors')
const koaStatic = require('koa-static')
const http = require('http')
const httpProxy = require('http-proxy')
const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')
const net = require('net')
const TunnelClient = require('./tunnel-client')

// 配置文件路径
const CONFIG_PATH =
  process.env.NODE_ENV === 'development'
    ? path.join(__dirname, 'config-dev.json')
    : '/data/options.json'
const JWT_SECRET = 'ha-tunnel-proxy-secret-key-2023'

// 全局变量
let config = {}
let server = null
let proxy = null
let tunnelClient = null
let connectionStatus = 'disconnected'
let lastHeartbeat = null
let activeConnections = new Map()
let wsConnections = new Map() // WebSocket连接存储

/**
 * 日志工具类
 */
class Logger {
  static info(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`)
  }

  static error(message) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`)
  }

  static warn(message) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
  }

  static debug(message) {
    if (config.log_level === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`)
    }
  }
}

/**
 * 配置管理类
 */
class ConfigManager {
  static loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        if (process.env.NODE_ENV === 'development') {
          Logger.warn('开发环境：配置文件不存在，使用默认配置')
          config = this.getDefaultConfig()
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
          Logger.info('已创建开发配置文件: ' + CONFIG_PATH)
          return config
        } else {
          throw new Error(`配置文件不存在: ${CONFIG_PATH}`)
        }
      }

      const configData = fs.readFileSync(CONFIG_PATH, 'utf8')
      config = JSON.parse(configData)
      Logger.info('配置文件加载成功')
      return config
    } catch (error) {
      Logger.error(`配置文件加载失败: ${error.message}`)
      if (process.env.NODE_ENV === 'development') {
        Logger.info('开发环境：使用默认配置继续运行')
        config = this.getDefaultConfig()
        return config
      }
      process.exit(1)
    }
  }

  static getDefaultConfig() {
    return {
      server_host: 'localhost',
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password',
      client_id: 'ha-dev-client',
      proxy_port: 9001,
      log_level: 'debug',
    }
  }

  static validateConfig() {
    const required = [
      'server_host',
      'server_port',
      'username',
      'password',
      'client_id',
    ]
    for (const field of required) {
      if (!config[field]) {
        Logger.error(`缺少必要配置项: ${field}`)
        process.exit(1)
      }
    }

    config.local_ha_port = config.local_ha_port || 8123
    config.proxy_port = config.proxy_port || 9001
    config.log_level = config.log_level || 'info'

    Logger.info('配置验证通过')
  }
}

/**
 * 身份验证类
 */
class AuthManager {
  static generateToken(username) {
    const payload = {
      username: username,
      client_id: config.client_id,
      timestamp: Date.now(),
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      Logger.warn(`Token验证失败: ${error.message}`)
      return null
    }
  }

  static authenticate(username, password) {
    return username === config.username && password === config.password
  }
}

/**
 * 隧道连接管理类
 */
class TunnelManager {
  static lastSuccessfulHost = null
  static wsConnections = wsConnections // 引用全局WebSocket连接map

  static async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        Logger.info(
          `正在连接到中转服务器: ${config.server_host}:${config.server_port}`
        )

        tunnelClient = new TunnelClient({
          host: config.server_host,
          port: config.server_port,
          username: config.username,
          password: config.password,
          clientId: config.client_id,
        })

        tunnelClient.on('connected', () => {
          Logger.info('隧道连接建立成功')
          connectionStatus = 'connecting'
        })

        tunnelClient.on('authenticated', () => {
          Logger.info('服务器认证成功')
          connectionStatus = 'connected'
          lastHeartbeat = Date.now()
          resolve()
        })

        tunnelClient.on('auth_failed', (reason) => {
          Logger.error(`服务器认证失败: ${reason}`)
          connectionStatus = 'auth_failed'
          reject(new Error(`认证失败: ${reason}`))
        })

        tunnelClient.on('disconnected', () => {
          Logger.warn('隧道连接已断开')
          connectionStatus = 'disconnected'
        })

        tunnelClient.on('reconnecting', (attempt) => {
          Logger.info(`正在尝试重连 (${attempt}/10)`)
          connectionStatus = 'reconnecting'
        })

        tunnelClient.on('error', (error) => {
          Logger.error(`隧道连接错误: ${error.message}`)
          connectionStatus = 'error'
          reject(error)
        })
        tunnelClient.on('proxy_request', (message) => {
          this.handleProxyRequest(message)
        })

        tunnelClient.on('websocket_upgrade', (message) => {
          this.handleWebSocketUpgrade(message)
        })

        tunnelClient.on('websocket_data', (message) => {
          this.handleWebSocketData(message)
        })

        tunnelClient.on('websocket_close', (message) => {
          Logger.error(`websocket_close: ${message}`)
          this.handleWebSocketClose(message)
        })

        tunnelClient.connect()
      } catch (error) {
        Logger.error(`隧道连接失败: ${error.message}`)
        reject(error)
      }
    })
  }
  static handleProxyRequest(message) {
    // Logger.debug(`处理代理请求: ${message.request_id} ${message.method} ${message.url}`);
    this.smartConnectToHA(message)
  }
  static handleWebSocketUpgrade(message) {
    Logger.info(
      `🔄 处理WebSocket升级请求: ${message.upgrade_id} ${message.url}`
    )
    this.smartConnectWebSocketToHA(message)
  }
  static handleWebSocketData(message) {
    const { upgrade_id, data } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection && wsConnection.socket) {
      try {
        const binaryData = Buffer.from(data, 'base64')
        Logger.info(
          `📨 WebSocket数据转发到HA: ${upgrade_id}, 长度: ${binaryData.length
          }, 内容: ${binaryData.toString()}`
        )
        // 使用WebSocket的send方法而不是socket的write方法
        wsConnection.socket.send(binaryData)
        Logger.info(`✅ WebSocket数据已发送到HA: ${upgrade_id}`)
      } catch (error) {
        Logger.error(`WebSocket数据转发失败: ${error.message}`)
      }
    } else {
      Logger.warn(`未找到WebSocket连接: ${upgrade_id}`)
    }
  }
  static handleWebSocketClose(message) {
    const { upgrade_id } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection) {
      // Logger.debug(`关闭WebSocket连接: ${upgrade_id}`);
      if (wsConnection.socket) {
        wsConnection.socket.destroy()
      }
      this.wsConnections.delete(upgrade_id)
    }
  }
  static async smartConnectToHA(message) {
    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...this.getTargetHosts().filter((h) => h !== this.lastSuccessfulHost),
      ]
      : this.getTargetHosts()

    // Logger.debug(`智能连接Home Assistant，端口: ${config.local_ha_port}`);
    // Logger.debug(`尝试顺序: ${targetHosts.join(', ')}`);

    for (const hostname of targetHosts) {
      try {
        // Logger.debug(`尝试连接: ${hostname}:${config.local_ha_port}`);
        const success = await this.attemptHAConnection(message, hostname)
        if (success) {
          // Logger.info(`✅ 成功连接到Home Assistant: ${hostname}:${config.local_ha_port}`);
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
            // Logger.info(`🎯 记住成功地址: ${hostname}`);
          }
          return
        }
      } catch (error) {
        // Logger.debug(`❌ ${hostname} 连接失败: ${error.message}`);
        continue
      }
    }

    this.sendDetailedError(message, targetHosts)
  }

  static getTargetHosts() {
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
  static attemptHAConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const http = require('http')

      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: message.url,
        method: message.method,
        headers: { ...message.headers },
        family: 4,
        timeout: 5000, // 增加超时时间到5秒
      }

      // 设置正确的Host头，这对Home Assistant很重要
      options.headers['host'] = `${hostname}:${config.local_ha_port}` // 只删除可能导致冲突的头信息，保留必要的头
      delete options.headers['connection']
      delete options.headers['content-length'] // 会自动重新计算
      delete options.headers['transfer-encoding']
      delete options.headers['accept-encoding'] // 删除压缩编码请求，避免二进制数据损坏
      // 确保有正确的User-Agent
      if (!options.headers['user-agent']) {
        options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.0.8'
      }

      // Logger.debug(`${hostname} 请求头: ${JSON.stringify(options.headers, null, 2)}`);

      const proxyReq = http.request(options, (proxyRes) => {
        // Logger.info(`${hostname} 响应: HTTP ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
        // Logger.debug(`${hostname} 响应头: ${JSON.stringify(proxyRes.headers, null, 2)}`);

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
            body: responseBody.toString('base64'), // 使用base64编码保持二进制数据完整性
          }

          tunnelClient.send(response)
          // Logger.info(`✅ 代理成功: ${message.request_id} via ${hostname}:${config.local_ha_port} (${proxyRes.statusCode})`);
          resolve(true)
        })
      })

      proxyReq.on('error', (error) => {
        // Logger.debug(`${hostname} 请求错误: ${error.message}`);
        reject(error)
      })

      proxyReq.on('timeout', () => {
        proxyReq.destroy()
        reject(new Error('连接超时'))
      })

      // 发送请求体
      if (message.body) {
        proxyReq.write(message.body)
      }

      proxyReq.end()
    })
  }

  static sendDetailedError(message, attemptedHosts) {
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
                  <li><strong>local_ha_port:</strong> <span class="code">${config.local_ha_port
        }</span></li>
                  <li><strong>已知HA地址:</strong> <span class="highlight">192.168.6.170:8123</span></li>
                  <li><strong>client_id:</strong> <span class="code">${config.client_id
        }</span></li>
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
                  <li><strong>请求URL:</strong> <span class="code">${message.url
        }</span></li>
                  <li><strong>请求方法:</strong> <span class="code">${message.method
        }</span></li>
                  <li><strong>时间戳:</strong> <span class="code">${new Date().toISOString()}</span></li>
                  <li><strong>插件版本:</strong> <span class="code">1.0.7</span></li>
                </ul>
              </div>
            </div>
          </body>
        </html>
      `,
    }

    tunnelClient.send(errorResponse)
    Logger.error(`发送详细错误页面: ${message.request_id}`)
  }

  static getStatus() {
    if (tunnelClient) {
      const status = tunnelClient.getStatus()
      return {
        connected: status.connected,
        authenticated: status.authenticated,
        last_heartbeat: status.last_heartbeat,
        connection_attempts: status.connection_attempts,
        status: connectionStatus,
        last_successful_host: this.lastSuccessfulHost,
      }
    }
    return {
      connected: false,
      authenticated: false,
      last_heartbeat: null,
      connection_attempts: 0,
      status: connectionStatus,
      last_successful_host: this.lastSuccessfulHost,
    }
  }

  static disconnect() {
    if (tunnelClient) {
      tunnelClient.disconnect()
      tunnelClient = null
    }
    connectionStatus = 'disconnected'
  }
  static async testLocalConnection() {
    const targetHosts = this.getTargetHosts()

    for (const hostname of targetHosts) {
      try {
        // Logger.debug(`测试连接: ${hostname}:${config.local_ha_port}`);
        const success = await this.testSingleHost(hostname)
        if (success) {
          // Logger.info(`✅ 本地HA连接测试成功: ${hostname}:${config.local_ha_port}`);
          this.lastSuccessfulHost = hostname
          return true
        }
      } catch (error) {
        // Logger.debug(`测试 ${hostname} 失败: ${error.message}`);
      }
    }

    // Logger.error(`❌ 所有地址测试失败: ${targetHosts.join(', ')}`);
    return false
  }
  static testSingleHost(hostname) {
    return new Promise((resolve, reject) => {
      const http = require('http')

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
        // Logger.debug(`${hostname} 测试响应: HTTP ${res.statusCode} ${res.statusMessage}`);
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
  static async smartConnectWebSocketToHA(message) {
    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...this.getTargetHosts().filter((h) => h !== this.lastSuccessfulHost),
      ]
      : this.getTargetHosts()

    // Logger.debug(`智能连接WebSocket到Home Assistant，端口: ${config.local_ha_port}`);
    // Logger.debug(`尝试顺序: ${targetHosts.join(', ')}`);

    for (const hostname of targetHosts) {
      try {
        // Logger.debug(`尝试WebSocket连接: ${hostname}:${config.local_ha_port}`);
        const success = await this.attemptWebSocketConnection(message, hostname)
        if (success) {
          Logger.info(
            `✅ WebSocket成功连接到Home Assistant: ${hostname}:${config.local_ha_port}`
          )
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
            Logger.info(`🎯 记住成功地址: ${hostname}`)
          }
          return
        }
      } catch (error) {
        // Logger.debug(`❌ WebSocket ${hostname} 连接失败: ${error.message}`);
        continue
      }
    }

    this.sendWebSocketUpgradeError(message, targetHosts)
  }

  static attemptWebSocketConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const WebSocket = require('ws')

      // 构建WebSocket URL
      const protocol = config.local_ha_port === 443 ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${hostname}:${config.local_ha_port}${message.url}`

      // Logger.debug(`尝试WebSocket连接: ${wsUrl}`);

      // 准备头信息
      const headers = { ...message.headers }
      headers['host'] = `${hostname}:${config.local_ha_port}`
      delete headers['connection']
      delete headers['upgrade']

      const ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 5000,
      })

      let resolved = false
      ws.on('open', () => {
        if (resolved) return
        resolved = true
        Logger.info(
          `✅ WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`
        ) // 存储WebSocket连接
        this.wsConnections.set(message.upgrade_id, {
          socket: ws,
          hostname: hostname,
          timestamp: Date.now(),
        })

        // 计算正确的WebSocket Accept值
        const crypto = require('crypto')
        const websocketKey = message.headers['sec-websocket-key']
        const websocketAccept = websocketKey
          ? crypto
            .createHash('sha1')
            .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64')
          : 'dummy-accept-key'

        // 发送升级成功响应
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
        tunnelClient.send(response)
        Logger.info(
          `📤 发送WebSocket升级响应: ${message.upgrade_id}, 状态: 101`
        )        // 立即设置消息处理器，避免时序问题
        ws.on('message', (data) => {
          Logger.info(
            `📥 WebSocket收到HA消息: ${message.upgrade_id}, 长度: ${data.length
            }, 内容: ${data.toString()}`
          )

          // 检查是否是认证相关消息
          let isAuthMessage = false
          try {
            const parsed = JSON.parse(data.toString())
            if (parsed.type === 'auth_required') {
              Logger.info(`🔐 HA要求WebSocket认证: ${message.upgrade_id}`)
              isAuthMessage = true
            } else if (parsed.type === 'auth_invalid') {
              Logger.warn(`❌ WebSocket认证失败: ${message.upgrade_id} - 请检查浏览器中的访问令牌是否有效`)
              Logger.info(`💡 提示：需要在HA中生成长期访问令牌，并在浏览器中正确配置`)
              isAuthMessage = true
            } else if (parsed.type === 'auth_ok') {
              Logger.info(`✅ WebSocket认证成功: ${message.upgrade_id}`)
              isAuthMessage = true
            }
          } catch (e) {
            // 正常的非JSON消息
          }

          const response = {
            type: 'websocket_data',
            upgrade_id: message.upgrade_id,
            data: data.toString('base64'), // 使用base64编码传输
          }          // 确保消息转发完成，对于认证消息使用同步发送
          try {
            if (isAuthMessage) {
              // 认证消息立即发送，并确保网络缓冲区刷新
              tunnelClient.send(response)
              // 对于认证消息，使用setImmediate确保立即处理
              setImmediate(() => {
                // 强制刷新网络缓冲区
                if (tunnelClient.socket && typeof tunnelClient.socket._flush === 'function') {
                  tunnelClient.socket._flush()
                }
              })
              Logger.info(`📤 已立即转发WebSocket认证消息: ${message.upgrade_id}`)
            } else {
              tunnelClient.send(response)
              Logger.info(`📤 已转发WebSocket消息: ${message.upgrade_id}`)
            }
          } catch (error) {
            Logger.error(`❌ WebSocket消息转发失败: ${error.message}`)
          }
        })

        resolve(true)
      })
      ws.on('error', (error) => {
        Logger.error(
          `🔴 ws error: ${error}`
        )
        if (resolved) return
        resolved = true
        // Logger.debug(`WebSocket连接失败 ${hostname}: ${error.message}`);

        // 发送错误响应
        const errorResponse = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 502,
          headers: {},
        }
        tunnelClient.send(errorResponse)
        // Logger.debug(`发送WebSocket升级错误响应: ${message.upgrade_id}, 状态: 502`);

        reject(error)
      })
      ws.on('close', (code, reason) => {
        Logger.info(
          `🔴 WebSocket连接关闭: ${hostname}, upgrade_id: ${message.upgrade_id}, 代码: ${code}, 原因: ${reason || '无'}`
        )

        // 分析关闭原因
        if (code === 1000) {
          Logger.info(`ℹ️  正常关闭 - 可能是认证失败或客户端主动断开`)
        } else if (code === 1006) {
          Logger.warn(`⚠️  异常关闭 - 可能的网络问题或服务器错误`)
        }

        // 增加延迟到1000ms，确保所有消息处理完成，特别是auth_invalid消息
        setTimeout(() => {
          this.wsConnections.delete(message.upgrade_id)

          // 通知服务器连接关闭
          const response = {
            type: 'websocket_close',
            upgrade_id: message.upgrade_id,
          }

          try {
            tunnelClient.send(response)
            Logger.info(`📤 通知服务器WebSocket连接关闭: ${message.upgrade_id}`)
          } catch (error) {
            Logger.error(`❌ 发送关闭通知失败: ${error.message}`)
          }
        }, 1000) // 增加到1000ms延迟，确保最后的消息（如auth_invalid）能够转发完成
      })

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          reject(new Error('WebSocket连接超时'))
        }
      }, 5000)
    })
  }
  static setupWebSocketDataForwarding(ws, upgradeId) {
    // 此方法已被内联到 attemptWebSocketConnection 中，避免重复设置事件监听器
    // Logger.debug(`⚠️  setupWebSocketDataForwarding 被调用，但消息处理器已在连接时设置: ${upgradeId}`);
    // 原有的代码已经移到 ws.on('open') 事件处理器中
    // 这里保留方法签名以防其他地方调用，但不执行任何操作
  }

  static sendWebSocketUpgradeError(message, attemptedHosts) {
    const errorResponse = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }

    tunnelClient.send(errorResponse)
    Logger.error(`WebSocket升级失败，尝试的主机: ${attemptedHosts.join(', ')}`)
  }
}

class ProxyServer {
  static createProxyServer() {
    const app = new Koa()
    const router = new Router()

    app.use(cors())
    app.use(bodyParser())
    app.use(koaStatic(path.join(__dirname, 'public')))

    app.use(async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        Logger.error(`请求处理错误: ${err.message}`)
        ctx.status = err.status || 500
        ctx.body = { error: err.message }
      }
    })

    const authMiddleware = async (ctx, next) => {
      const token = ctx.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        ctx.status = 401
        ctx.body = { error: '缺少认证令牌' }
        return
      }

      const decoded = AuthManager.verifyToken(token)
      if (!decoded) {
        ctx.status = 401
        ctx.body = { error: '无效的认证令牌' }
        return
      }

      ctx.user = decoded
      await next()
    }

    router.get('/', async (ctx) => {
      ctx.redirect('/index.html')
    })
    router.post('/api/auth/login', async (ctx) => {
      const { username, password } = ctx.request.body

      if (!username || !password) {
        ctx.status = 400
        ctx.body = { error: '用户名和密码不能为空' }
        return
      }

      if (!AuthManager.authenticate(username, password)) {
        ctx.status = 401
        ctx.body = { error: '用户名或密码错误' }
        return
      }

      const token = AuthManager.generateToken(username)
      ctx.body = {
        token,
        user: { username },
        expires_in: 86400,
      }

      // Logger.info(`用户 ${username} 登录成功`);
    })

    router.get('/api/status', authMiddleware, async (ctx) => {
      const tunnelStatus = TunnelManager.getStatus()
      ctx.body = {
        status: tunnelStatus.status,
        connected: tunnelStatus.connected,
        authenticated: tunnelStatus.authenticated,
        last_heartbeat: tunnelStatus.last_heartbeat,
        connection_attempts: tunnelStatus.connection_attempts,
        last_successful_host: tunnelStatus.last_successful_host,
        active_connections: activeConnections.size,
        server_host: config.server_host,
        server_port: config.server_port,
        client_id: config.client_id,
        uptime: process.uptime(),
      }
    })

    router.get('/api/health', async (ctx) => {
      ctx.body = {
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.8',
      }
    })

    router.get('/api/config', authMiddleware, async (ctx) => {
      ctx.body = {
        server_host: config.server_host,
        server_port: config.server_port,
        local_ha_port: config.local_ha_port,
        proxy_port: config.proxy_port,
        client_id: config.client_id,
        log_level: config.log_level,
      }
    })

    app.use(router.routes())
    app.use(router.allowedMethods())

    return app
  }

  static createHttpProxy() {
    proxy = httpProxy.createProxyServer({
      target: `http://127.0.0.1:${config.local_ha_port}`,
      changeOrigin: true,
      ws: true,
      timeout: 30000,
    })

    proxy.on('error', (err, req, res) => {
      Logger.error(`代理错误: ${err.message}`)
      if (res && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('代理服务器错误')
      }
    })

    proxy.on('proxyReq', (proxyReq, req, res) => {
      Logger.debug(`代理请求: ${req.method} ${req.url}`)

      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`
      activeConnections.set(connectionId, {
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
      })
    })

    proxy.on('proxyRes', (proxyRes, req, res) => {
      Logger.debug(`代理响应: ${proxyRes.statusCode} ${req.url}`)

      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`
      activeConnections.delete(connectionId)
    })

    return proxy
  }
}

class TunnelProxyApp {
  static async start() {
    try {
      Logger.info('正在启动内网穿透代理服务...')

      ConfigManager.loadConfig()
      ConfigManager.validateConfig()

      const app = ProxyServer.createProxyServer()
      const httpProxy = ProxyServer.createHttpProxy()

      server = http.createServer(app.callback())

      server.on('request', (req, res) => {
        httpProxy.web(req, res)
      })
      server.on('upgrade', (req, socket, head) => {
        // Logger.debug('WebSocket升级请求');
        httpProxy.ws(req, socket, head)
      })

      server.listen(config.proxy_port, () => {
        Logger.info(`代理服务器已启动，监听端口: ${config.proxy_port}`)
      })

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          if (process.env.NODE_ENV === 'development') {
            Logger.warn(`端口 ${config.proxy_port} 被占用，尝试其他端口...`)
            config.proxy_port = config.proxy_port + 1
            setTimeout(() => {
              server.listen(config.proxy_port, () => {
                Logger.info(`代理服务器已启动，监听端口: ${config.proxy_port}`)
              })
            }, 1000)
          } else {
            Logger.error(`端口 ${config.proxy_port} 被占用`)
            throw error
          }
        } else {
          throw error
        }
      })

      try {
        await TunnelManager.connectToServer()
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          Logger.warn(
            `开发环境：中转服务器连接失败，但服务将继续运行: ${error.message}`
          )
        } else {
          throw error
        }
      }

      setInterval(() => {
        const now = Date.now()
        for (const [connectionId, connection] of activeConnections.entries()) {
          if (now - connection.timestamp > 300000) {
            activeConnections.delete(connectionId)
          }
        }
      }, 60000)

      Logger.info('内网穿透代理服务启动成功！')

      setTimeout(async () => {
        Logger.info('正在测试本地Home Assistant连接...')
        const connectionOk = await TunnelManager.testLocalConnection()
        if (connectionOk) {
          Logger.info(
            `✅ 本地Home Assistant连接正常 (最佳地址: ${TunnelManager.lastSuccessfulHost}:${config.local_ha_port})`
          )
        } else {
          Logger.warn(`⚠️  无法连接到本地Home Assistant`)
          Logger.warn('请检查Home Assistant是否正在运行并确认网络配置')
        }
      }, 2000)
    } catch (error) {
      Logger.error(`服务启动失败: ${error.message}`)
      if (process.env.NODE_ENV !== 'development') {
        process.exit(1)
      } else {
        Logger.warn('开发环境：忽略启动错误，服务将继续运行')
      }
    }
  }

  static async stop() {
    Logger.info('正在停止服务...')

    TunnelManager.disconnect()

    if (server) {
      server.close()
    }

    if (proxy) {
      proxy.close()
    }

    Logger.info('服务已停止')
  }
}

process.on('SIGTERM', () => {
  Logger.info('收到SIGTERM信号，正在优雅关闭...')
  TunnelProxyApp.stop().then(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  Logger.info('收到SIGINT信号，正在优雅关闭...')
  TunnelProxyApp.stop().then(() => {
    process.exit(0)
  })
})

process.on('uncaughtException', (error) => {
  Logger.error(`未捕获的异常: ${error.message}`)
  Logger.error(error.stack)
})

process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`未处理的Promise拒绝: ${reason}`)
})

if (require.main === module) {
  TunnelProxyApp.start()
}

module.exports = TunnelProxyApp
