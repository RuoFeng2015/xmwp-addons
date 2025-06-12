/**
 * 测试tunnel-proxy到tunnel-server的消息传输
 * 模拟实际的消息发送过程
 */

const net = require('net');
const WebSocket = require('ws');

// 模拟tunnel-client的简化版本
class MockTunnelClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.messageBuffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        console.log('📡 Mock tunnel-client连接到tunnel-server成功');
        this.isConnected = true;

        // 发送认证
        const authMessage = {
          type: 'auth',
          username: 'admin',
          password: 'password',
          client_id: 'mock-test-client',
          timestamp: Date.now()
        };
        this.sendMessage(authMessage);
      });

      this.socket.on('data', (data) => {
        this.handleServerData(data);
      });

      this.socket.on('close', () => {
        console.log('📡 Mock tunnel-client连接关闭');
        this.isConnected = false;
      });

      this.socket.on('error', (error) => {
        console.log(`📡 Mock tunnel-client错误: ${error.message}`);
        reject(error);
      });

      // 连接到tunnel-server
      this.socket.connect(3080, '43.131.243.82');

      // 等待认证完成
      setTimeout(() => {
        if (this.isConnected) {
          resolve();
        } else {
          reject(new Error('认证超时'));
        }
      }, 3000);
    });
  }

  handleServerData(data) {
    this.messageBuffer += data.toString();
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const messageStr of lines) {
      if (messageStr.trim()) {
        try {
          const message = JSON.parse(messageStr);
          console.log(`📡 Mock tunnel-client收到服务器消息: ${message.type}`);

          if (message.type === 'auth_success') {
            console.log('✅ Mock tunnel-client认证成功');
          }
        } catch (error) {
          console.log(`📡 Mock tunnel-client解析消息失败: ${error.message}`);
        }
      }
    }
  }

  sendMessage(message) {
    if (!this.socket || !this.isConnected) {
      console.log('❌ Mock tunnel-client未连接，无法发送消息');
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';

      if (message.type === 'websocket_data') {
        const decoded = Buffer.from(message.data, 'base64').toString();
        console.log(`📤 Mock tunnel-client发送WebSocket数据: ${message.upgrade_id}`);
        console.log(`   内容: ${decoded}`);
        console.log(`   数据长度: ${data.length} 字符`);
      } else {
        console.log(`📤 Mock tunnel-client发送消息: ${message.type}`);
      }

      this.socket.write(data);
      console.log(`✅ Mock tunnel-client消息已写入socket`);
      return true;
    } catch (error) {
      console.log(`❌ Mock tunnel-client发送失败: ${error.message}`);
      return false;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }
}

async function testMessageTransmission() {
  console.log('🔍 测试tunnel-proxy到tunnel-server的消息传输...');

  // 第一步：连接到tunnel-server
  const mockClient = new MockTunnelClient();

  try {
    await mockClient.connect();
    console.log('✅ Mock tunnel-client已连接并认证');

    // 第二步：模拟WebSocket消息流
    console.log('\n📥 模拟WebSocket消息流...');

    // 模拟收到auth_required消息
    const authRequiredMessage = {
      type: 'websocket_data',
      upgrade_id: 'test-upgrade-123',
      data: Buffer.from('{"type":"auth_required","ha_version":"2025.3.2"}').toString('base64'),
      timestamp: Date.now()
    };

    console.log('1️⃣ 发送auth_required消息...');
    mockClient.sendMessage(authRequiredMessage);

    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 500));

    // 模拟收到auth_invalid消息
    const authInvalidMessage = {
      type: 'websocket_data',
      upgrade_id: 'test-upgrade-123',
      data: Buffer.from('{"type":"auth_invalid","message":"Invalid access token or password"}').toString('base64'),
      timestamp: Date.now()
    };

    console.log('2️⃣ 发送auth_invalid消息...');
    mockClient.sendMessage(authInvalidMessage);

    // 等待一下确保消息处理完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 模拟连接关闭
    console.log('3️⃣ 发送WebSocket关闭消息...');
    const closeMessage = {
      type: 'websocket_close',
      upgrade_id: 'test-upgrade-123',
      timestamp: Date.now()
    };
    mockClient.sendMessage(closeMessage);

    // 再等待一下
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    console.log(`❌ 测试失败: ${error.message}`);
  } finally {
    console.log('🔄 断开连接...');
    mockClient.disconnect();
  }
}

testMessageTransmission().catch(console.error);
