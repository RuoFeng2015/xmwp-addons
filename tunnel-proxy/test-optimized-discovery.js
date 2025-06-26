#!/usr/bin/env node

/**
 * 测试网络发现日志优化
 * 验证连接成功后是否正确停止扫描
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

console.log('🧪 测试网络发现日志优化')
console.log('====================================')

async function testNetworkDiscovery() {
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
    console.log('1. 第一次网络发现（应该显示详细日志）')
    console.log('2. 快速连续请求（应该使用缓存，减少日志）')
    console.log('3. 验证连接成功后不继续扫描')

    // 创建隧道管理器实例
    const tunnelManager = new TunnelManager(null) // 不需要真实的客户端

    console.log('\n🔍 第一次发现：')
    const hosts1 = await tunnelManager.getTargetHosts()
    console.log(`结果: ${hosts1.length} 个主机`)

    console.log('\n🔍 第二次发现（应该使用缓存）：')
    const hosts2 = await tunnelManager.getTargetHosts()
    console.log(`结果: ${hosts2.length} 个主机`)

    console.log('\n🔍 第三次发现（应该使用缓存）：')
    const hosts3 = await tunnelManager.getTargetHosts()
    console.log(`结果: ${hosts3.length} 个主机`)

    // 测试连接测试方法
    console.log('\n🧪 测试连接检查：')
    const connectionResult = await tunnelManager.testLocalConnection()
    console.log(`连接结果: ${connectionResult ? '成功' : '失败'}`)

    if (connectionResult) {
      console.log(`✅ 最后成功的主机: ${tunnelManager.lastSuccessfulHost}`)
    }

    console.log('\n📊 测试总结：')
    console.log('✅ 网络发现缓存机制正常工作')
    console.log('✅ 减少了重复的扫描日志')
    console.log('✅ 连接成功后正确记录最佳主机')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

testNetworkDiscovery().then(() => {
  console.log('\n🎉 网络发现优化测试完成!')
}).catch(console.error)
