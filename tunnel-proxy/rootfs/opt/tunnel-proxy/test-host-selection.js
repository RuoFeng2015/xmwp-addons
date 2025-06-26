#!/usr/bin/env node

/**
 * 直接测试已知主机的检测和排序逻辑
 */

const HANetworkDiscovery = require('./lib/ha-network-discovery');

async function testKnownHosts() {
  console.log('🧪 直接测试已知主机的检测和排序逻辑...\n');

  const discovery = new HANetworkDiscovery();

  // 模拟发现结果（基于之前的日志）
  const mockDiscoveredHosts = [
    {
      host: '172.30.32.1',
      port: 8123,
      protocol: 'http',
      confidence: 50, // 降低置信度，因为这不是真正的HA
      discoveryMethod: 'http-check',
      responseTime: 50
    },
    {
      host: 'homeassistant.local',
      port: 8123,
      protocol: 'http',
      confidence: 100,
      discoveryMethod: 'common-host',
      responseTime: 25
    },
    {
      host: '192.168.6.170',
      port: 8123,
      protocol: 'http',
      confidence: 100,
      discoveryMethod: 'common-host',
      responseTime: 15
    }
  ];

  console.log('📋 模拟发现的主机列表:');
  mockDiscoveredHosts.forEach((host, index) => {
    console.log(`   ${index + 1}. ${host.host}:${host.port} (置信度: ${host.confidence}%, 方法: ${host.discoveryMethod})`);
  });

  // 测试去重和排序
  console.log('\n🔄 应用去重和排序...');
  const deduplicated = discovery.deduplicateAndRank(mockDiscoveredHosts);

  console.log('📊 去重排序后:');
  deduplicated.forEach((host, index) => {
    console.log(`   ${index + 1}. ${host.host}:${host.port} (置信度: ${host.confidence}%)`);
  });

  // 测试最佳主机选择
  console.log('\n🎯 选择最佳主机...');
  const bestHost = discovery.selectBestHost(deduplicated);

  if (bestHost) {
    console.log(`✅ 最佳主机: ${bestHost.host}:${bestHost.port}`);
    console.log(`   置信度: ${bestHost.confidence}%`);
    console.log(`   发现方法: ${bestHost.discoveryMethod}`);
    console.log(`   是否真实局域网: ${discovery.isRealLANAddress(bestHost.host)}`);
  } else {
    console.log('❌ 未选择到最佳主机');
  }

  // 测试局域网地址判断
  console.log('\n🌐 测试局域网地址判断:');
  const testAddresses = [
    '172.30.32.1',     // Docker 内部地址
    '192.168.6.170',   // 真实局域网
    'homeassistant.local', // mDNS
    '127.0.0.1',       // 本地
    '172.17.0.1',      // Docker 默认网桥
    '10.0.0.100'       // 企业网络
  ];

  testAddresses.forEach(addr => {
    const isRealLAN = discovery.isRealLANAddress(addr);
    console.log(`   ${addr}: ${isRealLAN ? '✅ 真实局域网' : '❌ 非真实局域网'}`);
  });
}

testKnownHosts().catch(console.error);
