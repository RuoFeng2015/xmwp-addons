/**
 * 中转服务器通信协议实现
 * 负责与自建中转服务器的通信
 */

const net = require('net');
const EventEmitter = require('events');

class TunnelClient extends EventEmitter {
  constructor(options) {
    super();
    this.options = {
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password, clientId: options.clientId,
      reconnectInterval: options.reconnectInterval || 5000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      timeout: options.timeout || 90000  // 增加到90秒超时
    };

    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;    this.lastHeartbeat = null;
    this.connectionAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.messageBuffer = ''; // 添加消息缓冲区
  }

  /**
   * 连接到中转服务器
   */
  connect() {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = new net.Socket();
    this.socket.setTimeout(this.options.timeout);

    // 连接事件
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.connectionAttempts = 0;
      this.emit('connected');
      this.authenticate();
    });

    // 数据接收事件
    this.socket.on('data', (data) => {
      this.handleServerData(data);
    });

    // 错误事件
    this.socket.on('error', (error) => {
      this.emit('error', error);
      this.handleDisconnection();
    });

    // 关闭事件
    this.socket.on('close', () => {
      this.handleDisconnection();
    });

    // 超时事件
    this.socket.on('timeout', () => {
      this.emit('error', new Error('连接超时'));
      this.socket.destroy();
    });

    // 开始连接
    this.socket.connect(this.options.port, this.options.host);
  }
  /**
   * 断开连接
   */
  disconnect() {
    this.isConnected = false;
    this.isAuthenticated = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    // 重置消息缓冲区
    this.messageBuffer = '';

    this.emit('disconnected');
  }
  /**
   * 处理断开连接
   */
  handleDisconnection() {
    if (!this.isConnected) return;

    this.isConnected = false;
    this.isAuthenticated = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 重置消息缓冲区
    this.messageBuffer = '';

    this.emit('disconnected');

    // 自动重连
    if (this.connectionAttempts < this.maxReconnectAttempts) {
      this.connectionAttempts++;
      this.emit('reconnecting', this.connectionAttempts);

      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, this.options.reconnectInterval);
    } else {
      this.emit('error', new Error('达到最大重连次数，停止重连'));
    }
  }

  /**
   * 身份验证
   */
  authenticate() {
    const authMessage = {
      type: 'auth',
      username: this.options.username,
      password: this.options.password,
      client_id: this.options.clientId,
      timestamp: Date.now()
    };

    this.sendMessage(authMessage);
  }

  /**
   * 发送消息到服务器
   */
  sendMessage(message) {
    if (!this.socket || !this.isConnected) {
      this.emit('error', new Error('未连接到服务器'));
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.socket.write(data);
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * 发送消息 (sendMessage的别名)
   */
  send(message) {
    return this.sendMessage(message);
  }
  /**
   * 处理服务器数据
   */
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
            this.emit('error', new Error(`JSON解析失败: ${parseError.message}, 消息内容: ${messageStr.substring(0, 100)}...`));
          }
        }
      }
    } catch (error) {
      this.emit('error', new Error(`处理服务器数据失败: ${error.message}`));
      // 清空缓冲区以防止错误累积
      this.messageBuffer = '';
    }
  }

  /**
   * 处理服务器消息
   */
  handleServerMessage(message) {
    switch (message.type) {
      case 'auth_success':
        this.isAuthenticated = true;
        this.emit('authenticated');
        this.startHeartbeat();
        break;

      case 'auth_failed':
        this.isAuthenticated = false;
        this.emit('auth_failed', message.reason);
        break;

      case 'heartbeat':
        this.lastHeartbeat = Date.now();
        this.sendHeartbeatResponse();
        break;

      case 'proxy_request':
        this.emit('proxy_request', message);
        break;

      case 'proxy_response':
        this.emit('proxy_response', message);
        break; case 'tunnel_data':
        this.emit('tunnel_data', message);
        break;

      case 'websocket_upgrade':
        this.emit('websocket_upgrade', message);
        break;

      case 'websocket_data':
        this.emit('websocket_data', message);
        break;

      case 'websocket_close':
        this.emit('websocket_close', message);
        break;

      case 'error':
        this.emit('server_error', message);
        break;

      default:
        this.emit('unknown_message', message);
        break;
    }
  }

  /**
   * 开始心跳检测
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.options.heartbeatInterval);
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    const heartbeat = {
      type: 'heartbeat',
      client_id: this.options.clientId,
      timestamp: Date.now()
    };

    this.sendMessage(heartbeat);
  }

  /**
   * 响应服务器心跳
   */
  sendHeartbeatResponse() {
    const response = {
      type: 'heartbeat_ack',
      client_id: this.options.clientId,
      timestamp: Date.now()
    };

    this.sendMessage(response);
  }

  /**
   * 发送代理响应
   */
  sendProxyResponse(requestId, statusCode, headers, body) {
    const response = {
      type: 'proxy_response',
      request_id: requestId,
      status_code: statusCode,
      headers: headers,
      body: body,
      timestamp: Date.now()
    };

    this.sendMessage(response);
  }

  /**
   * 发送隧道数据
   */
  sendTunnelData(tunnelId, data) {
    const message = {
      type: 'tunnel_data',
      tunnel_id: tunnelId,
      data: data,
      timestamp: Date.now()
    };

    this.sendMessage(message);
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      last_heartbeat: this.lastHeartbeat,
      connection_attempts: this.connectionAttempts
    };
  }
}

module.exports = TunnelClient;
