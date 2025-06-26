#!/usr/bin/env node

/**
 * 测试单个主机验证逻辑
 */

const TunnelManager = require('./lib/tunnel-manager');
const HANetworkDiscovery = require('./lib/ha-network-discovery');
const { ConfigManager } = require('./lib/config');

async function testSingleHostValidation() {
  console.log('🧪 测试单个主机验证逻辑...\n');

  // 首先初始化配置
  console.log('📤 初始化配置...');
  ConfigManager.loadConfig();
  console.log('✅ 配置初始化完成\n');

  const tunnelManager = new TunnelManager();
  const discovery = new HANetworkDiscovery();

  const testHosts = [
    'homeassistant.local',
    '192.168.6.170'
  ];

  for (const host of testHosts) {
    console.log(`🔍 测试主机: ${host}:8123`);

    // 1. 使用 HANetworkDiscovery 检测
    console.log('   1️⃣ HANetworkDiscovery 检测:');
    try {
      const discoveryResult = await discovery.checkHostForHA(host, 8123, 3000);
      if (discoveryResult) {
        console.log(`      ✅ 成功: ${discoveryResult.protocol}, 置信度: ${discoveryResult.confidence}%`);
        console.log(`      响应时间: ${discoveryResult.responseTime}ms`);
      } else {
        console.log(`      ❌ 失败: 未识别为HA`);
      }
    } catch (error) {
      console.log(`      ❌ 错误: ${error.message}`);
    }

    // 2. 使用 TunnelManager 检测
    console.log('   2️⃣ TunnelManager 检测:');
    try {
      const tunnelResult = await tunnelManager.testSingleHost(host);
      if (tunnelResult) {
        console.log(`      ✅ 成功: 通过验证`);
      } else {
        console.log(`      ❌ 失败: 未通过验证`);
      }
    } catch (error) {
      console.log(`      ❌ 错误: ${error.message}`);
    }

    console.log('');
  }
}

// 运行测试
testSingleHostValidation().catch(console.error);
