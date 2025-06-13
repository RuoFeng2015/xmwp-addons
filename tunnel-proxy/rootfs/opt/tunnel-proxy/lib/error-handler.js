const Logger = require('./logger')

/**
 * 错误处理和进程管理类
 */
class ErrorHandler {
  static setupGlobalErrorHandlers() {
    // 未捕获的异常处理
    process.on('uncaughtException', (error) => {
      Logger.error(`未捕获的异常: ${error.message}`)
      Logger.error(error.stack)
      
      // 在生产环境中，可以选择退出进程
      if (process.env.NODE_ENV === 'production') {
        process.exit(1)
      }
    })

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      Logger.error(`未处理的Promise拒绝: ${reason}`)
      Logger.error('Promise:', promise)
      
      // 在生产环境中，可以选择退出进程
      if (process.env.NODE_ENV === 'production') {
        process.exit(1)
      }
    })
  }

  static setupGracefulShutdown(app) {
    // SIGTERM信号处理（Docker容器停止）
    process.on('SIGTERM', () => {
      Logger.info('收到SIGTERM信号，正在优雅关闭...')
      app.stop().then(() => {
        process.exit(0)
      }).catch((error) => {
        Logger.error(`优雅关闭失败: ${error.message}`)
        process.exit(1)
      })
    })

    // SIGINT信号处理（Ctrl+C）
    process.on('SIGINT', () => {
      Logger.info('收到SIGINT信号，正在优雅关闭...')
      app.stop().then(() => {
        process.exit(0)
      }).catch((error) => {
        Logger.error(`优雅关闭失败: ${error.message}`)
        process.exit(1)
      })
    })
  }

  static handleStartupError(error) {
    Logger.error(`服务启动失败: ${error.message}`)
    Logger.error(error.stack)
    
    if (process.env.NODE_ENV !== 'development') {
      process.exit(1)
    } else {
      Logger.warn('开发环境：忽略启动错误，服务将继续运行')
    }
  }

  static handleConnectionError(error, context = '') {
    if (process.env.NODE_ENV === 'development') {
      Logger.warn(`开发环境：${context}连接失败，但服务将继续运行: ${error.message}`)
    } else {
      throw error
    }
  }
}

module.exports = ErrorHandler
