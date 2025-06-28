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

/**
 * 配置管理类
 */
class ConfigManager {
  static loadConfig() {
    try {
      Logger.info(`尝试加载配置文件: ${CONFIG_PATH}`)
      
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
      Logger.info(`原始配置数据: ${configData}`)
      
      config = JSON.parse(configData)
      Logger.info('配置文件加载成功')
      Logger.info(`已加载配置: ${JSON.stringify(config, null, 2)}`)
      
      return config
    } catch (error) {
      Logger.error(`配置文件加载失败: ${error.message}`)
      Logger.error(`配置文件路径: ${CONFIG_PATH}`)
      
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
    // 首先检查配置是否已加载
    if (!config || Object.keys(config).length === 0) {
      Logger.error('配置未加载或为空，尝试重新加载...')
      this.loadConfig()
    }
    
    Logger.info('开始验证配置...')
    console.log('%c 当前配置:', 'color:#e6a23c', config)
    
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
    if (!config.connection_type) {
      Logger.warn('connection_type 未设置，使用默认值 "domain"')
      config.connection_type = 'domain'
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
      process.exit(1)
    }

    config.local_ha_port = config.local_ha_port || 8123
    config.proxy_port = config.proxy_port || 9001
    config.log_level = config.log_level || 'info'

    Logger.info('配置验证通过')
    Logger.info(`最终配置: ${JSON.stringify(config, null, 2)}`)
  }

  static getConfig() {
    return config
  }
  static setConfig(newConfig) {
    config = { ...config, ...newConfig }
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
  getConfig: () => config,
  CONFIG_PATH
}
