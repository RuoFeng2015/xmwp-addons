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
      console.log('')
      console.log("%c Line:36 🥓 config", "color:#b03734", config);
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
      client_id: 'ha-client-001',
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

  static getConfig() {
    return config
  }

  static setConfig(newConfig) {
    config = { ...config, ...newConfig }
  }
}

module.exports = {
  ConfigManager,
  getConfig: () => config,
  CONFIG_PATH
}
