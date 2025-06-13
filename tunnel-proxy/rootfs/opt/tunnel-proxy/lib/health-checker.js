const Logger = require('./logger')
const { getConfig } = require('./config')

/**
 * 健康检查和监控类
 */
class HealthChecker {
  constructor(tunnelManager) {
    this.tunnelManager = tunnelManager
    this.startTime = Date.now()
    this.healthCheckInterval = null
  }

  /**
   * 获取系统健康状态
   */
  getHealthStatus() {
    const tunnelStatus = this.tunnelManager ? this.tunnelManager.getStatus() : null
    const config = getConfig()
    
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '1.0.8',
      memory: process.memoryUsage(),
      tunnel: tunnelStatus ? {
        connected: tunnelStatus.connected,
        authenticated: tunnelStatus.authenticated,
        status: tunnelStatus.status,
        last_heartbeat: tunnelStatus.last_heartbeat,
        connection_attempts: tunnelStatus.connection_attempts,
        last_successful_host: tunnelStatus.last_successful_host
      } : null,
      config: {
        server_host: config.server_host,
        server_port: config.server_port,
        local_ha_port: config.local_ha_port,
        proxy_port: config.proxy_port,
        client_id: config.client_id,
        log_level: config.log_level
      }
    }
  }

  /**
   * 启动定期健康检查
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 60000) // 每分钟检查一次

    Logger.info('健康检查服务已启动')
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      Logger.info('健康检查服务已停止')
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const status = this.getHealthStatus()
      
      // 检查内存使用情况
      const memoryUsage = status.memory.heapUsed / 1024 / 1024 // MB
      if (memoryUsage > 100) { // 超过100MB发出警告
        Logger.warn(`内存使用量较高: ${memoryUsage.toFixed(2)}MB`)
      }

      // 检查隧道连接状态
      if (status.tunnel && !status.tunnel.connected) {
        Logger.warn('隧道连接已断开')
      }

      // 检查上次心跳时间
      if (status.tunnel && status.tunnel.last_heartbeat) {
        const timeSinceHeartbeat = Date.now() - status.tunnel.last_heartbeat
        if (timeSinceHeartbeat > 300000) { // 5分钟没有心跳
          Logger.warn(`隧道心跳超时: ${Math.floor(timeSinceHeartbeat / 1000)}秒`)
        }
      }

      Logger.debug('健康检查完成')
    } catch (error) {
      Logger.error(`健康检查失败: ${error.message}`)
    }
  }

  /**
   * 测试本地HA连接
   */
  async testLocalHA() {
    if (!this.tunnelManager) {
      return false
    }

    try {
      Logger.info('正在测试本地Home Assistant连接...')
      const connectionOk = await this.tunnelManager.testLocalConnection()
      
      if (connectionOk) {
        const config = getConfig()
        Logger.info(
          `✅ 本地Home Assistant连接正常 (最佳地址: ${this.tunnelManager.lastSuccessfulHost}:${config.local_ha_port})`
        )
      } else {
        Logger.warn(`⚠️  无法连接到本地Home Assistant`)
        Logger.warn('请检查Home Assistant是否正在运行并确认网络配置')
      }

      return connectionOk
    } catch (error) {
      Logger.error(`本地HA连接测试失败: ${error.message}`)
      return false
    }
  }
}

module.exports = HealthChecker
