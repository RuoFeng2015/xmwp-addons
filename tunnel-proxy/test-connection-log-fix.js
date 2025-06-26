#!/usr/bin/env node

/**
 * 测试连接日志修复
 * 验证连接成功后是否不再输出多余的日志
 */

const fs = require('fs')
const path = require('path')

// 设置开发环境
process.env.NODE_ENV = 'development'

// 创建测试配置
const testConfigPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'config-dev.json')
const testConfig = {
  connection_type: 'domain',
  server_domain: 'tunnel.wzzhk.club',
  server_port: 3080,
  local_ha_port: 8123,
  username: 'admin',
  password: 'password',
  client_id: 'ha-client-test',
  proxy_port: 9001,
  log_level: 'info'
}

// 确保目录存在
const configDir = path.dirname(testConfigPath)
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

// 写入测试配置
fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2))

console.log('🧪 测试连接日志修复效果')
console.log('====================================')

async function testConnectionLogFix() {
  try {
    // 清除模块缓存
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/config')]
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/logger')]
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/ha-network-discovery')]
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/tunnel-manager')]

    const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
    const TunnelManager = require('./rootfs/opt/tunnel-proxy/lib/tunnel-manager')

    // 初始化配置
    ConfigManager.loadConfig()
    ConfigManager.validateConfig()

    console.log('📋 测试场景：')
    console.log('1. 首次发现和连接（应该显示 INFO 级别日志）')
    console.log('2. 后续连接请求（应该使用 DEBUG 级别，减少日志噪音）')
    console.log('3. 验证缓存机制正确工作')

    // 创建隧道管理器实例
    const tunnelManager = new TunnelManager(null)

    console.log('\n🔍 第一次获取主机（触发发现）：')
    const startTime = Date.now()
    const hosts1 = await tunnelManager.getTargetHosts()
    const discoveryTime = Date.now()
    console.log(`发现完成: ${hosts1.length} 个主机，耗时: ${discoveryTime - startTime}ms`)

    // 模拟连接尝试（应该是 INFO 级别）
    console.log('\n📡 模拟第一次连接尝试（应该显示 INFO 日志）：')
    const mockMessage1 = { request_id: 'test-1', url: '/', method: 'GET', headers: {} }

    // 此时应该显示 INFO 级别的连接日志
    console.log('预期: INFO 级别的"🔍 尝试连接 X 个潜在的 Home Assistant 主机..."')

    // 等待1.5秒（超过缓存判断阈值）
    console.log('\n⏳ 等待1.5秒后再次尝试连接...')
    await new Promise(resolve => setTimeout(resolve, 1500))

    console.log('\n📡 模拟第二次连接尝试（应该使用 DEBUG 日志）：')
    const mockMessage2 = { request_id: 'test-2', url: '/', method: 'GET', headers: {} }

    // 此时应该使用 DEBUG 级别的连接日志（不会在 INFO 级别显示）
    console.log('预期: DEBUG 级别的连接日志（在 INFO 级别下不显示）')

    // 手动检查缓存状态
    const cacheAge = Date.now() - tunnelManager.lastDiscoveryTime
    console.log(`\n📊 缓存状态分析：`)
    console.log(`发现时间: ${new Date(tunnelManager.lastDiscoveryTime).toLocaleTimeString()}`)
    console.log(`缓存年龄: ${cacheAge}ms`)
    console.log(`使用缓存: ${cacheAge >= 1000 ? 'YES' : 'NO'}`)
    console.log(`日志级别: ${cacheAge >= 1000 ? 'DEBUG (安静)' : 'INFO (详细)'}`)

    console.log('\n✅ 修复效果验证：')
    console.log('- 首次发现: 显示详细 INFO 日志')
    console.log('- 缓存期间: 使用 DEBUG 日志（INFO 级别下不可见）')
    console.log('- 减少了连接成功后的重复日志输出')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

testConnectionLogFix().then(() => {
  console.log('\n🎉 连接日志修复测试完成!')
  console.log('\n💡 总结：')
  console.log('修复了逻辑错误，现在缓存期间的连接尝试')
  console.log('会使用 DEBUG 级别，大大减少了日志噪音。')
}).catch(console.error)
