const Logger = require('./logger')
const { getConfig } = require('./config')
const HANetworkDiscovery = require('./ha-network-discovery')

/**
 * 主机发现管理器
 */
class HostDiscoveryManager {
  constructor() {
    this.haDiscovery = new HANetworkDiscovery() // 网络发现实例
    this.discoveredHosts = [] // 发现的主机列表
    this.lastDiscoveryTime = null // 上次发现时间
    this.discoveryCache = new Map() // 发现结果缓存
    this.lastSuccessfulHost = null
  }

  /**
   * 获取目标主机列表 - 使用智能发现
   */
  async getTargetHosts() {
    // 检查是否需要重新发现（缓存5分钟）
    const cacheTimeout = 5 * 60 * 1000 // 5分钟
    const now = Date.now()

    if (this.lastDiscoveryTime &&
      (now - this.lastDiscoveryTime) < cacheTimeout &&
      this.discoveredHosts.length > 0) {
      Logger.debug('🔄 使用缓存的主机发现结果')
      return this.discoveredHosts.map(h => h.host)
    }

    try {
      Logger.info('🚀 开始智能发现 Home Assistant 实例...')
      const discoveryResults = await this.haDiscovery.discoverHomeAssistant()

      // 更新发现结果
      this.discoveredHosts = discoveryResults.discovered
      this.lastDiscoveryTime = now

      // 记录发现结果
      if (this.discoveredHosts.length > 0) {
        Logger.info(`✅ 发现 ${this.discoveredHosts.length} 个 Home Assistant 实例:`)
        this.discoveredHosts.forEach((host, index) => {
          Logger.info(`   ${index + 1}. ${host.host}:${host.port} (置信度: ${host.confidence}%, 方法: ${host.discoveryMethod})`)
        })

        if (discoveryResults.recommendedHost) {
          Logger.info(`🎯 推荐主机: ${discoveryResults.recommendedHost.host}:${discoveryResults.recommendedHost.port}`)
          // 更新最佳主机
          this.lastSuccessfulHost = discoveryResults.recommendedHost.host
        }
      } else {
        Logger.warn('⚠️  未发现任何 Home Assistant 实例，使用默认主机列表')
      }

      // 生成主机列表（包含发现的和默认的）
      const discoveredHostList = this.discoveredHosts.map(h => h.host)
      const defaultHosts = this.getDefaultTargetHosts()

      // 合并并去重，优先使用发现的主机
      const allHosts = [...new Set([...discoveredHostList, ...defaultHosts])]

      return allHosts

    } catch (error) {
      Logger.error(`智能发现失败: ${error.message}，使用默认主机列表`)
      return this.getDefaultTargetHosts()
    }
  }

  /**
   * 获取默认目标主机列表（作为后备）
   */
  getDefaultTargetHosts() {
    return [
      'homeassistant.local',  // Home Assistant OS 默认主机名 - 提升优先级
      '127.0.0.1',
      'localhost',
      '192.168.6.170',  // 当前已知的工作地址
      'hassio.local',
      'homeassistant.local.hass.io',
      'homeassistant',      // 简化版本
      '172.30.32.2',    // Docker 常见地址
      '192.168.6.1',
      '192.168.1.170',
      '192.168.1.100',
      '192.168.0.100',
      '10.0.0.170',
      '10.0.0.100'
    ]
  }

  /**
   * 更新成功连接的主机信息
   */
  updateSuccessfulHost(hostname) {
    this.lastSuccessfulHost = hostname

    // 更新发现缓存中的成功信息
    const hostInfo = this.discoveredHosts.find(h => h.host === hostname)
    if (hostInfo) {
      hostInfo.lastSuccessfulConnection = Date.now()
      hostInfo.confidence = Math.min(hostInfo.confidence + 10, 100)
    }
  }

  /**
   * 手动触发网络发现
   */
  async triggerNetworkDiscovery() {
    Logger.info('🔍 手动触发网络发现...')
    this.lastDiscoveryTime = null // 强制重新发现
    this.haDiscovery.clearCache()
    return await this.getTargetHosts()
  }

  /**
   * 获取发现的主机信息
   */
  getDiscoveredHosts() {
    return {
      hosts: this.discoveredHosts,
      lastDiscovery: this.lastDiscoveryTime,
      cacheAge: this.lastDiscoveryTime ? Date.now() - this.lastDiscoveryTime : null,
      recommendedHost: this.lastSuccessfulHost
    }
  }

  /**
   * 设置自定义主机
   */
  addCustomHost(host, port = 8123) {
    const customHost = {
      host: host,
      port: port,
      protocol: 'http',
      confidence: 90,
      discoveryMethod: 'manual',
      lastChecked: Date.now(),
      isCustom: true
    }

    // 添加到发现列表的开头（优先级最高）
    this.discoveredHosts.unshift(customHost)
    Logger.info(`➕ 添加自定义主机: ${host}:${port}`)
  }

  /**
   * 移除自定义主机
   */
  removeCustomHost(host) {
    const originalLength = this.discoveredHosts.length
    this.discoveredHosts = this.discoveredHosts.filter(h => !(h.host === host && h.isCustom))

    if (this.discoveredHosts.length < originalLength) {
      Logger.info(`➖ 移除自定义主机: ${host}`)
      return true
    }
    return false
  }

  /**
   * 获取网络发现统计信息
   */
  getDiscoveryStats() {
    const stats = {
      totalDiscovered: this.discoveredHosts.length,
      byMethod: {},
      avgConfidence: 0,
      lastSuccessfulHost: this.lastSuccessfulHost,
      cacheAge: this.lastDiscoveryTime ? Date.now() - this.lastDiscoveryTime : null
    }

    // 按发现方法分组统计
    for (const host of this.discoveredHosts) {
      const method = host.discoveryMethod || 'unknown'
      stats.byMethod[method] = (stats.byMethod[method] || 0) + 1
    }

    // 计算平均置信度
    if (this.discoveredHosts.length > 0) {
      const totalConfidence = this.discoveredHosts.reduce((sum, host) => sum + (host.confidence || 0), 0)
      stats.avgConfidence = Math.round(totalConfidence / this.discoveredHosts.length)
    }

    return stats
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.lastDiscoveryTime = null
    this.discoveryCache.clear()
    this.haDiscovery.clearCache()
    Logger.info('🗑️  已清除主机发现缓存')
  }

  /**
   * 获取最后成功的主机
   */
  getLastSuccessfulHost() {
    return this.lastSuccessfulHost
  }

  /**
   * 设置最后成功的主机
   */
  setLastSuccessfulHost(host) {
    this.lastSuccessfulHost = host
  }
}

module.exports = HostDiscoveryManager
