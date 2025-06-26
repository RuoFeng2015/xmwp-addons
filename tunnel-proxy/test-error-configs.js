#!/usr/bin/env node

/**
 * 分离的错误配置测试
 * 测试配置验证是否正确拒绝无效配置
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

console.log('🧪 错误配置测试')
console.log('====================================')

const testConfigPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'config-dev.json')

// 确保目录存在
const configDir = path.dirname(testConfigPath)
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
}

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
    },
    expectedError: 'server_domain'
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
    },
    expectedError: 'server_host'
  },
  {
    name: '无效的连接类型',
    config: {
      connection_type: 'invalid',
      server_host: '114.132.237.146',
      server_port: 3080,
      username: 'admin',
      password: 'password123',
      client_id: 'ha-client-error3'
    },
    expectedError: 'connection_type'
  }
]

async function testErrorConfig(scenario) {
  return new Promise((resolve) => {
    console.log(`\n❌ ${scenario.name}`)
    console.log('配置:', JSON.stringify(scenario.config, null, 2))

    // 写入错误配置
    fs.writeFileSync(testConfigPath, JSON.stringify(scenario.config, null, 2))

    // 创建测试脚本
    const testScript = `
const { ConfigManager } = require('./rootfs/opt/tunnel-proxy/lib/config')
process.env.NODE_ENV = 'development'
try {
  ConfigManager.loadConfig()
  ConfigManager.validateConfig()
  console.log('ERROR: Should have failed')
  process.exit(0)
} catch (error) {
  console.log('SUCCESS: Caught error -', error.message)
  process.exit(1)
}
`

    const child = spawn('node', ['-e', testScript], {
      cwd: __dirname,
      stdio: 'pipe'
    })

    let output = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      output += data.toString()
    })

    child.on('close', (code) => {
      // code 1 表示正确捕获了错误
      if (code === 1 && output.includes('SUCCESS')) {
        console.log('✅ 正确检测到配置错误')
        resolve(true)
      } else {
        console.log('❌ 应该报错但没有报错')
        console.log('输出:', output)
        resolve(false)
      }
    })
  })
}

async function runAllTests() {
  let allPassed = true

  for (const scenario of errorScenarios) {
    const result = await testErrorConfig(scenario)
    if (!result) {
      allPassed = false
    }
  }

  if (allPassed) {
    console.log('\n🎉 所有错误配置测试通过!')
    console.log('💡 配置验证正确拒绝了无效配置')
  } else {
    console.log('\n❌ 部分错误配置测试失败')
    process.exit(1)
  }
}

runAllTests().catch(console.error)
