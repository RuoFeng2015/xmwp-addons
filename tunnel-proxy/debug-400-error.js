const http = require('http');

/**
 * HTTP 400错误调试工具
 * 尝试不同的请求头组合来找出Home Assistant需要的确切配置
 */
class HTTP400Debugger {
  static async runDebugTests() {
    const hostname = '192.168.6.170';
    const port = 8123;
    
    console.log(`🔍 开始调试HTTP 400错误 - 目标: ${hostname}:${port}`);
    console.log('='*60);

    // 测试场景1: 最基本的请求
    await this.testScenario('基本请求', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8'
      }
    });

    // 测试场景2: 添加Origin头
    await this.testScenario('添加Origin头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8',
        'origin': `http://${hostname}:${port}`
      }
    });

    // 测试场景3: 添加Referer头
    await this.testScenario('添加Referer头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8',
        'referer': `http://${hostname}:${port}/`
      }
    });

    // 测试场景4: 标准浏览器请求头
    await this.testScenario('标准浏览器请求头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate',
        'connection': 'keep-alive',
        'upgrade-insecure-requests': '1'
      }
    });

    // 测试场景5: Home Assistant特定的头
    await this.testScenario('HA特定头', hostname, port, {
      method: 'GET',
      path: '/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'x-forwarded-for': '192.168.6.1',
        'x-forwarded-proto': 'http',
        'x-real-ip': '192.168.6.1'
      }
    });

    // 测试场景6: 尝试API端点
    await this.testScenario('API端点测试', hostname, port, {
      method: 'GET',
      path: '/api/',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8',
        'accept': 'application/json'
      }
    });

    // 测试场景7: 静态资源请求
    await this.testScenario('静态资源请求', hostname, port, {
      method: 'GET',
      path: '/static/polyfills/custom-elements-es5-adapter.js',
      headers: {
        'host': `${hostname}:${port}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'application/javascript, */*'
      }
    });

    console.log('\n🎯 调试完成！请检查上面的结果找出工作的配置。');
  }

  static testScenario(scenarioName, hostname, port, options) {
    return new Promise((resolve) => {
      console.log(`\n📝 测试场景: ${scenarioName}`);
      console.log(`   请求: ${options.method} ${options.path}`);
      console.log(`   请求头: ${JSON.stringify(options.headers, null, 4)}`);

      const requestOptions = {
        hostname,
        port,
        ...options,
        family: 4,
        timeout: 5000
      };

      const req = http.request(requestOptions, (res) => {
        console.log(`   ✅ 响应: HTTP ${res.statusCode} ${res.statusMessage}`);
        console.log(`   响应头: ${JSON.stringify(res.headers, null, 4)}`);

        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          if (body.length > 0) {
            // 只显示前200个字符
            const preview = body.length > 200 ? body.substring(0, 200) + '...' : body;
            console.log(`   响应体预览: ${preview}`);
          } else {
            console.log(`   响应体: 空`);
          }
          resolve(res.statusCode);
        });
      });

      req.on('error', (error) => {
        console.log(`   ❌ 请求错误: ${error.message}`);
        resolve(-1);
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`   ⏰ 请求超时`);
        resolve(-2);
      });

      req.end();
    });
  }
}

// 运行调试
if (require.main === module) {
  HTTP400Debugger.runDebugTests().catch(console.error);
}

module.exports = HTTP400Debugger;
