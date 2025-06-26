#!/usr/bin/env node

/**
 * 测试 TunnelManager 的快速发现集成
 */

const TunnelManager = require('./lib/tunnel-manager');

async function testTunnelManagerQuickDiscovery() {
  console.log('🧪 测试 TunnelManager 快速发现集成...\n');

  const tunnelManager = new TunnelManager();

  // 1. 测试智能主机获取
  console.log('1️⃣ 测试智能主机获取...');

  const startTime = Date.now();
  try {
    const hosts = await tunnelManager.getTargetHosts();
    const duration = Date.now() - startTime;

    console.log(`⏱️ 获取主机列表耗时: ${duration}ms`);
    console.log(`📊 获取到 ${hosts.length} 个主机:`);

    hosts.forEach((host, index) => {
      console.log(`   ${index + 1}. ${host}`);
    });

    if (tunnelManager.lastSuccessfulHost) {
      console.log(`\n🎯 最后成功的主机: ${tunnelManager.lastSuccessfulHost}`);
    }

  } catch (error) {
    console.error('❌ 获取主机列表出错:', error.message);
  }

  // 2. 测试本地连接测试
  console.log('\n2️⃣ 测试本地连接测试...');

  const testStartTime = Date.now();
  try {
    const success = await tunnelManager.testLocalConnection();
    const testDuration = Date.now() - testStartTime;

    console.log(`⏱️ 连接测试耗时: ${testDuration}ms`);
    console.log(`📊 连接测试结果: ${success ? '✅ 成功' : '❌ 失败'}`);

    if (success && tunnelManager.lastSuccessfulHost) {
      console.log(`🎯 成功连接的主机: ${tunnelManager.lastSuccessfulHost}`);
    }

  } catch (error) {
    console.error('❌ 连接测试出错:', error.message);
  }

  // 3. 获取发现的主机信息
  console.log('\n3️⃣ 获取发现的主机详细信息...');

  try {
    const discoveredInfo = tunnelManager.getDiscoveredHosts();

    console.log(`📊 发现统计:`);
    console.log(`   主机总数: ${discoveredInfo.hosts.length}`);
    console.log(`   推荐主机: ${discoveredInfo.recommendedHost || '无'}`);

    if (discoveredInfo.lastDiscovery) {
      const cacheAge = Math.round(discoveredInfo.cacheAge / 1000);
      console.log(`   缓存年龄: ${cacheAge}秒`);
    }

    if (discoveredInfo.hosts.length > 0) {
      console.log('\n🏠 发现的主机详情:');
      discoveredInfo.hosts.forEach((host, index) => {
        console.log(`   ${index + 1}. ${host.host}:${host.port}`);
        console.log(`      协议: ${host.protocol}`);
        console.log(`      置信度: ${host.confidence}%`);
        console.log(`      发现方法: ${host.discoveryMethod}`);
        if (host.responseTime) {
          console.log(`      响应时间: ${host.responseTime}ms`);
        }
        if (host.lastSuccessfulConnection) {
          const successAge = Math.round((Date.now() - host.lastSuccessfulConnection) / 1000);
          console.log(`      上次成功: ${successAge}秒前`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ 获取发现信息出错:', error.message);
  }

  // 4. 获取发现统计信息
  console.log('4️⃣ 获取发现统计信息...');

  try {
    const stats = tunnelManager.getDiscoveryStats();

    console.log(`📊 发现统计:`);
    console.log(`   总发现数: ${stats.totalDiscovered}`);
    console.log(`   平均置信度: ${stats.avgConfidence}%`);
    console.log(`   最后成功主机: ${stats.lastSuccessfulHost || '无'}`);

    if (stats.cacheAge) {
      const cacheAgeSec = Math.round(stats.cacheAge / 1000);
      console.log(`   缓存年龄: ${cacheAgeSec}秒`);
    }

    console.log('   按方法分类:');
    for (const [method, count] of Object.entries(stats.byMethod)) {
      console.log(`     ${method}: ${count} 个`);
    }

  } catch (error) {
    console.error('❌ 获取统计信息出错:', error.message);
  }
}

// 运行测试
testTunnelManagerQuickDiscovery().catch(console.error);
