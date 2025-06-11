#!/usr/bin/env node

/**
 * Home Assistant 连接诊断工具
 * 用于检测本地HA实例的运行状态
 */

const http = require('http');

// 诊断配置
const CONFIG = {
  HA_HOST: '127.0.0.1',
  HA_PORTS: [8123, 8124, 80, 443],  // 常见的HA端口
  TIMEOUT: 5000
};

console.log('🔍 Home Assistant 连接诊断工具\n');

/**
 * 测试单个端口连接
 */
function testPort(host, port) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: '/',
      method: 'GET',
      timeout: CONFIG.TIMEOUT,
      family: 4  // 强制IPv4
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk.toString();
      });

      res.on('end', () => {
        const isHA = body.includes('Home Assistant') || 
                     body.includes('homeassistant') ||
                     res.headers['server']?.includes('HomeAssistant');
        
        resolve({
          port,
          success: true,
          statusCode: res.statusCode,
          isHomeAssistant: isHA,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        port,
        success: false,
        error: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        port,
        success: false,
        error: '连接超时'
      });
    });

    req.end();
  });
}

/**
 * 主诊断函数
 */
async function runDiagnostics() {
  console.log(`测试主机: ${CONFIG.HA_HOST}`);
  console.log(`测试端口: ${CONFIG.HA_PORTS.join(', ')}`);
  console.log(`超时时间: ${CONFIG.TIMEOUT}ms\n`);

  let foundHA = false;
  let availablePorts = [];

  for (const port of CONFIG.HA_PORTS) {
    process.stdout.write(`测试端口 ${port}... `);
    
    const result = await testPort(CONFIG.HA_HOST, port);
    
    if (result.success) {
      console.log(`✅ 连接成功 (HTTP ${result.statusCode})`);
      availablePorts.push(port);
      
      if (result.isHomeAssistant) {
        console.log(`   🏠 检测到Home Assistant!`);
        foundHA = true;
      } else {
        console.log(`   ℹ️  其他HTTP服务`);
      }
    } else {
      console.log(`❌ 连接失败: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 诊断结果:');
  
  if (foundHA) {
    console.log('✅ 发现Home Assistant实例');
    console.log(`📍 建议在插件配置中使用以下端口: ${availablePorts.join(' 或 ')}`);
  } else if (availablePorts.length > 0) {
    console.log('⚠️  找到HTTP服务但不是Home Assistant');
    console.log('💡 可能原因:');
    console.log('   - Home Assistant运行在其他端口');
    console.log('   - Home Assistant配置了认证或特殊路径');
    console.log('   - 检测到的是其他web服务');
  } else {
    console.log('❌ 未找到任何可用的HTTP服务');
    console.log('💡 建议检查:');
    console.log('   - Home Assistant是否正在运行');
    console.log('   - 防火墙设置');
    console.log('   - Home Assistant监听的IP地址和端口');
  }

  console.log('\n🔧 下一步操作:');
  if (foundHA) {
    console.log('1. 在Home Assistant插件配置中设置正确的端口');
    console.log('2. 重启内网穿透代理插件');
    console.log('3. 测试外网访问');
  } else {
    console.log('1. 确认Home Assistant正在运行');
    console.log('2. 检查Home Assistant的configuration.yaml配置');
    console.log('3. 运行此诊断工具确认连接');
  }

  console.log('\n📝 如需帮助，请提供上述诊断结果');
}

// 运行诊断
runDiagnostics().catch(console.error);
