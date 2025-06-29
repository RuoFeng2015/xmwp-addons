#!/usr/bin/env node

/**
 * 测试隧道代理转发链路
 * 验证: 当前电脑 → tunnel-server → tunnel-client → 局域网HA实例
 */

const https = require('https');
const fs = require('fs');

// 禁用证书验证（用于测试）
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// 从options.json读取配置
const optionsPath = './tunnel-proxy/rootfs/opt/tunnel-proxy/data/options.json';

let config;
try {
  config = JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
} catch (e) {
  console.error('❌ 无法读取配置文件:', e.message);
  process.exit(1);
}

console.log('🌐 隧道代理转发链路测试');
console.log('═'.repeat(60));
console.log(`网络架构: 当前电脑 → tunnel-server → tunnel-client → 局域网HA`);
console.log(`tunnel-server: ${config.server_host}:${config.server_port}`);
console.log(`client_id: ${config.client_id}`);
console.log(`目标域名: ${config.client_id}.wzzhk.club`);
console.log(`局域网HA: 192.168.6.170:${config.local_ha_port} (通过隧道)`);
console.log();

// 测试关键的HA API端点
const testEndpoints = [
  { 
    path: '/api/config',
    desc: 'HA配置信息',
    critical: true,
    expectJson: true
  },
  { 
    path: '/api/',
    desc: 'HA API根端点',
    critical: true,
    expectJson: true
  },
  { 
    path: '/api/discovery_info',
    desc: 'HA发现信息',
    critical: false,
    expectJson: true
  },
  { 
    path: '/manifest.json',
    desc: 'PWA清单文件',
    critical: false,
    expectJson: true
  },
  { 
    path: '/',
    desc: 'HA首页',
    critical: false,
    expectJson: false
  }
];

async function testTunnelEndpoint(path, desc, expectJson = false) {
  return new Promise((resolve) => {
    console.log(`🔍 测试端点: ${path}`);
    console.log(`   描述: ${desc}`);
    
    const options = {
      hostname: `${config.client_id}.wzzhk.club`,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': 'TunnelProxyTester/1.0',
        'Accept': expectJson ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    };

    const startTime = Date.now();
    
    const req = https.request(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`   状态码: ${res.statusCode}`);
      console.log(`   响应时间: ${duration}ms`);
      console.log(`   Content-Type: ${res.headers['content-type'] || 'N/A'}`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`   响应大小: ${data.length} bytes`);
        
        let result = {
          path,
          desc,
          statusCode: res.statusCode,
          duration,
          success: res.statusCode >= 200 && res.statusCode < 400,
          dataLength: data.length,
          contentType: res.headers['content-type']
        };

        // 分析响应内容
        if (expectJson && data.length > 0) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`   ✅ JSON解析成功`);
            
            // 如果是HA配置信息，显示关键字段
            if (path === '/api/config' && jsonData.version) {
              console.log(`   🏠 HA版本: ${jsonData.version}`);
              console.log(`   📍 位置: ${jsonData.location_name || 'N/A'}`);
              console.log(`   🌐 外部URL: ${jsonData.external_url || 'N/A'}`);
              console.log(`   🕰️ 时区: ${jsonData.time_zone || 'N/A'}`);
              result.haVersion = jsonData.version;
              result.haLocation = jsonData.location_name;
            }
            
            result.validJson = true;
          } catch (e) {
            console.log(`   ❌ JSON解析失败: ${e.message}`);
            if (data.length < 500) {
              console.log(`   原始内容: ${data}`);
            }
            result.validJson = false;
          }
        } else if (data.length > 0 && data.length < 1000) {
          console.log(`   内容预览: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
        }

        // 判断是否为错误页面
        if (data.includes('Home Assistant 连接失败') || data.includes('连接错误')) {
          console.log(`   ⚠️ 检测到隧道代理错误页面`);
          result.tunnelError = true;
        }

        resolve(result);
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      console.log(`   ❌ 请求失败: ${error.message} (${duration}ms)`);
      
      resolve({
        path,
        desc,
        error: error.message,
        duration,
        success: false
      });
    });

    req.on('timeout', () => {
      console.log(`   ⏰ 请求超时 (15秒)`);
      req.destroy();
      
      resolve({
        path,
        desc,
        error: 'timeout',
        duration: 15000,
        success: false
      });
    });

    req.end();
  });
}

async function main() {
  console.log('🚀 开始测试隧道代理转发链路...\n');
  
  const results = [];
  
  for (const endpoint of testEndpoints) {
    const result = await testTunnelEndpoint(endpoint.path, endpoint.desc, endpoint.expectJson);
    results.push(result);
    console.log();
    
    // 如果关键端点失败，记录详细信息
    if (endpoint.critical && !result.success) {
      console.log(`🚨 关键端点失败: ${endpoint.path}`);
    }
    
    // 间隔1秒再测试下一个端点
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 打印测试总结
  console.log('📊 隧道代理转发测试总结');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const criticalFailed = results.filter(r => !r.success && testEndpoints.find(e => e.path === r.path)?.critical);
  
  console.log(`✅ 成功端点: ${successful.length}/${results.length}`);
  console.log(`❌ 失败端点: ${failed.length}/${results.length}`);
  console.log(`🚨 关键端点失败: ${criticalFailed.length}`);
  
  // 详细结果
  console.log('\n📋 详细结果:');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const critical = testEndpoints.find(e => e.path === result.path)?.critical ? ' [关键]' : '';
    console.log(`${index + 1}. ${status} ${result.path}${critical} - ${result.statusCode || result.error}`);
    
    if (result.haVersion) {
      console.log(`     📍 HA版本: ${result.haVersion}, 位置: ${result.haLocation || 'N/A'}`);
    }
  });

  // 诊断建议
  console.log('\n🔧 诊断结果:');
  
  if (successful.length === 0) {
    console.log('🚨 所有端点均失败！可能的原因:');
    console.log('  1. tunnel-server未运行或无法访问');
    console.log('  2. tunnel-client未连接到服务器');
    console.log('  3. 域名DNS解析问题');
    console.log('  4. 网络连接问题');
  } else if (criticalFailed.length > 0) {
    console.log('⚠️ 关键端点失败！可能的原因:');
    console.log('  1. tunnel-client无法连接到局域网HA实例');
    console.log('  2. HA实例未运行或端口错误');
    console.log('  3. tunnel-client配置错误');
  } else {
    console.log('🎉 隧道代理转发链路工作正常！');
    console.log('  - tunnel-server成功接收请求');
    console.log('  - tunnel-client成功转发到局域网HA');
    console.log('  - HA实例正常响应API请求');
    
    const configResult = results.find(r => r.path === '/api/config');
    if (configResult && configResult.haVersion) {
      console.log(`  - HA版本: ${configResult.haVersion}`);
      console.log('');
      console.log('💡 如果iOS应用仍然报错，问题可能在于:');
      console.log('  1. WebSocket认证后的HTTP请求时序问题');
      console.log('  2. iOS应用的OAuth回调URL处理');
      console.log('  3. 访问令牌的有效性和格式');
      console.log('  4. iOS应用的网络缓存或连接复用问题');
    }
  }
  
  console.log('\n📞 建议下一步:');
  if (successful.length > 0) {
    console.log('1. 检查iOS应用的详细日志，特别关注OAuth和认证流程');
    console.log('2. 验证WebSocket认证成功后的HTTP API访问时序');
    console.log('3. 检查访问令牌的格式和有效期');
  } else {
    console.log('1. 检查tunnel-server服务器状态');
    console.log('2. 检查tunnel-client连接状态');
    console.log('3. 验证局域网内HA实例的可访问性');
  }
}

main().catch(console.error);
