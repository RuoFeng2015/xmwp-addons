const http = require('http');

/**
 * 测试add-on处理没有Host头的请求
 */
class HostHeaderTest {
  static async runTest() {
    console.log('🔍 测试add-on处理没有Host头的请求...\n');

    const hostname = '192.168.6.170';
    const port = 8123;
    
    console.log(`目标: ${hostname}:${port}`);
    console.log('模拟中转服务器发送的消息（没有Host头）\n');

    // 测试场景1: 没有Host头的请求（模拟中转服务器发送的请求）
    await this.testScenario('没有Host头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-cache'
        // 注意：没有Host头
      }
    });

    // 测试场景2: 有正确Host头的请求（验证HA正常工作）
    await this.testScenario('有正确Host头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-cache'
      }
    });

    // 测试场景3: 有错误Host头的请求（模拟原来的问题）
    await this.testScenario('有错误Host头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': '110.41.20.134:3081', // 错误的Host头
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-cache'
      }
    });

    console.log('\n🎯 测试完成！');
    console.log('如果"没有Host头"的请求成功，说明Node.js会自动设置Host头。');
    console.log('如果"有错误Host头"的请求失败，说明这就是我们要解决的问题。');
  }

  static testScenario(scenarioName, hostname, port, options) {
    return new Promise((resolve) => {
      console.log(`\n📝 测试场景: ${scenarioName}`);
      console.log(`   请求: ${options.method} ${options.path}`);
      console.log(`   Host头: ${options.headers.host || '(无)'}`);

      const requestOptions = {
        hostname,
        port,
        ...options,
        family: 4,
        timeout: 5000
      };

      const req = http.request(requestOptions, (res) => {
        console.log(`   ✅ 响应: HTTP ${res.statusCode} ${res.statusMessage}`);
        
        let bodyLength = 0;
        res.on('data', chunk => {
          bodyLength += chunk.length;
        });

        res.on('end', () => {
          console.log(`   📏 响应长度: ${bodyLength} 字节`);
          
          if (res.statusCode === 200) {
            console.log(`   🎉 成功！`);
          } else if (res.statusCode === 400) {
            console.log(`   ❌ HTTP 400 - 这是我们要解决的问题`);
          } else {
            console.log(`   📊 其他状态码: ${res.statusCode}`);
          }
          
          resolve();
        });
      });

      req.on('error', (error) => {
        console.log(`   ❌ 请求错误: ${error.message}`);
        resolve();
      });

      req.on('timeout', () => {
        console.log(`   ⏰ 请求超时`);
        req.destroy();
        resolve();
      });

      req.end();
    });
  }
}

// 运行测试
if (require.main === module) {
  HostHeaderTest.runTest().catch(console.error);
}

module.exports = HostHeaderTest;
