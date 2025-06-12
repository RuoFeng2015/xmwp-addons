/**
 * 完整的WebSocket超时修复验证测试
 */

const net = require('net');
const WebSocket = require('ws');

class WebSocketTimeoutTest {
  constructor() {
    this.tunnelClient = null;
    this.testResults = [];
  }

  async runTest() {
    console.log('🚀 开始WebSocket超时修复验证测试\n');

    try {
      // 步骤1：连接隧道客户端
      console.log('📋 步骤1：启动模拟隧道客户端');
      await this.connectTunnelClient();

      // 等待一下确保连接稳定
      await this.sleep(2000);

      // 步骤2：测试WebSocket连接
      console.log('\n📋 步骤2：测试WebSocket连接持久性');
      await this.testWebSocketConnection();

      // 步骤3：显示测试结果
      console.log('\n📊 测试结果汇总:');
      this.displayResults();

    } catch (error) {
      console.log(`❌ 测试过程中出现错误: ${error.message}`);
    } finally {
      this.cleanup();
    }
  }

  connectTunnelClient() {
    return new Promise((resolve, reject) => {
      console.log('🔄 连接到隧道服务器 (端口 3080)...');

      this.tunnelClient = net.createConnection(3080, 'localhost');

      this.tunnelClient.on('connect', () => {
        console.log('✅ 隧道客户端连接成功');

        // 发送认证
        const authMessage = {
          type: 'auth',
          username: 'admin',
          password: 'password',
          client_id: 'test-websocket-client'
        };

        this.tunnelClient.write(JSON.stringify(authMessage) + '\n');
      });

      this.tunnelClient.on('data', (data) => {
        try {
          const messages = data.toString().split('\n').filter(msg => msg.trim());

          for (const messageStr of messages) {
            if (!messageStr.trim()) continue;

            const message = JSON.parse(messageStr);

            if (message.type === 'auth_success') {
              console.log('✅ 隧道客户端认证成功');
              resolve();
            } else if (message.type === 'auth_failed') {
              reject(new Error('隧道客户端认证失败'));
            } else if (message.type === 'websocket_upgrade') {
              this.handleWebSocketUpgrade(message);
            } else if (message.type === 'heartbeat') {
              // 响应心跳
              const ack = {
                type: 'heartbeat_ack',
                timestamp: Date.now()
              };
              this.tunnelClient.write(JSON.stringify(ack) + '\n');
            }
          }
        } catch (error) {
          console.log(`⚠️  解析隧道消息失败: ${error.message}`);
        }
      });

      this.tunnelClient.on('error', (error) => {
        reject(error);
      });

      // 超时保护
      setTimeout(() => {
        reject(new Error('隧道客户端连接超时'));
      }, 10000);
    });
  }

  handleWebSocketUpgrade(message) {
    console.log(`🔄 处理WebSocket升级请求: ${message.upgrade_id}`);

    // 模拟成功的WebSocket升级响应
    const response = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 101,
      headers: {
        'upgrade': 'websocket',
        'connection': 'upgrade',
        'sec-websocket-accept': 'dummy-accept-key'
      }
    };

    console.log(`✅ 发送WebSocket升级成功响应`);
    this.tunnelClient.write(JSON.stringify(response) + '\n');
  }

  testWebSocketConnection() {
    return new Promise((resolve) => {
      console.log('🔗 创建WebSocket连接到代理服务器...');

      const wsUrl = 'ws://localhost:3081/api/websocket';
      const ws = new WebSocket(wsUrl);
      const startTime = Date.now();
      let connectionEstablished = false;
      let connectionClosed = false;
      let closeTime = 0;

      ws.on('open', () => {
        connectionEstablished = true;
        console.log('✅ WebSocket连接已建立');
        console.log('⏱️  开始监控连接持久性...');

        // 定期发送ping来保持连接活跃
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`🏓 发送ping (${elapsed}秒)`);
            ws.ping();
          } else {
            clearInterval(pingInterval);
          }
        }, 2000);

        // 在多个时间点检查连接状态
        const checkPoints = [5, 10, 15, 20, 25, 30];
        checkPoints.forEach(seconds => {
          setTimeout(() => {
            if (!connectionClosed) {
              console.log(`✅ ${seconds}秒检查点：连接仍然活跃`);
              this.testResults.push(`${seconds}秒检查: 连接正常`);
            }
          }, seconds * 1000);
        });

        // 30秒后主动关闭测试
        setTimeout(() => {
          if (!connectionClosed) {
            console.log('\n🎉 测试成功！WebSocket连接已稳定保持30秒');
            this.testResults.push('30秒测试: 成功完成');
            ws.close();
            resolve();
          }
        }, 30000);
      });

      ws.on('close', (code, reason) => {
        if (connectionClosed) return;
        connectionClosed = true;
        closeTime = Date.now();

        const duration = Math.floor((closeTime - startTime) / 1000);
        console.log(`\n❌ WebSocket连接已关闭`);
        console.log(`📊 连接持续时间: ${duration}秒`);
        console.log(`🔢 关闭代码: ${code}`);

        if (duration >= 9 && duration <= 11) {
          console.log('⚠️  警告：连接在约10秒后关闭，可能仍存在超时问题！');
          this.testResults.push(`❌ 10秒超时问题未修复 (${duration}秒)`);
        } else if (duration >= 30) {
          console.log('✅ 成功：连接稳定保持30秒以上');
          this.testResults.push(`✅ 超时修复成功 (${duration}秒)`);
        } else {
          console.log(`ℹ️  连接在${duration}秒后关闭`);
          this.testResults.push(`ℹ️  连接持续${duration}秒`);
        }

        resolve();
      });

      ws.on('error', (error) => {
        console.log(`❌ WebSocket错误: ${error.message}`);
        this.testResults.push(`❌ WebSocket错误: ${error.message}`);
        resolve();
      });

      ws.on('pong', () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`🏓 收到pong响应 (${elapsed}秒)`);
      });

      // 防止测试无限等待
      setTimeout(() => {
        if (!connectionClosed) {
          console.log('\n⏰ 测试超时，强制结束');
          ws.close();
          resolve();
        }
      }, 35000);
    });
  }

  displayResults() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║        WebSocket超时修复测试结果       ║');
    console.log('╠══════════════════════════════════════╣');

    this.testResults.forEach(result => {
      console.log(`║ ${result.padEnd(36)} ║`);
    });

    console.log('╚══════════════════════════════════════╝');

    const hasTimeoutIssue = this.testResults.some(result =>
      result.includes('10秒超时问题未修复')
    );

    const hasSuccess = this.testResults.some(result =>
      result.includes('超时修复成功') || result.includes('30秒测试: 成功完成')
    );

    if (hasSuccess) {
      console.log('\n🎉 测试结论：WebSocket 10秒超时问题已成功修复！');
    } else if (hasTimeoutIssue) {
      console.log('\n⚠️  测试结论：WebSocket 10秒超时问题仍然存在');
    } else {
      console.log('\n❓ 测试结论：需要进一步调查');
    }
  }

  cleanup() {
    console.log('\n🧹 清理测试资源...');
    if (this.tunnelClient && !this.tunnelClient.destroyed) {
      this.tunnelClient.destroy();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行测试
async function main() {
  const test = new WebSocketTimeoutTest();
  await test.runTest();
  process.exit(0);
}

main().catch(error => {
  console.log(`❌ 测试失败: ${error.message}`);
  process.exit(1);
});
