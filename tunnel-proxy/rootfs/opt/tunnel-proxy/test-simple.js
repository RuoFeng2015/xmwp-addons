#!/usr/bin/env node

/**
 * 简化的模块测试脚本
 */

process.env.NODE_ENV = 'development'

console.log('🚀 开始逐个测试模块...\n')

async function testModulesStep() {
  try {
    // 1. 测试基础模块
    console.log('1️⃣ 测试基础模块...')
    const { ConfigManager } = require('./lib/config')
    ConfigManager.loadConfig()
    ConfigManager.validateConfig()
    console.log('✅ 配置模块 OK')

    const Logger = require('./lib/logger')
    Logger.info('测试日志')
    console.log('✅ 日志模块 OK')

    const AuthManager = require('./lib/auth')
    const token = AuthManager.generateToken('test')
    console.log('✅ 认证模块 OK')

    const ErrorHandler = require('./lib/error-handler')
    console.log('✅ 错误处理模块 OK')

    // 2. 测试复杂模块
    console.log('\n2️⃣ 测试复杂模块...')

    // 先测试TunnelClient是否能正常加载
    console.log('测试 TunnelClient...')
    const TunnelClient = require('./tunnel-client')
    console.log('✅ TunnelClient 加载成功')

    console.log('测试 TunnelManager...')
    const TunnelManager = require('./lib/tunnel-manager')
    console.log('✅ TunnelManager 加载成功')

    const tunnelManager = new TunnelManager()
    console.log('✅ TunnelManager 实例化成功')

    console.log('测试 HealthChecker...')
    const HealthChecker = require('./lib/health-checker')
    const healthChecker = new HealthChecker(tunnelManager)
    console.log('✅ HealthChecker 实例化成功')

    console.log('测试 ProxyServer...')
    const ProxyServer = require('./lib/proxy-server')
    const proxyServer = new ProxyServer(tunnelManager)
    console.log('✅ ProxyServer 实例化成功')

    console.log('\n🎉 所有模块测试通过！')

  } catch (error) {
    console.error('❌ 模块测试失败:', error.message)
    console.error('详细错误:', error.stack)
  }
}

testModulesStep()
