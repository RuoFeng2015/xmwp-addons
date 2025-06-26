#!/usr/bin/env node

/**
 * 测试混合配置场景
 * 当同时提供 server_host 和 server_domain 时，验证系统按照 connection_type 正确选择
 */

const fs = require('fs')
const path = require('path')

// 设置开发环境
process.env.NODE_ENV = 'development'

// 创建混合配置（像用户实际使用的配置）
const testConfigPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'config-dev.json')

console.log('🧪 测试混合配置场景')
console.log('=======================================')

// 测试场景1: connection_type = 'domain' 但同时提供了 server_host
console.log('\n📋 场景1: 域名模式 + 同时提供IP地址')
const testConfig1 = {
  connection_type: 'domain',
  server_host: '114.132.237.146',
  server_domain: 'tunnel.wzzhk.club',
  server_port: 3080,
  local_ha_port: 8123,
  username: 'admin',
  password: 'password',
  client_id: 'ha-client-001',
  proxy_port: 9001,
  log_level: 'info'
}

console.log('测试配置:', JSON.stringify(testConfig1, null, 2))

// 确保目录存在
const configDir = path.dirname(testConfigPath)
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

// 写入测试配置
fs.writeFileSync(testConfigPath, JSON.stringify(testConfig1, null, 2))

try {
  // 重新加载配置管理器（清除缓存）
  delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/config')]
  const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
  
  const config = ConfigManager.loadConfig()
  ConfigManager.validateConfig()
  
  const serverHost = ConfigManager.getServerHost()
  const connectionInfo = ConfigManager.getConnectionInfo()
  
  console.log('实际使用的服务器地址:', serverHost)
  console.log('连接描述:', connectionInfo)
  
  if (serverHost === testConfig1.server_domain && config.connection_type === 'domain') {
    console.log('✅ 正确使用域名连接')
  } else {
    console.log('❌ 域名模式配置错误')
    throw new Error('域名模式应该使用 server_domain')
  }

} catch (error) {
  console.error('❌ 场景1测试失败:', error.message)
  process.exit(1)
}

// 测试场景2: connection_type = 'ip' 但同时提供了 server_domain
console.log('\n📋 场景2: IP模式 + 同时提供域名')
const testConfig2 = {
  connection_type: 'ip',
  server_host: '114.132.237.146',
  server_domain: 'tunnel.wzzhk.club',
  server_port: 3080,
  local_ha_port: 8123,
  username: 'admin',
  password: 'password',
  client_id: 'ha-client-001',
  proxy_port: 9001,
  log_level: 'info'
}

console.log('测试配置:', JSON.stringify(testConfig2, null, 2))

// 写入测试配置
fs.writeFileSync(testConfigPath, JSON.stringify(testConfig2, null, 2))

try {
  // 重新加载配置管理器（清除缓存）
  delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/config')]
  const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
  
  const config = ConfigManager.loadConfig()
  ConfigManager.validateConfig()
  
  const serverHost = ConfigManager.getServerHost()
  const connectionInfo = ConfigManager.getConnectionInfo()
  
  console.log('实际使用的服务器地址:', serverHost)
  console.log('连接描述:', connectionInfo)
  
  if (serverHost === testConfig2.server_host && config.connection_type === 'ip') {
    console.log('✅ 正确使用IP连接')
  } else {
    console.log('❌ IP模式配置错误')
    throw new Error('IP模式应该使用 server_host')
  }

} catch (error) {
  console.error('❌ 场景2测试失败:', error.message)
  process.exit(1)
}

console.log('\n🎉 混合配置测试全部通过!')
console.log('💡 系统正确根据 connection_type 选择相应的服务器地址')
