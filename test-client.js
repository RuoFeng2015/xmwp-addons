/**
 * 简单的隧道客户端用于测试
 */

const net = require('net');

class SimpleTunnelClient {
  constructor() {
    this.socket = null;
    this.clientId = 'test-client-001';
  }

  connect() {
    console.log('🔄 连接到隧道服务器...');

    this.socket = net.createConnection(3080, 'localhost');

    this.socket.on('connect', () => {
      console.log('✅ 已连接到隧道服务器');
      this.authenticate();
    });

    this.socket.on('data', (data) => {
      this.handleServerMessage(data);
    });

    this.socket.on('close', () => {
      console.log('❌ 与隧道服务器连接断开');
    });

    this.socket.on('error', (error) => {
      console.log(`❌ 连接错误: ${error.message}`);
    });
  }

  authenticate() {
    const authMessage = {
      type: 'auth',
      username: 'admin',
      password: 'password',
      client_id: this.clientId
    };

    console.log('🔐 发送认证信息...');
    this.sendMessage(authMessage);
  }

  handleServerMessage(data) {
    try {
      const messages = data.toString().split('\n').filter(msg => msg.trim());

      for (const messageStr of messages) {
        if (!messageStr.trim()) continue;

        const message = JSON.parse(messageStr);
        console.log(`📥 收到服务器消息: ${message.type}`);

        switch (message.type) {
          case 'auth_success':
            console.log('✅ 认证成功');
            break;
          case 'auth_failed':
            console.log('❌ 认证失败');
            break;
          case 'heartbeat':
            this.sendHeartbeatAck();
            break;
          case 'websocket_upgrade':
            console.log(`🔄 处理WebSocket升级请求: ${message.upgrade_id}`);
            this.handleWebSocketUpgrade(message);
            break;
          case 'websocket_data':
            console.log(`📦 收到WebSocket数据: ${message.upgrade_id}`);
            break;
          case 'websocket_close':
            console.log(`🔒 WebSocket关闭通知: ${message.upgrade_id}`);
            break;
        }
      }
    } catch (error) {
      console.log(`❌ 解析消息失败: ${error.message}`);
    }
  }

  handleWebSocketUpgrade(message) {
    // 模拟成功的WebSocket升级
    const response = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 101,
      headers: {
        'upgrade': 'websocket',
        'connection': 'upgrade',
        'sec-websocket-accept': 'test-accept-key'
      }
    };

    console.log(`✅ 发送WebSocket升级成功响应: ${message.upgrade_id}`);
    this.sendMessage(response);
  }

  sendHeartbeatAck() {
    const ackMessage = {
      type: 'heartbeat_ack',
      timestamp: Date.now()
    };
    this.sendMessage(ackMessage);
  }

  sendMessage(message) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(JSON.stringify(message) + '\n');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

// 启动测试客户端
const client = new SimpleTunnelClient();
client.connect();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭测试客户端...');
  client.disconnect();
  process.exit(0);
});

console.log('📝 测试客户端启动');
console.log('⌨️  按 Ctrl+C 停止客户端');
