#!/usr/bin/env node

/**
 * 测试Home Assistant本地连接
 * 模拟隧道代理尝试连接本地HA实例
 */

const http = require('http');

// 从options.json读取配置
const fs = require('fs');
const optionsPath = './tunnel-proxy/rootfs/opt/tunnel-proxy/data/options.json';

let config;
try {
  config = JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
} catch (e) {
  console.error('❌ 无法读取配置文件:', e.message);
  process.exit(1);
}

console.log('🔍 测试本地Home Assistant连接');
console.log(`配置端口: ${config.local_ha_port}`);
console.log();

// 常见的Home Assistant地址
const testAddresses = [
  { host: '127.0.0.1', port: config.local_ha_port },
  { host: 'localhost', port: config.local_ha_port },
  { host: '192.168.6.170', port: config.local_ha_port },
  { host: 'supervisor', port: config.local_ha_port },
  { host: 'homeassistant.local', port: config.local_ha_port },
  { host: 'homeassistant', port: config.local_ha_port }
];

async function testConnection(host, port) {
  return new Promise((resolve) => {
    console.log(`🔗 测试连接: ${host}:${port}`);
    
    const options = {
      hostname: host,
      port: port,
      path: '/api/config',
      method: 'GET',
      timeout: 3000
    };

    const startTime = Date.now();
    
    const req = http.request(options, (res) => {
      const duration = Date.now() - startTime;
      console.log(`   ✅ 连接成功! 状态: ${res.statusCode}, 时间: ${duration}ms`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`   📍 位置: ${jsonData.location_name || 'N/A'}`);
            console.log(`   🏠 版本: ${jsonData.version || 'N/A'}`);
            console.log(`   🌐 外部URL: ${jsonData.external_url || 'N/A'}`);
          } catch (e) {
            console.log(`   📄 响应长度: ${data.length} bytes`);
          }
        }
        resolve({ success: true, host, port, statusCode: res.statusCode, duration });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.log(`   ❌ 连接失败: ${err.message} (${duration}ms)`);
      resolve({ success: false, host, port, error: err.message, duration });
    });

    req.on('timeout', () => {
      console.log(`   ⏰ 连接超时 (3秒)`);
      req.destroy();
      resolve({ success: false, host, port, error: 'timeout', duration: 3000 });
    });

    req.end();
  });
}

async function main() {
  const results = [];
  
  for (const addr of testAddresses) {
    const result = await testConnection(addr.host, addr.port);
    results.push(result);
    console.log();
    
    // 如果找到成功的连接，可以提前退出
    if (result.success && result.statusCode === 200) {
      console.log(`🎉 找到可用的Home Assistant实例: ${addr.host}:${addr.port}`);
      break;
    }
  }
  
  console.log('📊 测试总结:');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ 成功连接: ${successful.length}`);
  console.log(`❌ 连接失败: ${failed.length}`);
  
  if (successful.length > 0) {
    console.log('\n成功的连接:');
    successful.forEach(r => {
      console.log(`  - ${r.host}:${r.port} (${r.statusCode}, ${r.duration}ms)`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n失败的连接:');
    failed.forEach(r => {
      console.log(`  - ${r.host}:${r.port} (${r.error})`);
    });
  }
  
  if (successful.length === 0) {
    console.log('\n🚨 建议检查:');
    console.log('1. Home Assistant是否正在运行');
    console.log('2. 端口8123是否正确');
    console.log('3. network_mode配置是否正确');
    console.log('4. 防火墙设置');
  }
}

main().catch(console.error);
