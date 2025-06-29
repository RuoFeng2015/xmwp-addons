#!/usr/bin/env node

/**
 * HA Add-on环境连接测试脚本
 * 测试tunnel-client在HA Add-on环境中应该使用的HA地址
 */

const http = require('http');

console.log('🏠 Home Assistant Add-on环境连接测试');
console.log('═'.repeat(60));
console.log('测试目标: 找到tunnel-client在HA Add-on中访问HA Core的正确地址');
console.log();

// HA Add-on环境中可能的HA Core地址
const haAddressesToTest = [
  // HA Add-on内部网络地址
  { host: 'homeassistant.local.hass.io', port: 8123, desc: 'HA Add-on官方内部域名' },
  { host: 'supervisor', port: 8123, desc: 'HA Supervisor服务' },
  { host: 'homeassistant', port: 8123, desc: 'HA Core容器名' },
  { host: 'core-ssh', port: 8123, desc: 'HA SSH Add-on' },
  { host: 'hassio', port: 8123, desc: 'HA.io内部服务' },
  { host: 'observer', port: 8123, desc: 'HA Observer' },
  
  // Docker内部网络地址
  { host: '172.30.32.2', port: 8123, desc: 'HA Docker网络地址1' },
  { host: '172.30.32.1', port: 8123, desc: 'HA Docker网络地址2' },
  { host: 'host.docker.internal', port: 8123, desc: 'Docker宿主机' },
  
  // 回环地址
  { host: '127.0.0.1', port: 8123, desc: '本地回环' },
  { host: 'localhost', port: 8123, desc: '本地主机' },
  
  // mDNS地址
  { host: 'homeassistant.local', port: 8123, desc: 'mDNS域名' },
  
  // 备用端口
  { host: 'homeassistant.local.hass.io', port: 8124, desc: 'HA内部域名(备用端口)' },
  { host: 'supervisor', port: 8124, desc: 'Supervisor(备用端口)' }
];

async function testHAConnection(host, port, desc) {
  return new Promise((resolve) => {
    console.log(`🔍 测试: ${host}:${port} (${desc})`);
    
    const options = {
      hostname: host,
      port: port,
      path: '/api/config',
      method: 'GET',
      headers: {
        'User-Agent': 'TunnelProxyTester/1.0'
      },
      timeout: 3000
    };

    const startTime = Date.now();
    
    const req = http.request(options, (res) => {
      const duration = Date.now() - startTime;
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`   ✅ 连接成功! 状态: ${res.statusCode}, 时间: ${duration}ms`);
        
        if (res.statusCode === 200 && data.length > 0) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`   🏠 HA版本: ${jsonData.version}`);
            console.log(`   📍 位置: ${jsonData.location_name || 'N/A'}`);
            console.log(`   🌐 外部URL: ${jsonData.external_url || 'N/A'}`);
            console.log(`   🎯 这是正确的HA地址!`);
          } catch (e) {
            console.log(`   📄 响应长度: ${data.length} bytes (非JSON)`);
          }
        }
        
        resolve({
          success: true,
          host,
          port,
          desc,
          statusCode: res.statusCode,
          duration,
          dataLength: data.length
        });
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      console.log(`   ❌ 连接失败: ${error.message} (${duration}ms)`);
      
      resolve({
        success: false,
        host,
        port,
        desc,
        error: error.message,
        duration
      });
    });

    req.on('timeout', () => {
      const duration = Date.now() - startTime;
      console.log(`   ⏰ 连接超时 (${duration}ms)`);
      req.destroy();
      
      resolve({
        success: false,
        host,
        port,
        desc,
        error: 'timeout',
        duration
      });
    });

    req.end();
  });
}

async function main() {
  console.log('🚀 开始测试HA Add-on环境连接...\n');
  
  const results = [];
  
  for (const address of haAddressesToTest) {
    const result = await testHAConnection(address.host, address.port, address.desc);
    results.push(result);
    console.log();
    
    // 如果找到有效的HA连接，立即显示
    if (result.success && result.statusCode === 200) {
      console.log(`🎉 找到有效的HA连接: ${address.host}:${address.port}`);
      console.log(`推荐在tunnel-proxy配置中使用此地址\n`);
    }
    
    // 短暂延迟，避免过于频繁的连接
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 测试结果汇总
  console.log('📊 测试结果汇总');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.success && r.statusCode === 200);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ 成功连接: ${successful.length}`);
  console.log(`❌ 连接失败: ${failed.length}`);
  console.log(`📊 总测试数: ${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n🎯 推荐的HA地址 (按优先级排序):');
    successful
      .sort((a, b) => a.duration - b.duration) // 按响应时间排序
      .forEach((result, index) => {
        console.log(`${index + 1}. ${result.host}:${result.port} (${result.desc})`);
        console.log(`   响应时间: ${result.duration}ms, 数据: ${result.dataLength} bytes`);
      });
      
    console.log('\n💡 配置建议:');
    const fastest = successful[0];
    console.log(`在tunnel-proxy的主机发现中优先使用: ${fastest.host}:${fastest.port}`);
    console.log(`这个地址在HA Add-on环境中响应最快: ${fastest.duration}ms`);
  } else {
    console.log('\n🚨 未找到可用的HA连接!');
    console.log('可能的原因:');
    console.log('1. 当前环境不是HA Add-on环境');
    console.log('2. HA Core未运行');
    console.log('3. 网络配置问题');
    console.log('4. 端口配置不正确');
  }
  
  console.log('\n📝 下一步操作:');
  if (successful.length > 0) {
    console.log('1. 更新tunnel-proxy的主机发现配置');
    console.log('2. 重新部署tunnel-proxy');
    console.log('3. 重新测试iOS应用连接');
  } else {
    console.log('1. 检查当前运行环境');
    console.log('2. 确认HA Core状态');
    console.log('3. 检查网络配置');
  }
}

main().catch(console.error);
