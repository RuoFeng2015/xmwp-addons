const http = require('http');

/**
 * 测试代理请求修复
 */
class ProxyRequestTest {
  static testProxyRequest() {
    return new Promise((resolve, reject) => {
      const hostname = '192.168.6.170';
      const port = 8123;
      
      // 模拟从中转服务器发来的请求
      const mockMessage = {
        request_id: 'test-request-001',
        method: 'GET',
        url: '/',
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: null
      };

      console.log(`🔗 测试代理请求到: ${hostname}:${port}`);
      console.log(`📋 请求详情: ${mockMessage.method} ${mockMessage.url}`);

      const options = {
        hostname: hostname,
        port: port,
        path: mockMessage.url,
        method: mockMessage.method,
        headers: { ...mockMessage.headers },
        family: 4,
        timeout: 5000
      };

      // 设置正确的Host头
      options.headers['host'] = `${hostname}:${port}`;
      
      // 清理可能冲突的头信息
      delete options.headers['connection'];
      delete options.headers['content-length'];
      delete options.headers['transfer-encoding'];
      
      // 确保有User-Agent
      if (!options.headers['user-agent']) {
        options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.0.7';
      }

      console.log(`📤 发送请求头:`, JSON.stringify(options.headers, null, 2));

      const proxyReq = http.request(options, (proxyRes) => {
        console.log(`📡 响应状态: HTTP ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
        console.log(`📥 响应头:`, JSON.stringify(proxyRes.headers, null, 2));

        let responseBody = Buffer.alloc(0);
        proxyRes.on('data', chunk => {
          responseBody = Buffer.concat([responseBody, chunk]);
        });

        proxyRes.on('end', () => {
          const bodyString = responseBody.toString();
          console.log(`📄 响应体长度: ${bodyString.length} 字符`);
          console.log(`📄 响应体预览: ${bodyString.substring(0, 200)}...`);
          
          const result = {
            success: proxyRes.statusCode === 200,
            statusCode: proxyRes.statusCode,
            statusMessage: proxyRes.statusMessage,
            headers: proxyRes.headers,
            bodyLength: bodyString.length,
            bodyPreview: bodyString.substring(0, 200)
          };
          
          resolve(result);
        });
      });

      proxyReq.on('error', (error) => {
        console.log(`❌ 请求错误: ${error.message}`);
        reject(error);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('请求超时'));
      });

      if (mockMessage.body) {
        proxyReq.write(mockMessage.body);
      }

      proxyReq.end();
    });
  }
}

// 运行测试
async function runTest() {
  console.log('🚀 开始代理请求测试...\n');
  
  try {
    const result = await ProxyRequestTest.testProxyRequest();
    
    console.log('\n📊 测试结果:');
    console.log(`✅ 成功: ${result.success}`);
    console.log(`📈 状态码: ${result.statusCode}`);
    console.log(`📝 状态信息: ${result.statusMessage}`);
    console.log(`📏 内容长度: ${result.bodyLength}`);
    
    if (result.success) {
      console.log('🎉 代理请求测试通过！Home Assistant响应正常。');
    } else {
      console.log('⚠️  代理请求返回错误状态码，需要进一步调试。');
    }
    
  } catch (error) {
    console.log(`💥 测试失败: ${error.message}`);
  }
  
  console.log('\n✅ 测试完成');
}

runTest().catch(console.error);
