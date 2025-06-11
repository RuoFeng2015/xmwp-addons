const net = require('net');
const http = require('http');

class SimpleTunnelServer {
  constructor(options = {}) {
    this.port = options.port || 8080;
    this.clients = new Map(); // 存储客户端连接
    this.server = null;
  }

  start() {
    console.log(`[${new Date().toISOString()}] 启动简单中转服务器...`);

    // 创建TCP服务器用于隧道连接
    this.server = net.createServer((socket) => {
      console.log(`[${new Date().toISOString()}] 新的客户端连接: ${socket.remoteAddress}:${socket.remotePort}`);
      this.handleClientConnection(socket);
    });

    // 启动服务器
    this.server.listen(this.port, () => {
      console.log(`[${new Date().toISOString()}] 隧道服务器启动在端口 ${this.port}`);
    });

    // 定期检查客户端连接状态
    this.startHealthCheck();
  }

  handleClientConnection(socket) {
    const clientInfo = {
      socket: socket,
      authenticated: false,
      clientId: null,
      lastHeartbeat: Date.now(),
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    };

    socket.on('data', (data) => {
      this.handleClientMessage(clientInfo, data);
    });

    socket.on('close', () => {
      console.log(`[${new Date().toISOString()}] 客户端断开连接: ${clientInfo.remoteAddress}:${clientInfo.remotePort}`);
      if (clientInfo.clientId) {
        this.clients.delete(clientInfo.clientId);
        console.log(`[${new Date().toISOString()}] 移除客户端: ${clientInfo.clientId}`);
      }
    });

    socket.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] 客户端连接错误: ${error.message}`);
    });
  }

  handleClientMessage(clientInfo, data) {
    try {
      const messages = data.toString().split('\n').filter(msg => msg.trim());

      for (const messageStr of messages) {
        const message = JSON.parse(messageStr);
        console.log(`[${new Date().toISOString()}] 收到消息: ${message.type} from ${clientInfo.remoteAddress}`);

        switch (message.type) {
          case 'auth':
            this.handleAuth(clientInfo, message);
            break;
          case 'heartbeat':
            this.handleHeartbeat(clientInfo, message);
            break;
          case 'heartbeat_ack':
            clientInfo.lastHeartbeat = Date.now();
            console.log(`[${new Date().toISOString()}] 心跳确认: ${clientInfo.clientId}`);
            break;
          default:
            console.log(`[${new Date().toISOString()}] 未知消息类型: ${message.type}`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 处理客户端消息失败: ${error.message}`);
    }
  }

  handleAuth(clientInfo, message) {
    // 简单的用户验证逻辑
    const validUsers = {
      'admin': 'password'
    };

    console.log(`[${new Date().toISOString()}] 认证请求: ${message.username} / client_id: ${message.client_id}`);

    if (validUsers[message.username] === message.password) {
      clientInfo.authenticated = true;
      clientInfo.clientId = message.client_id;
      this.clients.set(message.client_id, clientInfo);

      const response = {
        type: 'auth_success',
        timestamp: Date.now()
      };

      clientInfo.socket.write(JSON.stringify(response) + '\n');
      console.log(`[${new Date().toISOString()}] 客户端认证成功: ${message.client_id}`);
    } else {
      const response = {
        type: 'auth_failed',
        reason: '用户名或密码错误',
        timestamp: Date.now()
      };

      clientInfo.socket.write(JSON.stringify(response) + '\n');
      console.log(`[${new Date().toISOString()}] 客户端认证失败: ${message.username}`);
    }
  }

  handleHeartbeat(clientInfo, message) {
    clientInfo.lastHeartbeat = Date.now();
    console.log(`[${new Date().toISOString()}] 收到心跳: ${clientInfo.clientId || clientInfo.remoteAddress}`);

    const response = {
      type: 'heartbeat',
      timestamp: Date.now()
    };

    clientInfo.socket.write(JSON.stringify(response) + '\n');
  }

  // 定期检查客户端连接状态
  startHealthCheck() {
    setInterval(() => {
      const now = Date.now();
      console.log(`[${new Date().toISOString()}] 健康检查 - 当前连接数: ${this.clients.size}`);

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastHeartbeat = now - client.lastHeartbeat;
        if (timeSinceLastHeartbeat > 60000) { // 60秒超时
          console.log(`[${new Date().toISOString()}] 客户端 ${clientId} 超时，移除连接`);
          client.socket.destroy();
          this.clients.delete(clientId);
        } else {
          console.log(`[${new Date().toISOString()}] 客户端 ${clientId} 健康 (上次心跳: ${timeSinceLastHeartbeat}ms前)`);
        }
      }
    }, 30000); // 30秒检查一次
  }

  stop() {
    console.log(`[${new Date().toISOString()}] 停止中转服务器...`);
    if (this.server) {
      this.server.close();
    }
    for (const [clientId, client] of this.clients.entries()) {
      client.socket.destroy();
    }
    this.clients.clear();
  }
}

// 创建并启动服务器
const server = new SimpleTunnelServer({ port: 8080 });

// 优雅关闭
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] 收到SIGTERM信号，正在停止服务器...`);
  server.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] 收到SIGINT信号，正在停止服务器...`);
  server.stop();
  process.exit(0);
});

server.start();

console.log(`[${new Date().toISOString()}] 简单中转服务器已启动`);
console.log(`[${new Date().toISOString()}] 默认认证: admin / password`);
console.log(`[${new Date().toISOString()}] 按 Ctrl+C 停止服务器`);
