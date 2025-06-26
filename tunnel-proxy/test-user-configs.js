#!/usr/bin/env node

/**
 * 完整的用户配置测试
 * 测试用户实际配置场景，确保配置验证和启动流程正常
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 完整用户配置测试')
console.log('====================================')

// 设置开发环境
process.env.NODE_ENV = 'development'

const testConfigPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'config-dev.json')

// 测试用户配置场景
const userScenarios = [
  {
    name: '场景1: 仅域名配置（推荐配置）',
    config: {
      connection_type: 'domain',
      server_domain: 'tunnel.wzzhk.club',
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-domain',
      proxy_port: 9001,
      log_level: 'info'
    }
  },
  {
    name: '场景2: 仅IP配置',
    config: {
      connection_type: 'ip',
      server_host: '114.132.237.146',
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-ip',
      proxy_port: 9001,
      log_level: 'info'
    }
  },
  {
    name: '场景3: 用户填写了两个地址但选择域名模式',
    config: {
      connection_type: 'domain',
      server_host: '114.132.237.146',  // 用户误填了，但应该被忽略
      server_domain: 'tunnel.wzzhk.club',
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-mixed',
      proxy_port: 9001,
      log_level: 'info'
    }
  },
  {
    name: '场景4: 用户填写了两个地址但选择IP模式',
    config: {
      connection_type: 'ip',
      server_host: '114.132.237.146',
      server_domain: 'tunnel.wzzhk.club',  // 用户误填了，但应该被忽略
      server_port: 3080,
      local_ha_port: 8123,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-mixed2',
      proxy_port: 9001,
      log_level: 'info'
    }
  }
]

const expectedResults = [
  { type: 'domain', host: 'tunnel.wzzhk.club' },
  { type: 'ip', host: '114.132.237.146' },
  { type: 'domain', host: 'tunnel.wzzhk.club' },
  { type: 'ip', host: '114.132.237.146' }
]

// 确保目录存在
const configDir = path.dirname(testConfigPath)
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

let allTestsPassed = true

for (let i = 0; i < userScenarios.length; i++) {
  const scenario = userScenarios[i]
  const expected = expectedResults[i]
  
  console.log(`\n📋 ${scenario.name}`)
  console.log('配置内容:', JSON.stringify(scenario.config, null, 2))
  
  try {
    // 写入测试配置
    fs.writeFileSync(testConfigPath, JSON.stringify(scenario.config, null, 2))
    
    // 清除模块缓存
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/config')]
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/logger')]
    
    // 加载配置管理器
    const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
    
    // 加载和验证配置
    const config = ConfigManager.loadConfig()
    ConfigManager.validateConfig()
    
    // 获取实际使用的服务器地址
    const actualHost = ConfigManager.getServerHost()
    const connectionInfo = ConfigManager.getConnectionInfo()
    
    console.log('实际服务器地址:', actualHost)
    console.log('连接信息:', connectionInfo)
    
    // 验证结果
    if (config.connection_type === expected.type && actualHost === expected.host) {
      console.log('✅ 测试通过')
    } else {
      console.log('❌ 测试失败')
      console.log(`期望: ${expected.type} -> ${expected.host}`)
      console.log(`实际: ${config.connection_type} -> ${actualHost}`)
      allTestsPassed = false
    }
    
  } catch (error) {
    console.error(`❌ ${scenario.name} 失败:`, error.message)
    allTestsPassed = false
  }
}

// 测试错误配置
console.log('\n📋 错误配置测试')

const errorScenarios = [
  {
    name: '缺少域名配置',
    config: {
      connection_type: 'domain',
      // server_domain: 'tunnel.wzzhk.club',  // 故意缺失
      server_port: 3080,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-error1'
    }
  },
  {
    name: '缺少IP配置',
    config: {
      connection_type: 'ip',
      // server_host: '114.132.237.146',  // 故意缺失
      server_port: 3080,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-error2'
    }
  }
]

for (const scenario of errorScenarios) {
  console.log(`\n❌ ${scenario.name}`)
  
  try {
    fs.writeFileSync(testConfigPath, JSON.stringify(scenario.config, null, 2))
    
    // 清除模块缓存
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/config')]
    delete require.cache[require.resolve('./rootfs/opt/tunnel-proxy/lib/logger')]
    
    const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
    
    ConfigManager.loadConfig()
    ConfigManager.validateConfig()
    
    console.log('❌ 应该报错但没有报错')
    allTestsPassed = false
    
  } catch (error) {
    console.log('✅ 正确检测到配置错误:', error.message)
  }
}

if (allTestsPassed) {
  console.log('\n🎉 所有测试通过!')
  console.log('💡 配置系统正确支持 connection_type 条件验证')
  console.log('💡 用户可以安全地只填写对应的服务器地址字段')
} else {
  console.log('\n❌ 部分测试失败')
  process.exit(1)
}
