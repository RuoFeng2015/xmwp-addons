#!/usr/bin/env node

/**
 * 网络Home Assistant发现工具
 * 扫描本地网络寻找Home Assistant实例
 */

const http = require('http');
const { exec } = require('child_process');

console.log('🔍 网络Home Assistant发现工具\n');

/**
 * 获取本机IP地址
 */
function getLocalIPs() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

/**
 * 生成IP范围
 */
function generateIPRange(baseIP) {
  const parts = baseIP.split('.');
  const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const ips = [];

  // 扫描同网段的常用IP
  const commonIPs = [1, 2, 3, 100, 101, 102, 110, 111, 120, 200, 254];
  for (const ip of commonIPs) {
    ips.push(`${base}.${ip}`);
  }

  return ips;
}

/**
 * 测试Home Assistant连接
 */
function testHomeAssistant(ip, port = 8123) {
  return new Promise((resolve) => {
    const options = {
      hostname: ip,
      port: port,
      path: '/',
      method: 'GET',
      timeout: 3000,
      family: 4
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
          ip,
          port,
          success: true,
          statusCode: res.statusCode,
          isHomeAssistant: isHA,
          title: body.match(/<title>(.*?)<\/title>/i)?.[1] || 'Unknown'
        });
      });
    });

    req.on('error', () => {
      resolve({ ip, port, success: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ip, port, success: false });
    });

    req.end();
  });
}

/**
 * 主扫描函数
 */
async function scanNetwork() {
  console.log('📡 正在扫描网络中的Home Assistant实例...\n');

  // 首先检查本机
  console.log('检查本机 (127.0.0.1)...');
  const localResult = await testHomeAssistant('127.0.0.1');
  if (localResult.success && localResult.isHomeAssistant) {
    console.log('✅ 发现本机Home Assistant!');
    return [localResult];
  }

  // 获取本机IP并扫描同网段
  const localIPs = getLocalIPs();
  console.log(`本机IP: ${localIPs.join(', ')}`);

  const foundInstances = [];

  for (const localIP of localIPs) {
    console.log(`\n扫描网段: ${localIP.split('.').slice(0, 3).join('.')}.x`);
    const ipRange = generateIPRange(localIP);

    // 批量测试IP
    const batchSize = 10;
    for (let i = 0; i < ipRange.length; i += batchSize) {
      const batch = ipRange.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(ip => testHomeAssistant(ip))
      );

      for (const result of results) {
        if (result.success) {
          process.stdout.write(`${result.ip}:${result.port} `);
          if (result.isHomeAssistant) {
            console.log(`✅ Home Assistant!`);
            foundInstances.push(result);
          } else {
            console.log(`- ${result.title}`);
          }
        }
      }
    }
  }

  return foundInstances;
}

/**
 * 显示结果和建议
 */
function showResults(instances) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 扫描结果:');

  if (instances.length === 0) {
    console.log('❌ 未发现Home Assistant实例');
    console.log('\n💡 可能原因:');
    console.log('   - Home Assistant运行在其他端口 (非8123)');
    console.log('   - Home Assistant启用了认证或特殊配置');
    console.log('   - 防火墙阻止了连接');
    console.log('   - Home Assistant运行在其他网络');

    console.log('\n🔧 建议操作:');
    console.log('   1. 确认Home Assistant正在运行');
    console.log('   2. 检查Home Assistant的网络配置');
    console.log('   3. 确认防火墙设置');
    console.log('   4. 如果HA在其他端口，请手动配置插件');
  } else {
    console.log(`✅ 发现 ${instances.length} 个Home Assistant实例:`);

    instances.forEach((instance, index) => {
      console.log(`\n${index + 1}. ${instance.ip}:${instance.port}`);
      console.log(`   状态: HTTP ${instance.statusCode}`);
      console.log(`   标题: ${instance.title}`);
    });

    console.log('\n🔧 配置建议:');
    const primaryInstance = instances[0];
    console.log(`在Home Assistant插件配置中设置:`);
    console.log(`   local_ha_port: ${primaryInstance.port}`);
    if (primaryInstance.ip !== '127.0.0.1') {
      console.log(`   注意: 如果插件在${primaryInstance.ip}上运行，使用127.0.0.1`);
      console.log(`   如果插件在其他设备，需要配置具体IP地址`);
    }
  }

  console.log('\n📝 配置完成后重启插件并测试访问');
}

// 运行扫描
scanNetwork()
  .then(showResults)
  .catch(console.error);
