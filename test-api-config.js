#!/usr/bin/env node

/**
 * 详细测试 /api/config 端点响应
 * 这是iOS应用认证过程中的关键端点
 */

const https = require('https');

// 禁用证书验证（用于测试）
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const CONFIG = {
  host: 'ha-client-001.wzzhk.club',
  port: 443,
  userAgent: 'Home Assistant/2021.12 (io.robbie.HomeAssistant; build:2021.322; iOS 15.1.0) Alamofire/5.4.4'
};

async function testAPIConfig() {
  return new Promise((resolve) => {
    console.log('🔍 详细测试 /api/config 端点...\n');
    
    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: '/api/config',
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
      timeout: 10000
    };

    const startTime = Date.now();
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        console.log(`状态码: ${res.statusCode}`);
        console.log(`响应时间: ${duration}ms`);
        console.log(`响应头:`);
        Object.entries(res.headers).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        
        console.log(`\n响应体长度: ${data.length} bytes`);
        console.log('\n响应内容:');
        console.log('─'.repeat(80));
        
        // 尝试解析为JSON
        try {
          const jsonData = JSON.parse(data);
          console.log('✅ JSON解析成功:');
          console.log(JSON.stringify(jsonData, null, 2));
          
          // 检查关键字段
          console.log('\n🔍 关键字段检查:');
          console.log(`- location_name: ${jsonData.location_name || 'N/A'}`);
          console.log(`- version: ${jsonData.version || 'N/A'}`);
          console.log(`- external_url: ${jsonData.external_url || 'N/A'}`);
          console.log(`- internal_url: ${jsonData.internal_url || 'N/A'}`);
          console.log(`- components count: ${jsonData.components ? jsonData.components.length : 'N/A'}`);
          
        } catch (e) {
          console.log('❌ JSON解析失败，显示原始内容:');
          console.log(data);
        }
        
        console.log('\n' + '─'.repeat(80));
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('❌ 请求失败:', err.message);
      resolve();
    });

    req.on('timeout', () => {
      console.error('❌ 请求超时');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function main() {
  console.log('🚀 开始详细测试 /api/config');
  console.log(`目标: ${CONFIG.host}:${CONFIG.port}/api/config\n`);
  
  await testAPIConfig();
  
  console.log('\n✅ 测试完成');
}

main().catch(console.error);
