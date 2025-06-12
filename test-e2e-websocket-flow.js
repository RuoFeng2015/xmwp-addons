/**
 * 端到端测试：模拟完整的tunnel-proxy WebSocket流程
 * 测试从浏览器 → tunnel-server → tunnel-proxy → HA 的完整消息流
 */

const net = require('net');
const WebSocket = require('ws');
const http = require('http');

console.log('🔄 开始端到端WebSocket流程测试...');
console.log('='.repeat(70));

class MockTunnelClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.messageBuffer = '';
  }

  connect(host, port) {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        console.log('✅ Mock tunnel-client connected to tunnel-server');
        this.connected = true;
        this.authenticate();
      });

      this.socket.on('data', (data) => {
        this.handleServerData(data);
      });

      this.socket.on('error', (error) => {
        console.log(`❌ Mock tunnel-client error: ${error.message}`);
        reject(error);
      });

      this.socket.on('close', () => {
        console.log('🔴 Mock tunnel-client disconnected');
        this.connected = false;
        this.authenticated = false;
      });

      this.socket.connect(port, host);

      // 等待认证完成
      setTimeout(() => {
        if (this.authenticated) {
          resolve();
        } else {
          reject(new Error('Authentication timeout'));
        }
      }, 5000);
    });
  }

  authenticate() {
    const authMessage = {
      type: 'auth',
      username: 'admin',
      password: 'password',
      client_id: 'test-client'
    };
    this.sendMessage(authMessage);
  }

  handleServerData(data) {
    this.messageBuffer += data.toString();
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.log(`❌ JSON parse error: ${error.message}`);
        }
      }
    }
  }

  handleMessage(message) {
    console.log(`📥 Mock tunnel-client收到: ${message.type}`);

    switch (message.type) {
      case 'auth_success':
        this.authenticated = true;
        console.log('✅ Mock tunnel-client authenticated');
        break;

      case 'websocket_upgrade':
        console.log(`🔄 收到WebSocket升级请求: ${message.upgrade_id}`);
        this.handleWebSocketUpgrade(message);
        break;

      case 'websocket_data':
        console.log(`📨 收到WebSocket数据: ${message.upgrade_id}`);
        this.handleWebSocketData(message);
        break;

      case 'websocket_close':
        console.log(`🔴 收到WebSocket关闭: ${message.upgrade_id}`);
        break;
    }
  }

  async handleWebSocketUpgrade(message) {
    console.log('🔗 模拟连接到HA WebSocket...');

    try {
      // 模拟连接到HA
      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

      ws.on('open', () => {
        console.log('✅ Mock tunnel-proxy连接到HA成功');

        // 发送升级成功响应
        const response = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 101,
          headers: {
            'upgrade': 'websocket',
            'connection': 'upgrade',
            'sec-websocket-accept': 'mock-accept-key'
          }
        };

        this.sendMessage(response);
        console.log('📤 发送WebSocket升级响应');

        // 设置消息转发
        ws.on('message', (data) => {
          console.log(`📥 HA → tunnel-proxy: ${data.toString()}`);

          const forwardMessage = {
            type: 'websocket_data',
            upgrade_id: message.upgrade_id,
            data: data.toString('base64')
          };

          this.sendMessage(forwardMessage);
          console.log(`📤 tunnel-proxy → tunnel-server: WebSocket数据转发`);
        });
      });

      ws.on('error', (error) => {
        console.log(`❌ Mock tunnel-proxy HA连接错误: ${error.message}`);

        const errorResponse = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 502,
          headers: {}
        };

        this.sendMessage(errorResponse);
      });

    } catch (error) {
      console.log(`❌ WebSocket upgrade failed: ${error.message}`);
    }
  }

  handleWebSocketData(message) {
    // 这里会收到来自浏览器的数据，需要转发给HA
    console.log(`📨 浏览器 → tunnel-proxy: ${Buffer.from(message.data, 'base64').toString()}`);
    // 在实际实现中，这里会转发给HA WebSocket
  }

  sendMessage(message) {
    if (this.socket && this.connected) {
      const data = JSON.stringify(message) + '\n';
      this.socket.write(data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

async function testE2EWebSocketFlow() {
  console.log('📋 测试步骤:');
  console.log('1. 启动mock tunnel-server');
  console.log('2. 连接mock tunnel-client');
  console.log('3. 模拟浏览器WebSocket升级请求');
  console.log('4. 观察完整的消息流\n');

  // 步骤1: 启动mock tunnel-server
  const server = net.createServer();
  let mockClient = null;

  server.on('connection', (socket) => {
    console.log('🔗 Mock tunnel-server: 新客户端连接');

    socket.on('data', (data) => {
      console.log(`📥 Mock tunnel-server收到: ${data.toString().trim()}`);

      // 模拟认证成功
      if (data.toString().includes('"type":"auth"')) {
        const authSuccess = {
          type: 'auth_success',
          client_id: 'test-client'
        };
        socket.write(JSON.stringify(authSuccess) + '\n');
        console.log('📤 Mock tunnel-server发送认证成功');
      }
    });

    socket.on('close', () => {
      console.log('🔴 Mock tunnel-server: 客户端断开');
    });
  });

  server.listen(3080, () => {
    console.log('✅ Mock tunnel-server启动在端口3080');
  });

  // 等待server启动
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 步骤2: 连接mock tunnel-client
    mockClient = new MockTunnelClient();
    await mockClient.connect('localhost', 3080);

    // 步骤3: 模拟WebSocket升级请求
    console.log('\n🔄 模拟WebSocket升级请求...');

    const upgradeMessage = {
      type: 'websocket_upgrade',
      upgrade_id: 'test-upgrade-123',
      url: '/api/websocket',
      headers: {
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13'
      }
    };

    // 模拟tunnel-server发送升级请求给tunnel-client
    setTimeout(() => {
      console.log('📤 Mock tunnel-server → tunnel-client: WebSocket升级请求');
      mockClient.handleMessage(upgradeMessage);
    }, 2000);

    // 步骤4: 等待观察结果
    setTimeout(() => {
      console.log('\n📊 测试完成');
      console.log('✅ 如果看到HA的auth_required消息被转发，说明基本流程正常');
      console.log('❌ 如果没有看到auth_invalid响应，说明存在转发问题');

      // 清理
      mockClient.disconnect();
      server.close();
    }, 10000);

  } catch (error) {
    console.log(`❌ 测试失败: ${error.message}`);
    server.close();
  }
}

testE2EWebSocketFlow().catch(console.error);
