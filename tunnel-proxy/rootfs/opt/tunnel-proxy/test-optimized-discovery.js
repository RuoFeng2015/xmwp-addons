#!/usr/bin/env node

/**
 * 测试优化后的网络发现功能
 */

const HANetworkDiscovery = require('./lib/ha-network-discovery');

async function testOptimizedDiscovery() {
    console.log('🧪 测试优化后的网络发现功能...\n');

    const discovery = new HANetworkDiscovery();

    // 1. 测试网络接口筛选
    console.log('1️⃣ 测试网络接口筛选和优先级排序...');
    const ranges = discovery.getLocalNetworkRanges();
    
    if (ranges.length === 0) {
        console.log('❌ 未发现任何可用网络接口');
        return;
    }

    console.log(`✅ 发现 ${ranges.length} 个优先网络接口:`);
    ranges.forEach((range, index) => {
        const networkStr = typeof range.network === 'string' ? 
            range.network : 
            `${range.network.network}/${range.network.cidr}`;
        console.log(`   ${index + 1}. ${range.interface}`);
        console.log(`      网络: ${networkStr}`);
        console.log(`      网关: ${range.gateway}`);
        console.log(`      LAN网络: ${range.isLikelyLAN ? '是' : '否'}`);
        console.log(`      优先级: ${range.priority}`);
        console.log('');
    });

    // 2. 测试快速发现（限时30秒）
    console.log('2️⃣ 开始快速网络发现（限时30秒）...');
    
    const startTime = Date.now();
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.log('⏰ 达到时间限制，停止发现');
            resolve({ discovered: [], timeout: true });
        }, 30000);
    });

    const discoveryPromise = discovery.discoverHomeAssistant();
    
    try {
        const result = await Promise.race([discoveryPromise, timeoutPromise]);
        const duration = Date.now() - startTime;
        
        console.log(`\n📊 发现结果 (耗时: ${duration}ms):`);
        
        if (result.timeout) {
            console.log('   结果: 超时停止');
        } else {
            console.log(`   发现实例: ${result.discovered.length} 个`);
            
            if (result.discovered.length > 0) {
                console.log('\n🏠 发现的 Home Assistant 实例:');
                result.discovered.forEach((host, index) => {
                    console.log(`   ${index + 1}. ${host.host}:${host.port}`);
                    console.log(`      协议: ${host.protocol}`);
                    console.log(`      置信度: ${host.confidence}%`);
                    console.log(`      发现方法: ${host.discoveryMethod}`);
                    if (host.responseTime) {
                        console.log(`      响应时间: ${host.responseTime}ms`);
                    }
                    console.log('');
                });
                
                if (result.recommendedHost) {
                    console.log(`🎯 推荐主机: ${result.recommendedHost.host}:${result.recommendedHost.port}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 发现过程出错:', error.message);
    }
}

// 运行测试
testOptimizedDiscovery().catch(console.error);
