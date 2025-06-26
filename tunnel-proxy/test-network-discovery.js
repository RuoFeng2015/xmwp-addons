/**
 * Home Assistant 网络发现功能测试脚本
 * 测试智能网络扫描和服务发现功能
 */

const HANetworkDiscovery = require('./rootfs/opt/tunnel-proxy/lib/ha-network-discovery');
const TunnelManager = require('./rootfs/opt/tunnel-proxy/lib/tunnel-manager');

async function testNetworkDiscovery() {
  console.log('🧪 开始测试 Home Assistant 网络发现功能...\n');

  try {
    // 测试基础网络发现
    console.log('1️⃣ 测试基础网络发现...');
    const discovery = new HANetworkDiscovery();
    const results = await discovery.discoverHomeAssistant();

    console.log('📊 发现结果摘要:');
    console.log(`   发现的实例数量: ${results.discovered.length}`);
    console.log(`   推荐主机: ${results.recommendedHost ?
      `${results.recommendedHost.host}:${results.recommendedHost.port}` : '无'}`);
    console.log(`   扫描耗时: ${Date.now() - results.scanTime}ms\n`);

    // 显示详细结果
    if (results.discovered.length > 0) {
      console.log('🏠 发现的 Home Assistant 实例:');
      results.discovered.forEach((host, index) => {
        console.log(`   ${index + 1}. ${host.host}:${host.port}`);
        console.log(`      协议: ${host.protocol}`);
        console.log(`      置信度: ${host.confidence}%`);
        console.log(`      发现方法: ${host.discoveryMethod}`);
        console.log(`      响应时间: ${host.responseTime || 'N/A'}ms`);
        if (host.title) console.log(`      标题: ${host.title}`);
        console.log('');
      });
    }

    // 显示各种发现方法的结果
    console.log('🔍 各发现方法结果:');
    console.log(`   网络扫描: ${results.methods.networkScan.length} 个`);
    console.log(`   mDNS发现: ${results.methods.mDNS.length} 个`);
    console.log(`   常见主机: ${results.methods.commonHosts.length} 个`);
    console.log(`   Ping检测: ${results.methods.ping.length} 个\n`);

    // 测试 TunnelManager 集成
    console.log('2️⃣ 测试 TunnelManager 集成...');
    const tunnelManager = new TunnelManager();

    console.log('🔍 获取智能主机列表...');
    const targetHosts = await tunnelManager.getTargetHosts();
    console.log(`   获得 ${targetHosts.length} 个目标主机:`);
    targetHosts.forEach((host, index) => {
      console.log(`      ${index + 1}. ${host}`);
    });

    // 测试发现统计
    console.log('\n📈 发现统计信息:');
    const stats = tunnelManager.getDiscoveryStats();
    console.log(`   总发现数: ${stats.totalDiscovered}`);
    console.log(`   平均置信度: ${stats.avgConfidence}%`);
    console.log(`   最后成功主机: ${stats.lastSuccessfulHost || '无'}`);
    console.log(`   缓存年龄: ${stats.cacheAge ? Math.round(stats.cacheAge / 1000) + 's' : '新鲜'}`);

    if (Object.keys(stats.byMethod).length > 0) {
      console.log('   按方法分组:');
      Object.entries(stats.byMethod).forEach(([method, count]) => {
        console.log(`      ${method}: ${count} 个`);
      });
    }

    // 测试自定义主机功能
    console.log('\n3️⃣ 测试自定义主机功能...');
    tunnelManager.addCustomHost('192.168.1.100', 8123);
    tunnelManager.addCustomHost('custom.ha.local', 8123);

    const customStats = tunnelManager.getDiscoveryStats();
    console.log(`   添加自定义主机后总数: ${customStats.totalDiscovered}`);

    // 移除自定义主机
    const removed = tunnelManager.removeCustomHost('custom.ha.local');
    console.log(`   移除自定义主机结果: ${removed ? '成功' : '失败'}`);

    // 测试连接测试
    console.log('\n4️⃣ 测试连接功能...');
    console.log('🔗 开始测试实际连接...');
    const connectionResult = await tunnelManager.testLocalConnection();
    console.log(`   连接测试结果: ${connectionResult ? '✅ 成功' : '❌ 失败'}`);

    if (connectionResult) {
      const finalStats = tunnelManager.getDiscoveryStats();
      console.log(`   成功连接的主机: ${finalStats.lastSuccessfulHost}`);
    }

    console.log('\n🎉 测试完成！');

    // 输出最终建议
    console.log('\n💡 使用建议:');
    if (results.recommendedHost) {
      console.log(`   1. 推荐使用发现的主机: ${results.recommendedHost.host}:${results.recommendedHost.port}`);
      console.log(`   2. 该主机置信度: ${results.recommendedHost.confidence}%`);
    }
    if (targetHosts.length > 1) {
      console.log(`   3. 系统会自动尝试 ${targetHosts.length} 个主机，直到连接成功`);
    }
    console.log('   4. 发现结果会缓存5分钟，以提高后续连接速度');

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error);
    console.error(error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testNetworkDiscovery()
    .then(() => {
      console.log('\n✅ 所有测试执行完毕');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 测试执行失败:', error);
      process.exit(1);
    });
}

module.exports = { testNetworkDiscovery };
