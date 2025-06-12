const WebSocket = require('ws');
const crypto = require('crypto');

/**
 * WebSocket调试工具
 */
class WebSocketDebugger {
  constructor() {
    this.messageCount = 0;
    this.startTime = Date.now();
  }

  /**
   * 创建带调试的WebSocket客户端
   */
  createDebugClient(url) {
    console.log(`🚀 创建WebSocket连接: ${url}`);

    const ws = new WebSocket(url, {
      timeout: 10000
    });

    let messagesSent = 0;
    let messagesReceived = 0;

    ws.on('open', () => {
      const elapsed = Date.now() - this.startTime;
      console.log(`✅ WebSocket连接已建立 (${elapsed}ms)`);
      console.log(`   ReadyState: ${ws.readyState}`);
      console.log(`   URL: ${ws.url}`);
      console.log(`   Protocol: ${ws.protocol}`);

      // 发送测试认证消息（模拟Home Assistant）
      const authMessage = {
        "type": "auth",
        "access_token": "test_token_" + crypto.randomBytes(8).toString('hex')
      };

      const messageStr = JSON.stringify(authMessage);
      console.log(`📤 发送认证消息: ${messageStr}`);
      ws.send(messageStr);
      messagesSent++;
    });

    ws.on('message', (data) => {
      messagesReceived++;
      const elapsed = Date.now() - this.startTime;

      console.log(`📥 收到消息 #${messagesReceived} (${elapsed}ms):`);
      console.log(`   数据类型: ${typeof data}`);
      console.log(`   数据长度: ${data.length} bytes`);

      if (data instanceof Buffer) {
        console.log(`   十六进制: ${data.toString('hex')}`);
        try {
          const text = data.toString('utf8');
          console.log(`   UTF-8文本: ${text}`);

          // 尝试解析为JSON
          try {
            const parsed = JSON.parse(text);
            console.log(`   解析的JSON:`, parsed);

            // 模拟回复
            if (parsed.type === 'auth_required') {
              console.log(`🔄 检测到auth_required，等待auth_ok...`);
            } else if (parsed.type === 'auth_ok') {
              console.log(`✅ 认证成功！`);
            }
          } catch (jsonError) {
            console.log(`   JSON解析失败: ${jsonError.message}`);
          }
        } catch (textError) {
          console.log(`   UTF-8解析失败: ${textError.message}`);
        }
      } else {
        console.log(`   字符串内容: ${data}`);
      }

      console.log(''); // 空行分隔
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - this.startTime;
      console.log(`🔴 WebSocket连接关闭 (${elapsed}ms):`);
      console.log(`   关闭代码: ${code}`);
      console.log(`   关闭原因: ${reason || '无原因'}`);
      console.log(`   发送消息数: ${messagesSent}`);
      console.log(`   接收消息数: ${messagesReceived}`);
    });

    ws.on('error', (error) => {
      const elapsed = Date.now() - this.startTime;
      console.log(`❌ WebSocket错误 (${elapsed}ms): ${error.message}`);
      console.log(`   错误详情:`, error);
    });

    ws.on('ping', (data) => {
      console.log(`🏓 收到Ping: ${data.length} bytes`);
    });

    ws.on('pong', (data) => {
      console.log(`🏓 收到Pong: ${data.length} bytes`);
    });

    return ws;
  }

  /**
   * 测试隧道代理的WebSocket连接
   */
  async testTunnelProxy() {
    console.log('=== 测试隧道代理WebSocket连接 ===\n');

    const url = 'ws://110.41.20.134:3081/api/websocket';

    try {
      const ws = this.createDebugClient(url);

      // 等待连接完成或超时
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('⏰ 测试超时，关闭连接');
          ws.close();
          resolve();
        }, 15000); // 15秒超时

        ws.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      console.log(`测试失败: ${error.message}`);
    }
  }

  /**
   * 测试直连Home Assistant的WebSocket
   */
  async testDirectHA() {
    console.log('=== 测试直连Home Assistant WebSocket ===\n');

    const url = 'ws://192.168.6.170:8123/api/websocket';

    try {
      const ws = this.createDebugClient(url);

      // 等待连接完成或超时
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('⏰ 测试超时，关闭连接');
          ws.close();
          resolve();
        }, 15000); // 15秒超时

        ws.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      console.log(`测试失败: ${error.message}`);
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🔍 WebSocket连接调试工具\n');

    // 测试隧道代理
    await this.testTunnelProxy();

    console.log('\n' + '='.repeat(50) + '\n');

    // 重置计时器
    this.startTime = Date.now();

    // 测试直连（如果可用）
    await this.testDirectHA();
  }
}

// 运行调试
if (require.main === module) {
  const wsDebugger = new WebSocketDebugger();
  wsDebugger.runAllTests().catch(console.error);
}

module.exports = WebSocketDebugger;
