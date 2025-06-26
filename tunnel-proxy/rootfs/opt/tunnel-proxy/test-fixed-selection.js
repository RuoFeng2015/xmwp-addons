#!/usr/bin/env node

/**
 * 快速测试修复后的主机选择逻辑
 */

const TunnelManager = require('./lib/tunnel-manager');

async function testFixedHostSelection() {
    console.log('🧪 测试修复后的主机选择逻辑...\n');

    const manager = new TunnelManager();

    try {
        // 1. 测试网络发现
        console.log('1️⃣ 触发网络发现...');
        const hosts = await manager.triggerNetworkDiscovery();
        
        console.log(`✅ 发现 ${hosts.length} 个主机:`);
        hosts.forEach((host, index) => {
            console.log(`   ${index + 1}. ${host}`);
        });

        // 2. 测试发现的主机信息
        console.log('\n2️⃣ 获取详细的发现信息...');
        const discoveryInfo = manager.getDiscoveredHosts();
        
        if (discoveryInfo.hosts.length > 0) {
            console.log('📋 发现的主机详情:');
            discoveryInfo.hosts.forEach((host, index) => {
                console.log(`   ${index + 1}. ${host.host}:${host.port}`);
                console.log(`      置信度: ${host.confidence}%`);
                console.log(`      发现方法: ${host.discoveryMethod}`);
                console.log(`      是否为真实局域网: ${manager.haDiscovery.isRealLANAddress ? manager.haDiscovery.isRealLANAddress(host.host) : '未知'}`);
                console.log('');
            });
            
            console.log(`🎯 推荐主机: ${discoveryInfo.recommendedHost || '无'}`);
        } else {
            console.log('❌ 未发现任何主机');
        }

        // 3. 测试统计信息
        console.log('\n3️⃣ 发现统计:');
        const stats = manager.getDiscoveryStats();
        console.log(`   总发现数: ${stats.totalDiscovered}`);
        console.log(`   按方法分组:`, stats.byMethod);
        console.log(`   平均置信度: ${stats.avgConfidence}%`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

testFixedHostSelection().catch(console.error);
