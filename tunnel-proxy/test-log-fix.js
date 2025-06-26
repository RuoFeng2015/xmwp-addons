#!/usr/bin/env node

/**
 * 快速测试网络发现日志输出修复
 */

const path = require('path');

const HANetworkDiscovery = require('./rootfs/opt/tunnel-proxy/lib/ha-network-discovery');

async function testLogFix() {
  console.log('🧪 快速测试网络发现日志修复...\n');

  const discovery = new HANetworkDiscovery();

  // 测试网络范围获取
  console.log('1️⃣ 测试网络范围计算...');
  const ranges = discovery.getLocalNetworkRanges();
  console.log(`发现 ${ranges.length} 个网络接口:`);

  ranges.forEach((range, index) => {
    console.log(`   ${index + 1}. ${range.interface}`);
    console.log(`      网络: ${range.network ? (typeof range.network === 'string' ? range.network : `${range.network.network}/${range.network.cidr}`) : '未知'}`);
    console.log(`      网关: ${range.gateway}`);
  });

  console.log('\n2️⃣ 测试网络扫描日志输出...');

  // 创建一个限时的网络扫描测试
  const scanPromise = new Promise(async (resolve) => {
    try {
      const hosts = await discovery.scanLocalNetwork();
      resolve(hosts);
    } catch (error) {
      console.error('扫描出错:', error.message);
      resolve([]);
    }
  });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.log('⏰ 达到测试时间限制，停止扫描');
      resolve([]);
    }, 10000); // 10秒限制
  });

  const results = await Promise.race([scanPromise, timeoutPromise]);

  console.log(`\n✅ 日志输出测试完成`);
  console.log(`   扫描结果: ${results.length} 个主机`);

  if (results.length > 0) {
    console.log('📋 发现的主机:');
    results.forEach((host, index) => {
      console.log(`   ${index + 1}. ${host.host}:${host.port} (${host.protocol})`);
    });
  }
}

// 运行测试
testLogFix().catch(console.error);
