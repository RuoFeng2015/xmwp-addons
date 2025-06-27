const Logger = require('./logger')
const { getConfig, ConfigManager } = require('./config')
const TunnelClient = require('../tunnel-client')
const WebSocketHandler = require('./websocket-handler')
const HttpProxyHandler = require('./http-proxy-handler')
const HostDiscoveryManager = require('./host-discovery-manager')

/**
 * 隧道连接管理类
 */
class TunnelManager {
  constructor() {
    // 确保配置已加载
    try {
      ConfigManager.loadConfig();
    } catch (error) {
      Logger.debug('配置可能已经加载或配置文件不存在，继续初始化');
    }

    this.tunnelClient = null
    this.connectionStatus = 'disconnected'
    this.lastHeartbeat = null

    // 初始化处理器和管理器
    this.hostDiscovery = new HostDiscoveryManager()
    this.webSocketHandler = null // 将在连接建立后初始化
    this.httpProxyHandler = null // 将在连接建立后初始化
  }
  async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        const config = getConfig()
        const serverHost = ConfigManager.getServerHost()

        Logger.info(`正在连接到中转服务器: ${serverHost}:${config.server_port}`)
        Logger.info(`连接方式: ${ConfigManager.getConnectionInfo()}`)

        this.tunnelClient = new TunnelClient({
          host: serverHost,
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

          // 初始化处理器（需要tunnelClient实例）
          this.webSocketHandler = new WebSocketHandler(this.tunnelClient)
          this.httpProxyHandler = new HttpProxyHandler(this.tunnelClient)

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
    if (!this.httpProxyHandler) {
      Logger.error('HTTP代理处理器未初始化')
      return
    }

    this.httpProxyHandler.handleProxyRequest(
      message,
      () => this.hostDiscovery.getTargetHosts(),
      this.hostDiscovery.getLastSuccessfulHost()
    ).then(hostname => {
      if (hostname) {
        this.hostDiscovery.updateSuccessfulHost(hostname)
      }
    })
  }

  handleWebSocketUpgrade(message) {
    if (!this.webSocketHandler) {
      Logger.error('WebSocket处理器未初始化')
      return
    }

    Logger.info(`� 处理WebSocket升级请求: ${message.upgrade_id} ${message.url}`)

    this.webSocketHandler.handleWebSocketUpgrade(
      message,
      () => this.hostDiscovery.getTargetHosts(),
      this.hostDiscovery.getLastSuccessfulHost()
    ).then(hostname => {
      if (hostname) {
        this.hostDiscovery.updateSuccessfulHost(hostname)
      }
    })
  }

  handleWebSocketData(message) {
    if (!this.webSocketHandler) {
      Logger.error('WebSocket处理器未初始化')
      return
    }

    this.webSocketHandler.handleWebSocketData(message)
  }

  handleWebSocketClose(message) {
    if (!this.webSocketHandler) {
      Logger.error('WebSocket处理器未初始化')
      return
    }

    this.webSocketHandler.handleWebSocketClose(message)
  }
  async testLocalConnection() {
    Logger.info('🧪 测试本地 Home Assistant 连接...')

    if (!this.httpProxyHandler) {
      Logger.error('HTTP代理处理器未初始化')
      return false
    }

    try {
      const targetHosts = await this.hostDiscovery.getTargetHosts()

      for (const hostname of targetHosts) {
        try {
          const success = await this.httpProxyHandler.testSingleHost(hostname)
          if (success) {
            this.hostDiscovery.updateSuccessfulHost(hostname)
            Logger.info(`✅ 测试连接成功: ${hostname}`)
            return true
          }
        } catch (error) {
          Logger.debug(`❌ 测试连接失败: ${hostname} - ${error.message}`)
        }
      }

      Logger.warn('⚠️  所有主机测试连接失败')
      return false

    } catch (error) {
      Logger.error(`测试连接过程出错: ${error.message}`)
      return false
    }
  }

  getStatus() {
    if (this.tunnelClient) {
      const status = this.tunnelClient.getStatus()
      const hostDiscoveryStats = this.hostDiscovery.getDiscoveryStats()
      const wsStats = this.webSocketHandler ? this.webSocketHandler.getConnectionStats() : { activeConnections: 0, connections: [] }

      return {
        connected: status.connected,
        authenticated: status.authenticated,
        last_heartbeat: status.last_heartbeat,
        connection_attempts: status.connection_attempts,
        status: this.connectionStatus,
        last_successful_host: this.hostDiscovery.getLastSuccessfulHost(),
        discovery: hostDiscoveryStats,
        websocket: wsStats
      }
    }
    return {
      connected: false,
      authenticated: false,
      last_heartbeat: null,
      connection_attempts: 0,
      status: this.connectionStatus,
      last_successful_host: this.hostDiscovery.getLastSuccessfulHost(),
      discovery: this.hostDiscovery.getDiscoveryStats(),
      websocket: { activeConnections: 0, connections: [] }
    }
  }

  disconnect() {
    if (this.tunnelClient) {
      this.tunnelClient.disconnect()
      this.tunnelClient = null
    }
    this.connectionStatus = 'disconnected'
    this.webSocketHandler = null
    this.httpProxyHandler = null
  }

  /**
   * 手动触发网络发现
   */
  async triggerNetworkDiscovery() {
    return await this.hostDiscovery.triggerNetworkDiscovery()
  }

  /**
   * 获取发现的主机信息
   */
  getDiscoveredHosts() {
    return this.hostDiscovery.getDiscoveredHosts()
  }

  /**
   * 设置自定义主机
   */
  addCustomHost(host, port = 8123) {
    return this.hostDiscovery.addCustomHost(host, port)
  }

  /**
   * 移除自定义主机
   */
  removeCustomHost(host) {
    return this.hostDiscovery.removeCustomHost(host)
  }

  /**
   * 获取网络发现统计信息
   */
  getDiscoveryStats() {
    return this.hostDiscovery.getDiscoveryStats()
  }

  /**
   * 清除发现缓存
   */
  clearDiscoveryCache() {
    this.hostDiscovery.clearCache()
  }

  /**
   * 获取WebSocket连接统计
   */
  getWebSocketStats() {
    return this.webSocketHandler ? this.webSocketHandler.getConnectionStats() : { activeConnections: 0, connections: [] }
  }
}

module.exports = TunnelManager
