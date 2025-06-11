const http = require('http');

/**
 * 测试智能连接逻辑
 */
class SmartConnectionTest {
  static lastSuccessfulHost = null;

  static getTargetHosts() {
    return [
      '127.0.0.1',
      'localhost', 
      '192.168.6.170',
      'hassio.local',
      '172.30.32.2',
      '192.168.6.1',
      '192.168.1.170',
      '10.0.0.170'
    ];
  }

  static async testSmartConnection() {
    const port = 8123;
    
    // 如果之前有成功的连接，优先尝试
    const targetHosts = this.lastSuccessfulHost 
      ? [this.lastSuccessfulHost, ...this.getTargetHosts().filter(h => h !== this.lastSuccessfulHost)]
      : this.getTargetHosts();

    console.log(`🔍 智能连接测试，端口: ${port}`);
    console.log(`📋 尝试顺序: ${targetHosts.join(', ')}`);

    for (const hostname of targetHosts) {
      try {
        console.log(`🔗 尝试连接: ${hostname}:${port}`);
        const success = await this.testSingleHost(hostname, port);
        if (success) {
          console.log(`✅ 成功连接到Home Assistant: ${hostname}:${port}`);
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname;
            console.log(`🎯 记住成功地址: ${hostname}`);
          }
          return { success: true, host: hostname };
        }
      } catch (error) {
        console.log(`❌ ${hostname} 连接失败: ${error.message}`);
        continue;
      }
    }
    
    console.log(`🚫 所有地址测试失败: ${targetHosts.join(', ')}`);
    return { success: false, testedHosts: targetHosts };
  }

  static testSingleHost(hostname, port) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: hostname,
        port: port,
        path: '/',
        method: 'GET',
        timeout: 2000, // 2秒超时
        family: 4 // 强制IPv4
      };

      const req = http.request(options, (res) => {
        console.log(`  📡 ${hostname} 响应: HTTP ${res.statusCode}`);
        resolve(true);
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('连接超时'));
      });

      req.end();
    });
  }
}

// 运行测试
async function runTest() {
  console.log('🚀 开始智能连接测试...\n');
  
  // 第一次测试
  console.log('=== 第一次连接测试 ===');
  const result1 = await SmartConnectionTest.testSmartConnection();
  console.log('结果:', result1);
  
  // 第二次测试（如果第一次成功，应该优先尝试成功的地址）
  if (result1.success) {
    console.log('\n=== 第二次连接测试（测试记忆功能）===');
    const result2 = await SmartConnectionTest.testSmartConnection();
    console.log('结果:', result2);
    console.log(`记住的地址: ${SmartConnectionTest.lastSuccessfulHost}`);
  }
  
  console.log('\n✅ 测试完成');
}

runTest().catch(console.error);
