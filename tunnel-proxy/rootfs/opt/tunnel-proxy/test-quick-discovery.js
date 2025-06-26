#!/usr/bin/env node

/**
 * 测试快速发现功能
 */

const HANetworkDiscovery = require('./lib/ha-network-discovery');

async function testQuickDiscovery() {
  console.log('🚀 测试快速发现功能...\n');

  const discovery = new HANetworkDiscovery();

  // 1. 测试快速已知主机检测
  console.log('1️⃣ 测试快速已知主机检测...');

  const startTime = Date.now();
  try {
    const quickResults = await discovery.tryKnownHosts();
    const duration = Date.now() - startTime;

    console.log(`⏱️ 快速检测耗时: ${duration}ms`);
    console.log(`📊 发现结果: ${quickResults.length} 个实例`);

    if (quickResults.length > 0) {
      console.log('\n✅ 快速发现的 HA 实例:');
      quickResults.forEach((host, index) => {
        console.log(`   ${index + 1}. ${host.host}:${host.port}`);
        console.log(`      协议: ${host.protocol}`);
        console.log(`      置信度: ${host.confidence}%`);
        console.log(`      响应时间: ${host.responseTime}ms`);
        console.log('');
      });
    } else {
      console.log('❌ 快速检测未发现任何 HA 实例');
    }

  } catch (error) {
    console.error('❌ 快速检测出错:', error.message);
  }

  // 2. 测试完整的优化发现流程
  console.log('\n2️⃣ 测试完整的优化发现流程...');

  const fullStartTime = Date.now();
  try {
    const fullResults = await discovery.discoverHomeAssistant();
    const fullDuration = Date.now() - fullStartTime;

    console.log(`⏱️ 完整发现耗时: ${fullDuration}ms`);
    console.log(`📊 发现结果: ${fullResults.discovered.length} 个实例`);

    if (fullResults.recommendedHost) {
      console.log(`🎯 推荐主机: ${fullResults.recommendedHost.host}:${fullResults.recommendedHost.port}`);
    }

    if (fullResults.discovered.length > 0) {
      console.log('\n🏠 完整发现的 HA 实例:');
      fullResults.discovered.forEach((host, index) => {
        console.log(`   ${index + 1}. ${host.host}:${host.port}`);
        console.log(`      协议: ${host.protocol}`);
        console.log(`      置信度: ${host.confidence}%`);
        console.log(`      发现方法: ${host.discoveryMethod}`);
        if (host.responseTime) {
          console.log(`      响应时间: ${host.responseTime}ms`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ 完整发现出错:', error.message);
  }
}

// 运行测试
testQuickDiscovery().catch(console.error);
