const WebSocket = require('ws');
const net = require('net');

/**
 * 完整的WebSocket消息流追踪测试
 * 模拟完整的隧道代理WebSocket流程
 */
class WebSocketMessageFlowTracker {
  constructor() {
    this.tunnelClient = null;
    this.upgradeId = 'test-upgrade-' + Date.now();
    this.messageFlow = [];
  }

  log(stage, message) {
    const timestamp = Date.now();
    const logEntry = `[${new Date(timestamp).toISOString()}] ${stage}: ${message}`;
    console.log(logEntry);
    this.messageFlow.push({ timestamp, stage, message });
  }

  async runFullTest() {
    console.log('🔍 完整WebSocket消息流追踪测试');
    console.log('='.repeat(60));

    try {
      // 步骤1: 连接到tunnel-server
      await this.connectToTunnelServer();

      // 步骤2: 发送WebSocket升级请求
      await this.sendWebSocketUpgrade();

      // 步骤3: 等待并监控消息流
      await this.monitorMessageFlow();

    } catch (error) {
      this.log('ERROR', `测试失败: ${error.message}`);
    } finally {
      this.cleanup();
      this.printMessageFlow();
    }
  }

  connectToTunnelServer() {
    return new Promise((resolve, reject) => {
      this.log('CONNECT', '连接到tunnel-server (localhost:3080)');

      this.tunnelClient = net.createConnection(3080, 'localhost');

      this.tunnelClient.on('connect', () => {
        this.log('CONNECT', '已连接到tunnel-server');

        // 发送认证
        const authMessage = {
          type: 'auth',
          username: 'admin',
          password: 'password',
          client_id: 'websocket-flow-test'
        };

        this.tunnelClient.write(JSON.stringify(authMessage) + '\n');
        this.log('AUTH', '发送认证消息');
      });

      this.tunnelClient.on('data', (data) => {
        try {
          const messages = data.toString().split('\n').filter(msg => msg.trim());

          for (const messageStr of messages) {
            if (!messageStr.trim()) continue;

            const message = JSON.parse(messageStr);
            this.log('RECV_SERVER', `${message.type}: ${JSON.stringify(message)}`);

            if (message.type === 'auth_success') {
              this.log('AUTH', '认证成功');
              resolve();
            } else if (message.type === 'auth_failed') {
              reject(new Error('认证失败'));
            }
          }
        } catch (error) {
          this.log('ERROR', `解析服务器消息失败: ${error.message}`);
        }
      });

      this.tunnelClient.on('error', (error) => {
        this.log('ERROR', `隧道连接错误: ${error.message}`);
        reject(error);
      });

      // 10秒超时
      setTimeout(() => {
        reject(new Error('连接tunnel-server超时'));
      }, 10000);
    });
  }

  sendWebSocketUpgrade() {
    return new Promise((resolve) => {
      this.log('UPGRADE', '发送WebSocket升级请求');

      const upgradeMessage = {
        type: 'websocket_upgrade',
        upgrade_id: this.upgradeId,
        url: '/api/websocket',
        method: 'GET',
        headers: {
          'host': 'localhost:3081',
          'upgrade': 'websocket',
          'connection': 'upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13',
          'user-agent': 'WebSocket-Flow-Test/1.0'
        }
      };

      this.tunnelClient.write(JSON.stringify(upgradeMessage) + '\n');
      this.log('UPGRADE', `发送升级请求: ${this.upgradeId}`);

      resolve();
    });
  }

  monitorMessageFlow() {
    return new Promise((resolve) => {
      this.log('MONITOR', '开始监控WebSocket消息流 (30秒)');

      // 监控tunnel-server的响应
      this.tunnelClient.on('data', (data) => {
        try {
          const messages = data.toString().split('\n').filter(msg => msg.trim());

          for (const messageStr of messages) {
            if (!messageStr.trim()) continue;

            const message = JSON.parse(messageStr);

            if (message.upgrade_id === this.upgradeId) {
              this.log('WEBSOCKET', `收到WebSocket相关消息: ${message.type}`);

              if (message.type === 'websocket_upgrade_response') {
                this.log('WEBSOCKET', `升级响应: 状态${message.status_code}`);

                if (message.status_code === 101) {
                  // 升级成功，发送测试消息
                  setTimeout(() => {
                    this.sendTestWebSocketMessage();
                  }, 100);
                }
              } else if (message.type === 'websocket_data') {
                const decoded = Buffer.from(message.data, 'base64').toString();
                this.log('WEBSOCKET', `收到数据: ${decoded}`);
              } else if (message.type === 'websocket_close') {
                this.log('WEBSOCKET', `WebSocket连接关闭`);
              }
            }
          }
        } catch (error) {
          this.log('ERROR', `解析WebSocket消息失败: ${error.message}`);
        }
      });

      // 30秒后结束监控
      setTimeout(() => {
        this.log('MONITOR', '监控结束');
        resolve();
      }, 30000);
    });
  }

  sendTestWebSocketMessage() {
    this.log('TEST', '发送测试WebSocket消息');

    const testMessage = {
      type: 'auth',
      access_token: 'test_token_flow_tracking'
    };

    const wsMessage = {
      type: 'websocket_data',
      upgrade_id: this.upgradeId,
      data: Buffer.from(JSON.stringify(testMessage)).toString('base64')
    };

    this.tunnelClient.write(JSON.stringify(wsMessage) + '\n');
    this.log('TEST', '测试消息已发送');
  }

  cleanup() {
    if (this.tunnelClient) {
      this.tunnelClient.destroy();
      this.log('CLEANUP', '清理连接');
    }
  }

  printMessageFlow() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 消息流时序分析:');
    console.log('='.repeat(60));

    const startTime = this.messageFlow[0]?.timestamp || Date.now();

    this.messageFlow.forEach((entry, index) => {
      const elapsed = entry.timestamp - startTime;
      console.log(`${String(index + 1).padStart(2, '0')}. [+${elapsed}ms] ${entry.stage}: ${entry.message}`);
    });

    console.log('\n🔍 关键时序分析:');
    const upgradeReq = this.messageFlow.find(e => e.stage === 'UPGRADE' && e.message.includes('发送升级请求'));
    const upgradeResp = this.messageFlow.find(e => e.stage === 'WEBSOCKET' && e.message.includes('升级响应'));
    const firstData = this.messageFlow.find(e => e.stage === 'WEBSOCKET' && e.message.includes('收到数据'));
    const wsClose = this.messageFlow.find(e => e.stage === 'WEBSOCKET' && e.message.includes('WebSocket连接关闭'));

    if (upgradeReq && upgradeResp) {
      const upgradeTime = upgradeResp.timestamp - upgradeReq.timestamp;
      console.log(`• WebSocket升级时间: ${upgradeTime}ms`);
    }

    if (upgradeResp && firstData) {
      const firstDataTime = firstData.timestamp - upgradeResp.timestamp;
      console.log(`• 首次数据延迟: ${firstDataTime}ms`);
    }

    if (upgradeResp && wsClose) {
      const connectionTime = wsClose.timestamp - upgradeResp.timestamp;
      console.log(`• 连接持续时间: ${connectionTime}ms`);
    }
  }
}

// 运行测试
const tracker = new WebSocketMessageFlowTracker();
tracker.runFullTest().catch(console.error);
