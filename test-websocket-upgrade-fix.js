const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

/**
 * WebSocket升级测试客户端
 */
class WebSocketUpgradeTest {
  constructor() {
    this.results = [];
  }

  log(message, success = true) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const status = success ? '✅' : '❌';
    const logMessage = `[${timestamp}] ${status} ${message}`;
    console.log(logMessage);
    this.results.push({ message, success, timestamp });
  }

  /**
   * 测试原始HTTP升级请求
   */
  async testRawWebSocketUpgrade() {
    console.log('\n=== 测试原始WebSocket升级请求 ===');
    
    return new Promise((resolve, reject) => {
      const websocketKey = crypto.randomBytes(16).toString('base64');
      const expectedAccept = crypto.createHash('sha1')
        .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      this.log(`发送WebSocket Key: ${websocketKey}`);
      this.log(`期望Accept: ${expectedAccept}`);

      const options = {
        port: 3081,
        host: 'localhost',
        path: '/api/websocket',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': websocketKey,
          'Sec-WebSocket-Version': '13',
          'User-Agent': 'WebSocket-Test-Client/1.0'
        }
      };

      this.log(`连接到: ${options.host}:${options.port}${options.path}`);

      const req = http.request(options);
      
      req.on('upgrade', (res, socket, head) => {
        this.log(`收到升级响应: ${res.statusCode} ${res.statusMessage}`);
        
        // 检查响应头
        this.log(`响应头: ${JSON.stringify(res.headers, null, 2)}`);
        
        const actualAccept = res.headers['sec-websocket-accept'];
        this.log(`服务器返回的Accept: ${actualAccept}`);
        
        if (actualAccept === expectedAccept) {
          this.log('WebSocket Accept头验证成功 🎉');
        } else {
          this.log(`WebSocket Accept头验证失败 - 期望: ${expectedAccept}, 实际: ${actualAccept}`, false);
        }

        // 检查其他必要的响应头
        if (res.headers['upgrade'] && res.headers['upgrade'].toLowerCase() === 'websocket') {
          this.log('Upgrade头正确');
        } else {
          this.log(`Upgrade头错误: ${res.headers['upgrade']}`, false);
        }

        if (res.headers['connection'] && res.headers['connection'].toLowerCase().includes('upgrade')) {
          this.log('Connection头正确');
        } else {
          this.log(`Connection头错误: ${res.headers['connection']}`, false);
        }

        socket.end();
        resolve(true);
      });

      req.on('response', (res) => {
        this.log(`收到HTTP响应 (非升级): ${res.statusCode} ${res.statusMessage}`, false);
        
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          this.log(`响应体: ${body}`, false);
          resolve(false);
        });
      });

      req.on('error', (error) => {
        this.log(`升级请求失败: ${error.message}`, false);
        reject(error);
      });

      // 设置超时
      req.setTimeout(10000, () => {
        this.log('请求超时', false);
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * 测试WebSocket库连接
   */
  async testWebSocketLibrary() {
    console.log('\n=== 测试WebSocket库连接 ===');
    
    return new Promise((resolve, reject) => {
      const wsUrl = 'ws://localhost:3081/api/websocket';
      this.log(`使用WebSocket库连接: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'WebSocket-Library-Test/1.0'
        }
      });

      let connected = false;

      ws.on('open', () => {
        connected = true;
        this.log('WebSocket连接成功建立 🎉');
        
        // 发送测试消息
        const testMessage = JSON.stringify({
          type: 'test',
          message: 'Hello from WebSocket test',
          timestamp: Date.now()
        });
        
        ws.send(testMessage);
        this.log(`发送测试消息: ${testMessage}`);
        
        // 3秒后关闭连接
        setTimeout(() => {
          this.log('测试完成，关闭连接');
          ws.close();
        }, 3000);
      });

      ws.on('message', (data) => {
        this.log(`收到消息: ${data.toString()}`);
      });

      ws.on('close', (code, reason) => {
        this.log(`WebSocket连接关闭: code=${code}, reason=${reason || '无原因'}`);
        resolve(connected);
      });

      ws.on('error', (error) => {
        this.log(`WebSocket连接错误: ${error.message}`, false);
        resolve(false);
      });

      // 超时保护
      setTimeout(() => {
        if (!connected) {
          this.log('WebSocket连接超时', false);
          ws.terminate();
          resolve(false);
        }
      }, 10000);
    });
  }

  /**
   * 打印测试总结
   */
  printSummary() {
    console.log('\n=== 测试总结 ===');
    
    const successCount = this.results.filter(r => r.success).length;
    const totalCount = this.results.length;
    
    console.log(`总测试项: ${totalCount}`);
    console.log(`成功: ${successCount}`);
    console.log(`失败: ${totalCount - successCount}`);
    console.log(`成功率: ${((successCount / totalCount) * 100).toFixed(1)}%`);
    
    if (totalCount - successCount > 0) {
      console.log('\n失败的测试项:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  ❌ ${result.message}`);
      });
    }

    console.log('\n💡 提示:');
    console.log('- 如果原始升级成功但库失败，可能是WebSocket帧处理问题');
    console.log('- 如果都失败，可能是隧道代理未连接或配置问题');
    console.log('- 检查服务器日志获取更多信息');
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始WebSocket升级修复验证测试\n');
    
    try {
      // 等待一下让服务器完全启动
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 测试原始HTTP升级
      try {
        await this.testRawWebSocketUpgrade();
      } catch (error) {
        this.log(`原始升级测试失败: ${error.message}`, false);
      }
      
      // 测试WebSocket库连接
      try {
        await this.testWebSocketLibrary();
      } catch (error) {
        this.log(`WebSocket库测试失败: ${error.message}`, false);
      }
      
    } catch (error) {
      this.log(`测试过程中发生错误: ${error.message}`, false);
    }

    this.printSummary();
  }
}

// 运行测试
if (require.main === module) {
  const test = new WebSocketUpgradeTest();
  test.runAllTests().catch(console.error);
}

module.exports = WebSocketUpgradeTest;
