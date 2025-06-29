// 测试配置加载
const { ConfigManager } = require('./lib/config')
const Logger = require('./lib/logger')

console.log('🧪 开始配置测试...')

try {
  // 测试加载
  Logger.info('步骤1: 加载配置')
  ConfigManager.loadConfig()
  
  let config = ConfigManager.getConfig()
  Logger.info(`步骤1结果: ${JSON.stringify(config, null, 2)}`)
  
  // 测试验证
  Logger.info('步骤2: 验证配置')
  ConfigManager.validateConfig()
  
  config = ConfigManager.getConfig()
  Logger.info(`步骤2结果: ${JSON.stringify(config, null, 2)}`)
  
  // 检查connection_type
  Logger.info(`最终connection_type: ${config.connection_type} (类型: ${typeof config.connection_type})`)
  
  if (config.connection_type === null || config.connection_type === undefined) {
    Logger.error('❌ connection_type仍然为null/undefined')
  } else {
    Logger.info('✅ connection_type验证通过')
  }
  
} catch (error) {
  Logger.error(`测试失败: ${error.message}`)
  console.error(error)
}
