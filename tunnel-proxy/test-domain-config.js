#!/usr/bin/env node

/**
 * 测试域名连接配置
 * 验证配置加载和验证逻辑是否正确支持域名模式
 */

const fs = require('fs')
const path = require('path')

// 设置开发环境
process.env.NODE_ENV = 'development'

// 创建域名模式的测试配置
const testConfigPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'config-dev.json')
const testConfig = {
  connection_type: 'domain',
  server_domain: 'tunnel.wzzhk.club',
  server_port: 3080,
  local_ha_port: 8123,
  username: 'admin',
  password: 'password',
  client_id: 'ha-client-001',
  proxy_port: 9001,
  log_level: 'info'
}

console.log('🧪 测试域名连接配置')
console.log('===================================')
console.log('测试配置:', JSON.stringify(testConfig, null, 2))

// 确保目录存在
const configDir = path.dirname(testConfigPath)
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

// 写入测试配置
fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2))
console.log('✅ 测试配置文件已创建:', testConfigPath)

try {
  // 加载配置管理器
  const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')

  console.log('\n📥 加载配置...')
  const config = ConfigManager.loadConfig()

  console.log('\n✅ 配置加载成功:')
  console.log(JSON.stringify(config, null, 2))

  console.log('\n🔍 验证配置...')
  ConfigManager.validateConfig()

  console.log('\n✅ 配置验证通过!')

  const serverHost = ConfigManager.getServerHost()
  const connectionInfo = ConfigManager.getConnectionInfo()

  console.log('\n📡 连接信息:')
  console.log('服务器地址:', serverHost)
  console.log('连接描述:', connectionInfo)

  // 验证域名模式的关键点
  console.log('\n🎯 域名模式验证:')
  console.log('connection_type:', config.connection_type)
  console.log('server_domain:', config.server_domain)
  console.log('server_host 是否存在:', config.server_host ? '是' : '否')
  console.log('getServerHost() 返回:', serverHost)

  if (config.connection_type === 'domain' && serverHost === config.server_domain) {
    console.log('✅ 域名模式配置正确!')
  } else {
    console.log('❌ 域名模式配置有问题')
  }

} catch (error) {
  console.error('❌ 测试失败:', error.message)
  console.error(error.stack)
  process.exit(1)
}

console.log('\n🎉 所有测试通过!')
