// 测试null值配置
const fs = require('fs')
const path = require('path')
const Logger = require('./lib/logger')

// 临时修改配置路径测试null值
const originalConfigPath = '/data/options.json'

console.log('🧪 测试null值配置处理...')

// 创建临时配置文件
const testNullPath = path.join(__dirname, 'test-null.json')
const tempConfigPath = '/tmp/test-options.json'

try {
  // 复制测试文件到临时位置
  const testContent = fs.readFileSync(testNullPath, 'utf8')
  console.log('测试配置内容:', testContent)
  
  // 模拟解析过程
  const testConfig = JSON.parse(testContent)
  console.log('解析后的配置:', testConfig)
  console.log('connection_type值:', testConfig.connection_type)
  console.log('connection_type类型:', typeof testConfig.connection_type)
  console.log('是否为null:', testConfig.connection_type === null)
  
  // 测试处理逻辑
  if (testConfig.connection_type === null || testConfig.connection_type === undefined) {
    console.log('✅ 检测到null值，应该被修复')
    testConfig.connection_type = 'domain'
    console.log('修复后的值:', testConfig.connection_type)
  } else {
    console.log('❌ null值检测失败')
  }
  
} catch (error) {
  console.error('测试失败:', error.message)
}
