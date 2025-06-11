const http = require('http');

/**
 * 中转服务器消息传递调试工具
 * 模拟真实的浏览器请求，检查中转服务器发给add-on的消息格式
 */
class MessageDebugging {
  static async testMessageFlow() {
    console.log('🔍 开始调试中转服务器消息传递...\n');

    const serverHost = '110.41.20.134';
    const proxyPort = 3081;
    const clientId = 'ha-client-001';
    
    console.log(`测试目标: http://${serverHost}:${proxyPort}/${clientId}`);
    console.log('目的: 检查中转服务器发送给add-on的消息格式\n');

    // 测试场景1: 简单GET请求
    await this.testScenario('简单GET请求', serverHost, proxyPort, clientId, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${serverHost}:${proxyPort}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate'
      }
    });

    // 测试场景2: 带查询参数的请求
    await this.testScenario('带查询参数', serverHost, proxyPort, clientId, {
      method: 'GET',
      path: '/lovelace/default_view?test=123',
      headers: {
        'host': `${serverHost}:${proxyPort}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    // 测试场景3: POST请求
    await this.testScenario('POST请求', serverHost, proxyPort, clientId, {
      method: 'POST',
      path: '/api/states',
      headers: {
        'host': `${serverHost}:${proxyPort}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        entity_id: 'light.test',
        state: 'on'
      })
    });

    console.log('\n🎯 调试完成！');
    console.log('请查看add-on日志，检查收到的消息格式是否正确。');
  }

  static testScenario(scenarioName, serverHost, proxyPort, clientId, options) {
    return new Promise((resolve) => {
      console.log(`\n📝 测试场景: ${scenarioName}`);
      console.log(`   请求: ${options.method} ${options.path}`);
      console.log(`   期望: 检查add-on收到的消息格式`);

      const requestOptions = {
        hostname: serverHost,
        port: proxyPort,
        path: `/${clientId}${options.path}`,
        method: options.method,
        headers: options.headers,
        timeout: 10000
      };

      console.log(`   完整URL: http://${serverHost}:${proxyPort}${requestOptions.path}`);

      const req = http.request(requestOptions, (res) => {
        console.log(`   ✅ 响应: HTTP ${res.statusCode} ${res.statusMessage}`);
        
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          console.log(`   📏 响应长度: ${body.length} 字节`);
          
          if (res.statusCode === 200) {
            console.log(`   🎉 成功: 收到正常响应`);
          } else if (res.statusCode === 400) {
            console.log(`   ❌ HTTP 400: 这就是我们要调试的问题！`);
            console.log(`   📄 响应内容: ${body.substring(0, 200)}`);
          } else if (res.statusCode === 502) {
            console.log(`   ⚠️  HTTP 502: 客户端可能未连接`);
          } else if (res.statusCode === 504) {
            console.log(`   ⏰ HTTP 504: 请求超时`);
          } else {
            console.log(`   📊 状态码: ${res.statusCode}`);
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

      // 发送请求体（如果有）
      if (options.body) {
        console.log(`   📤 请求体: ${options.body}`);
        req.write(options.body);
      }

      req.end();
    });
  }
}

// 运行调试
if (require.main === module) {
  MessageDebugging.testMessageFlow().catch(console.error);
}

module.exports = MessageDebugging;
