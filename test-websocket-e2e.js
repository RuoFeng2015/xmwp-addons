const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

/**
 * 端到端WebSocket连接测试
 */
class WebSocketE2ETest {
  constructor() {
    this.testResults = [];
  }

  /**
   * 记录测试结果
   */
  log(message, success = true) {
    const timestamp = new Date().toISOString();
    const status = success ? '✅' : '❌';
    const logMessage = `[${timestamp}] ${status} ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, message, success });
  }

  /**
   * 测试WebSocket头计算
   */
  testWebSocketHeaders() {
    console.log('\n=== 测试WebSocket头计算 ===');

    const testCases = [
      'dGhlIHNhbXBsZSBub25jZQ==',
      'x3JJHMbDL1EzLkh9GBhXDw==',
      'AQIDBAUGBwgJCgsMDQ4PEC=='
    ];

    testCases.forEach((key, index) => {
      const accept = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      this.log(`WebSocket Key ${index + 1}: ${key} => Accept: ${accept}`);
    });
  }

  /**
   * 测试真实WebSocket连接
   */
  async testRealWebSocketConnection() {
    console.log('\n=== 测试真实WebSocket连接 ===');

    const testUrl = 'ws://localhost:3081/api/websocket';

    try {
      this.log(`尝试连接到: ${testUrl}`);

      const ws = new WebSocket(testUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'WebSocket-E2E-Test/1.0'
        }
      });

      return new Promise((resolve, reject) => {
        let connected = false;

        ws.on('open', () => {
          connected = true;
          this.log('WebSocket连接成功建立');

          // 发送测试消息
          const testMessage = JSON.stringify({
            type: 'test',
            message: 'Hello from E2E test',
            timestamp: Date.now()
          });

          ws.send(testMessage);
          this.log(`发送测试消息: ${testMessage}`);
        });

        ws.on('message', (data) => {
          this.log(`收到消息: ${data.toString()}`);
        });

        ws.on('close', (code, reason) => {
          this.log(`WebSocket连接关闭: code=${code}, reason=${reason}`);
          resolve(connected);
        });

        ws.on('error', (error) => {
          this.log(`WebSocket连接错误: ${error.message}`, false);
          reject(error);
        });

        // 5秒后自动关闭测试连接
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.log('测试完成，关闭连接');
            ws.close();
          } else if (!connected) {
            this.log('连接超时', false);
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      });
    } catch (error) {
      this.log(`WebSocket连接测试失败: ${error.message}`, false);
      throw error;
    }
  }

  /**
   * 测试WebSocket升级请求格式
   */
  testWebSocketUpgradeRequest() {
    console.log('\n=== 测试WebSocket升级请求格式 ===');

    const websocketKey = crypto.randomBytes(16).toString('base64');
    this.log(`生成的WebSocket Key: ${websocketKey}`);

    const expectedAccept = crypto.createHash('sha1')
      .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    this.log(`期望的Accept值: ${expectedAccept}`);

    // 模拟HTTP升级请求
    const upgradeRequest = [
      'GET /api/websocket HTTP/1.1',
      'Host: localhost:3081',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${websocketKey}`,
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Protocol: chat',
      '',
      ''
    ].join('\r\n');

    this.log('WebSocket升级请求格式:');
    console.log(upgradeRequest);

    // 模拟期望的响应
    const upgradeResponse = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${expectedAccept}`,
      '',
      ''
    ].join('\r\n');

    this.log('期望的WebSocket升级响应:');
    console.log(upgradeResponse);
  }

  /**
   * 手动测试原始HTTP升级请求
   */
  async testRawWebSocketUpgrade() {
    console.log('\n=== 测试原始WebSocket升级 ===');

    return new Promise((resolve, reject) => {
      const websocketKey = crypto.randomBytes(16).toString('base64');
      const expectedAccept = crypto.createHash('sha1')
        .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      this.log(`使用WebSocket Key: ${websocketKey}`);
      this.log(`期望Accept: ${expectedAccept}`);

      const options = {
        port: 3081,
        host: 'localhost',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': websocketKey,
          'Sec-WebSocket-Version': '13'
        }
      };

      const req = http.request(options);

      req.on('upgrade', (res, socket, head) => {
        this.log(`收到升级响应: ${res.statusCode} ${res.statusMessage}`);

        const actualAccept = res.headers['sec-websocket-accept'];
        this.log(`服务器返回的Accept: ${actualAccept}`);

        if (actualAccept === expectedAccept) {
          this.log('WebSocket Accept头验证成功 ✅');
        } else {
          this.log(`WebSocket Accept头验证失败 ❌ 期望: ${expectedAccept}, 实际: ${actualAccept}`, false);
        }

        socket.end();
        resolve(true);
      });

      req.on('error', (error) => {
        this.log(`原始升级请求失败: ${error.message}`, false);
        reject(error);
      });

      req.end();
    });
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始WebSocket端到端测试\n');

    try {
      // 基础头计算测试
      this.testWebSocketHeaders();

      // 升级请求格式测试
      this.testWebSocketUpgradeRequest();

      // 尝试原始升级测试
      try {
        await this.testRawWebSocketUpgrade();
      } catch (error) {
        this.log(`原始升级测试跳过: ${error.message}`);
      }

      // 真实连接测试
      try {
        await this.testRealWebSocketConnection();
      } catch (error) {
        this.log(`真实连接测试跳过: ${error.message}`);
      }

    } catch (error) {
      this.log(`测试过程中出现错误: ${error.message}`, false);
    }

    // 输出测试总结
    this.printTestSummary();
  }

  /**
   * 打印测试总结
   */
  printTestSummary() {
    console.log('\n=== 测试总结 ===');

    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;

    console.log(`总测试数: ${totalCount}`);
    console.log(`成功: ${successCount}`);
    console.log(`失败: ${totalCount - successCount}`);
    console.log(`成功率: ${((successCount / totalCount) * 100).toFixed(1)}%`);

    if (totalCount - successCount > 0) {
      console.log('\n失败的测试:');
      this.testResults.filter(r => !r.success).forEach(result => {
        console.log(`  ❌ ${result.message}`);
      });
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new WebSocketE2ETest();
  test.runAllTests().catch(console.error);
}

module.exports = WebSocketE2ETest;
