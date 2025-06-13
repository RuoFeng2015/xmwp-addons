const http = require('http')
const Logger = require('./lib/logger')
const { ConfigManager } = require('./lib/config')
const TunnelManager = require('./lib/tunnel-manager')
const ProxyServer = require('./lib/proxy-server')
const ErrorHandler = require('./lib/error-handler')

// 全局变量
let server = null
let tunnelManager = null
let proxyServer = null

/**
 * 隧道代理应用主类
 */
class TunnelProxyApp {
  static async start() {
    try {
      Logger.info('正在启动内网穿透代理服务...')

      // 设置全局错误处理
      ErrorHandler.setupGlobalErrorHandlers()

      // 加载和验证配置
      ConfigManager.loadConfig()
      ConfigManager.validateConfig()

      // 创建隧道管理器
      tunnelManager = new TunnelManager()      // 创建代理服务器
      proxyServer = new ProxyServer(tunnelManager)
      server = proxyServer.createServer()

      // 启动服务器
      const config = ConfigManager.getConfig()
      server.listen(config.proxy_port, () => {
        Logger.info(`代理服务器已启动，监听端口: ${config.proxy_port}`)
      })

      // 处理端口占用错误
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

      // 连接到隧道服务器
      try {
        await tunnelManager.connectToServer()
      } catch (error) {
        ErrorHandler.handleConnectionError(error, '中转服务器')
      }

      // 启动连接清理和健康检查任务
      proxyServer.startConnectionCleanup()

      Logger.info('内网穿透代理服务启动成功！')

      // 测试本地HA连接
      setTimeout(async () => {
        await proxyServer.healthChecker.testLocalHA()
      }, 2000)

      // 设置优雅关闭
      ErrorHandler.setupGracefulShutdown(this)

    } catch (error) {
      ErrorHandler.handleStartupError(error)
    }
  }

  static async stop() {
    Logger.info('正在停止服务...')

    if (tunnelManager) {
      tunnelManager.disconnect()
    }

    if (server) {
      server.close()
    }

    if (proxyServer) {
      proxyServer.close()
    }

    Logger.info('服务已停止')
  }
}

if (require.main === module) {
  TunnelProxyApp.start()
}

module.exports = TunnelProxyApp
