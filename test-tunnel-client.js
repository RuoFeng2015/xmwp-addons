#!/usr/bin/env node

/**
 * 测试tunnel-client连接和域名分配
 */

const net = require('net');

class TestTunnelClient {
  constructor() {
    this.host = 'tunnel.wzzhk.club';  // 或者使用 localhost 测试
    this.port = 3080;
    this.username = 'admin';
    this.password = 'password';
    this.clientId = 'ha-client-001';
    this.socket = null;
    this.isConnected = false;
    this.messageBuffer = '';
  }

  connect() {
    console.log(`🔗 [TestClient] 连接到 ${this.host}:${this.port}`);
    
    this.socket = new net.Socket();
    this.socket.setTimeout(30000);

    // 连接事件
    this.socket.on('connect', () => {
      console.log(`✅ [TestClient] 连接成功！`);
      this.isConnected = true;
      this.authenticate();
    });

    // 数据接收事件
    this.socket.on('data', (data) => {
      this.handleServerData(data);
    });

    // 错误事件
    this.socket.on('error', (error) => {
      console.log(`❌ [TestClient] 连接错误: ${error.message}`);
    });

    // 关闭事件
    this.socket.on('close', () => {
      console.log(`🔌 [TestClient] 连接关闭`);
      this.isConnected = false;
    });

    // 超时事件
    this.socket.on('timeout', () => {
      console.log(`⏰ [TestClient] 连接超时`);
      this.socket.destroy();
    });

    // 开始连接
    this.socket.connect(this.port, this.host);
  }

  authenticate() {
    const authMessage = {
      type: 'auth',
      username: this.username,
      password: this.password,
      client_id: this.clientId,
      timestamp: Date.now()
    };

    console.log(`🔐 [TestClient] 发送认证消息:`, authMessage);
    this.sendMessage(authMessage);
  }

  sendMessage(message) {
    if (!this.socket || !this.isConnected) {
      console.log(`❌ [TestClient] 未连接到服务器`);
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.socket.write(data);
      console.log(`📤 [TestClient] 消息已发送: ${message.type}`);
      return true;
    } catch (error) {
      console.log(`❌ [TestClient] 发送失败: ${error.message}`);
      return false;
    }
  }

  handleServerData(data) {
    try {
      // 将新数据添加到缓冲区
      this.messageBuffer += data.toString();

      // 处理完整的消息（以换行符分隔）
      const lines = this.messageBuffer.split('\n');

      // 保留最后一个可能不完整的消息
      this.messageBuffer = lines.pop() || '';

      // 处理完整的消息
      for (const messageStr of lines) {
        if (messageStr.trim()) {
          try {
            const message = JSON.parse(messageStr);
            this.handleServerMessage(message);
          } catch (parseError) {
            console.log(`❌ [TestClient] JSON解析失败: ${parseError.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`❌ [TestClient] 处理服务器数据失败: ${error.message}`);
      this.messageBuffer = '';
    }
  }

  handleServerMessage(message) {
    console.log(`📥 [TestClient] 收到服务器消息:`, message);

    switch (message.type) {
      case 'auth_success':
        console.log(`✅ [TestClient] 认证成功！`);
        if (message.domain_info) {
          console.log(`🌐 [TestClient] 分配的域名信息:`, message.domain_info);
        }
        // 认证成功后，等待5秒然后断开连接
        setTimeout(() => {
          console.log(`👋 [TestClient] 测试完成，断开连接`);
          this.disconnect();
        }, 5000);
        break;

      case 'auth_failed':
        console.log(`❌ [TestClient] 认证失败: ${message.reason}`);
        this.disconnect();
        break;

      case 'heartbeat':
        console.log(`💓 [TestClient] 收到心跳请求`);
        this.sendHeartbeatResponse();
        break;

      default:
        console.log(`❓ [TestClient] 未知消息类型: ${message.type}`);
        break;
    }
  }

  sendHeartbeatResponse() {
    const response = {
      type: 'heartbeat_ack',
      client_id: this.clientId,
      timestamp: Date.now()
    };

    this.sendMessage(response);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
    console.log(`🔌 [TestClient] 已断开连接`);
  }
}

// 测试本地连接
console.log(`🧪 [测试] 开始测试tunnel-client连接...`);

const testClient = new TestTunnelClient();

// 测试本地连接
testClient.host = 'localhost';  // 先测试本地
testClient.connect();

// 10秒后强制退出
setTimeout(() => {
  console.log(`⏰ [测试] 测试超时，强制退出`);
  testClient.disconnect();
  process.exit(0);
}, 10000);
