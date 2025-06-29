const fs = require('fs')
const path = require('path')
const Logger = require('./logger')

// 配置文件路径
console.log("%c Line:8 🎂 process.env.NODE_ENV", "color:#f5ce50", process.env.NODE_ENV);
const CONFIG_PATH =
  process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', 'config-dev.json')
    : '/data/options.json'

let config = {}
let configChangeId = 0

// 配置变化追踪
function trackConfigChange(operation, newValue = null) {
  configChangeId++
  const timestamp = new Date().toISOString()
  Logger.info(`🔍 [配置追踪 #${configChangeId}] ${timestamp} - ${operation}`)
  
  if (newValue !== null) {
    Logger.info(`🔍 [配置追踪 #${configChangeId}] 新值: ${JSON.stringify(newValue, null, 2)}`)
  }
  
  if (config && config.connection_type !== undefined) {
    Logger.info(`🔍 [配置追踪 #${configChangeId}] 当前connection_type: ${config.connection_type} (${typeof config.connection_type})`)
  }
  
  // 打印调用栈以追踪谁在修改配置
  const stack = new Error().stack
  Logger.info(`🔍 [配置追踪 #${configChangeId}] 调用栈: ${stack.split('\n').slice(1, 4).join('\n')}`)
}

/**
 * 配置管理类
 */
class ConfigManager {
  static loadConfig() {
    trackConfigChange('loadConfig开始')
    
    try {
      Logger.info(`尝试加载配置文件: ${CONFIG_PATH}`)
      
      if (!fs.existsSync(CONFIG_PATH)) {
        if (process.env.NODE_ENV === 'development') {
          Logger.warn('开发环境：配置文件不存在，使用默认配置')
          config = this.getDefaultConfig()
          trackConfigChange('使用开发默认配置', config)
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
          Logger.info('已创建开发配置文件: ' + CONFIG_PATH)
          return config
        } else {
          throw new Error(`配置文件不存在: ${CONFIG_PATH}`)
        }
      }

      const configData = fs.readFileSync(CONFIG_PATH, 'utf8')
      Logger.info(`原始配置数据: ${configData}`)
      
      const rawConfig = JSON.parse(configData)
      Logger.info(`解析后的原始配置: ${JSON.stringify(rawConfig, null, 2)}`)
      
      // 合并默认配置以确保所有必要字段都存在
      const defaultConfig = this.getDefaultConfig()
      config = { ...defaultConfig, ...rawConfig }
      trackConfigChange('合并默认配置后', config)
      
      // 特别处理可能为null的字段
      if (config.connection_type === null || config.connection_type === undefined) {
        Logger.warn('connection_type为null，使用默认值domain')
        config.connection_type = 'domain'
        trackConfigChange('修复connection_type为domain')
      }
      
      Logger.info('配置文件加载成功')
      Logger.info(`最终合并配置: ${JSON.stringify(config, null, 2)}`)
      
      return config
    } catch (error) {
      Logger.error(`配置文件加载失败: ${error.message}`)
      Logger.error(`配置文件路径: ${CONFIG_PATH}`)
      
      if (process.env.NODE_ENV === 'development') {
        Logger.info('开发环境：使用默认配置继续运行')
        config = this.getDefaultConfig()
        trackConfigChange('错误时使用默认配置', config)
        return config
      }
      process.exit(1)
    }
  }
  static getDefaultConfig() {
    return {
      connection_type: 'domain',
      server_host: '',
      server_domain: 'tunnel.wzzhk.club',
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password',
      client_id: 'ha-client-001',
      proxy_port: 9001,
      log_level: 'info',
    }
  }
  static validateConfig() {
    trackConfigChange('validateConfig开始')
    
    // 首先检查配置是否已加载
    if (!config || Object.keys(config).length === 0) {
      Logger.error('配置未加载或为空，尝试重新加载...')
      this.loadConfig()
    }
    
    Logger.info('开始验证配置...')
    Logger.info(`当前配置: ${JSON.stringify(config, null, 2)}`)
    
    const required = [
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

    // 验证连接方式和对应的服务器地址
    // 处理connection_type为null、undefined或空值的情况
    if (!config.connection_type || config.connection_type === null || config.connection_type === undefined) {
      Logger.warn(`connection_type 值异常 (${config.connection_type})，使用默认值 "domain"`)
      config.connection_type = 'domain'
      trackConfigChange('validateConfig中修复connection_type')
    }

    Logger.info(`验证连接类型: ${config.connection_type}`)

    if (config.connection_type === 'ip') {
      if (!config.server_host) {
        Logger.error('使用IP连接时，必须配置 server_host')
        process.exit(1)
      }
    } else if (config.connection_type === 'domain') {
      if (!config.server_domain) {
        Logger.error('使用域名连接时，必须配置 server_domain')
        process.exit(1)
      }
    } else {
      Logger.error(`无效的连接类型: ${config.connection_type} (必须是 'ip' 或 'domain')`)
      Logger.error(`配置中的connection_type类型: ${typeof config.connection_type}`)
      Logger.error(`配置中的connection_type值: ${JSON.stringify(config.connection_type)}`)
      trackConfigChange('validateConfig失败')
      process.exit(1)
    }

    config.local_ha_port = config.local_ha_port || 8123
    config.proxy_port = config.proxy_port || 9001
    config.log_level = config.log_level || 'info'

    Logger.info('配置验证通过')
    Logger.info(`最终配置: ${JSON.stringify(config, null, 2)}`)
  }

  static getConfig() {
    trackConfigChange('getConfig被调用')
    
    // 添加配置访问时的安全检查
    if (!config || Object.keys(config).length === 0) {
      Logger.warn(`🔧 [配置访问] 配置为空，尝试重新加载`)
      this.loadConfig()
      this.validateConfig()
    }
    
    // 检查关键字段
    if (config.connection_type === null || config.connection_type === undefined) {
      Logger.warn(`🔧 [配置访问] connection_type异常(${config.connection_type})，重置为domain`)
      config.connection_type = 'domain'
      trackConfigChange('getConfig中修复connection_type')
    }
    
    return config
  }
  static setConfig(newConfig) {
    trackConfigChange('setConfig被调用', newConfig)
    
    Logger.info(`🔧 [配置更新] 正在更新配置`)
    Logger.info(`🔧 [配置更新] 原配置: ${JSON.stringify(config, null, 2)}`)
    Logger.info(`🔧 [配置更新] 新配置: ${JSON.stringify(newConfig, null, 2)}`)
    
    config = { ...config, ...newConfig }
    
    // 特别检查connection_type
    if (config.connection_type === null || config.connection_type === undefined) {
      Logger.warn(`🔧 [配置更新] connection_type在更新后变为${config.connection_type}，重置为domain`)
      config.connection_type = 'domain'
      trackConfigChange('setConfig中修复connection_type')
    }
    
    Logger.info(`🔧 [配置更新] 最终配置: ${JSON.stringify(config, null, 2)}`)
  }

  /**
   * 根据连接方式获取服务器地址
   */
  static getServerHost() {
    if (config.connection_type === 'domain') {
      return config.server_domain
    } else {
      return config.server_host
    }
  }

  /**
   * 获取连接信息描述
   */
  static getConnectionInfo() {
    const host = this.getServerHost()
    const type = config.connection_type === 'domain' ? '域名' : 'IP'
    return `${type}连接: ${host}:${config.server_port}`
  }
}

module.exports = {
  ConfigManager,
  getConfig: () => {
    // 使用ConfigManager的getConfig方法以确保一致性
    return ConfigManager.getConfig()
  },
  CONFIG_PATH
}
