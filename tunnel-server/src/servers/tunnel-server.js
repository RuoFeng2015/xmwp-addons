/**
 * 隧道服务器模块
 * 处理客户端连接、认证、心跳、消息转发等
 */

const net = require('net');
const crypto = require('crypto');
const { CONFIG } = require('../core/config');
const Logger = require('../core/logger');
const Utils = require('../utils/utils');
const WebSocketUtils = require('../utils/websocket-utils');

/**
 * 隧道服务器类 - 处理客户端连接
 */
class TunnelServer {
  constructor(clientManager) {
    this.clientManager = clientManager;
    this.server = null;
    this.requestQueue = new Map(); // 存储待处理的请求
  }

  /**
   * 启动隧道服务器
   */
  start() {
    this.server = net.createServer((socket) => {
      this.handleClientConnection(socket);
    });

    this.server.listen(CONFIG.TUNNEL_PORT, '0.0.0.0', () => {
      Logger.info(`隧道服务器启动在端口 ${CONFIG.TUNNEL_PORT}`);
    });

    this.server.on('error', (error) => {
      Logger.error('隧道服务器错误:', error.message);
    });

    // 启动心跳检查
    this.startHeartbeatCheck();
  }

  /**
   * 处理客户端连接
   */
  handleClientConnection(socket) {
    // 检查连接数限制
    if (!this.clientManager.canAcceptNewClient()) {
      Logger.warn(`拒绝新连接: 已达到最大客户端数量 (${CONFIG.MAX_CLIENTS})`);
      socket.write(JSON.stringify({
        type: 'error',
        message: '服务器已达到最大连接数',
        timestamp: Date.now()
      }) + '\n');
      socket.destroy();
      return;
    }

    const clientInfo = {
      socket: socket,
      authenticated: false,
      clientId: null,
      username: null,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      connectTime: Date.now(),
      lastHeartbeat: Date.now(),
      requestCount: 0,
      bytesSent: 0,
      bytesReceived: 0,
      messageBuffer: '' // 添加消息缓冲区
    };

    Logger.info(`新客户端连接: ${clientInfo.remoteAddress}:${clientInfo.remotePort}`);

    // 记录连接详细信息以便调试
    Logger.debug(`连接详情 - 本地地址: ${socket.localAddress}:${socket.localPort}, 远程地址: ${socket.remoteAddress}:${socket.remotePort}`);

    this.clientManager.registerClient(socket, clientInfo);

    // 设置socket事件
    socket.on('data', (data) => {
      clientInfo.bytesReceived += data.length;
      this.handleClientMessage(clientInfo, data);
    });

    socket.on('close', () => {
      this.clientManager.removeClient(socket);
    });

    socket.on('error', (error) => {
      Logger.error(`客户端连接错误 (${clientInfo.remoteAddress}): ${error.message}`);
      this.clientManager.removeClient(socket);
    });

    // 设置超时
    socket.setTimeout(CONFIG.CLIENT_TIMEOUT, () => {
      Logger.warn(`客户端连接超时: ${clientInfo.remoteAddress}`);
      socket.destroy();
    });
  }

  /**
   * 处理客户端消息
   */
  handleClientMessage(clientInfo, data) {
    try {
      // 将新数据添加到缓冲区
      clientInfo.messageBuffer += data.toString();

      // 处理完整的消息（以换行符分隔）
      const lines = clientInfo.messageBuffer.split('\n');

      // 保留最后一个可能不完整的消息
      clientInfo.messageBuffer = lines.pop() || '';

      // 处理完整的消息
      for (const messageStr of lines) {
        if (messageStr.trim()) {
          this.processMessage(clientInfo, messageStr);
        }
      }
    } catch (error) {
      Logger.error(`处理客户端消息失败 (${clientInfo.remoteAddress}): ${error.message}`);
      // 清空缓冲区以防止错误累积
      clientInfo.messageBuffer = '';
    }
  }

  /**
   * 处理单个消息
   */
  processMessage(clientInfo, messageStr) {
    try {
      const message = Utils.safeJsonParse(messageStr);
      if (!message) {
        Logger.error(`JSON解析失败: ${messageStr.substring(0, 100)}...`);
        return;
      }

      switch (message.type) {
        case 'auth':
          this.handleAuth(clientInfo, message);
          break;
        case 'heartbeat':
          this.handleHeartbeat(clientInfo, message);
          break;
        case 'heartbeat_ack':
          clientInfo.lastHeartbeat = Date.now();
          break;
        case 'proxy_response':
          this.handleProxyResponse(clientInfo, message);
          break;
        case 'websocket_upgrade_response':
          this.handleWebSocketUpgradeResponse(clientInfo, message);
          break;
        case 'websocket_data':
          this.handleWebSocketData(clientInfo, message);
          break;
        case 'websocket_close':
          this.handleWebSocketClose(clientInfo, message);
          break;
        case 'register_route':
          this.handleRouteRegister(clientInfo, message);
          break;
        default:
          Logger.warn(`未知消息类型: ${message.type}`);
      }
    } catch (parseError) {
      Logger.error(`消息处理失败: ${parseError.message}, 消息内容: ${messageStr.substring(0, 100)}...`);
    }
  }
  /**
   * 处理身份验证
   */  async handleAuth(clientInfo, message) {
    const { username, password, client_id } = message;

    console.log(`🔐 [TunnelServer] 收到认证请求:`, {
      username,
      client_id,
      remoteAddress: clientInfo.remoteAddress,
      hasPassword: !!password
    });

    Logger.info(`认证请求: ${username} / ${client_id} from ${clientInfo.remoteAddress}`);

    // 验证凭据
    const validCredentials = Utils.validateCredentials(username, password);
    console.log(`🔐 [TunnelServer] 凭据验证结果: ${validCredentials}`);

    if (validCredentials && client_id) {
      // 检查clientId是否已被使用
      if (this.clientManager.isClientIdExists(client_id, clientInfo.socket)) {
        console.log(`❌ [TunnelServer] 客户端ID已被使用: ${client_id}`);
        this.sendMessage(clientInfo.socket, {
          type: 'auth_failed',
          reason: '客户端ID已被使用',
          timestamp: Date.now()
        });
        return;
      }

      console.log(`✅ [TunnelServer] 认证成功，更新客户端信息`);
      clientInfo.authenticated = true;
      clientInfo.clientId = client_id;
      clientInfo.username = username;

      // 重新注册客户端（更新clientId）
      console.log(`📝 [TunnelServer] 注册客户端: ${client_id}`);
      await this.clientManager.registerClient(clientInfo.socket, clientInfo);      // 构建认证成功响应
      const authResponse = {
        type: 'auth_success',
        client_id: client_id,
        timestamp: Date.now()
      };

      // 如果启用域名模式，添加域名信息
      if (CONFIG.DOMAIN_MODE) {
        console.log(`🌐 [TunnelServer] 获取客户端域名信息: ${client_id}`);
        const domainInfo = this.clientManager.getClientDomain(client_id);
        console.log(`🌐 [TunnelServer] 域名信息:`, domainInfo);
        if (domainInfo) {
          authResponse.domain_info = {
            subdomain: domainInfo.subdomain,
            full_domain: domainInfo.fullDomain,
            access_url: `https://${domainInfo.fullDomain}`
          };
        }
      }

      console.log(`📤 [TunnelServer] 发送认证成功响应:`, authResponse);
      this.sendMessage(clientInfo.socket, authResponse);

      Logger.info(`客户端认证成功: ${client_id} (${username})`);
    } else {
      this.sendMessage(clientInfo.socket, {
        type: 'auth_failed',
        reason: '用户名、密码或客户端ID错误',
        timestamp: Date.now()
      });

      Logger.warn(`客户端认证失败: ${username} from ${clientInfo.remoteAddress}`);
    }
  }

  /**
   * 处理心跳
   */
  handleHeartbeat(clientInfo, message) {
    clientInfo.lastHeartbeat = Date.now();

    this.sendMessage(clientInfo.socket, {
      type: 'heartbeat_ack',
      timestamp: Date.now()
    });
  }

  /**
   * 处理路由注册
   */
  handleRouteRegister(clientInfo, message) {
    if (!clientInfo.authenticated) {
      return;
    }

    const { route } = message;
    if (route) {
      this.clientManager.addRoute(route, clientInfo.clientId);

      this.sendMessage(clientInfo.socket, {
        type: 'route_registered',
        route: route,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理代理响应
   */
  handleProxyResponse(clientInfo, message) {
    const { request_id, status_code, headers, body } = message;

    // 查找对应的原始请求
    const requestInfo = this.requestQueue.get(request_id);
    if (requestInfo) {
      const { res, req } = requestInfo;

      try {
        // 设置原始响应头（不做任何修改）
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            // 保持原始头信息，不添加额外的头
            res.setHeader(key, value);
          });
        }

        // 处理响应体
        const responseBody = Utils.processResponseBody(body);

        // 发送响应
        res.statusCode = status_code || 200;
        res.end(responseBody);

        clientInfo.bytesSent += responseBody.length;
        clientInfo.requestCount++;

        // 简化的日志记录
        if (req && req.url && req.url.includes('/api/')) {
          Logger.info(`📤 [HTTP API响应] ${req.method} ${req.url} -> ${status_code}, 长度: ${responseBody.length}`);
        }

      } catch (error) {
        Logger.error(`发送代理响应失败: ${error.message}`);
        this.sendErrorResponse(res, status_code, body);
      }

      this.requestQueue.delete(request_id);
    }
  }

  /**
   * 发送错误响应
   */
  sendErrorResponse(res, status_code, body) {
    try {
      if (!res.headersSent) {
        if (status_code >= 400 && status_code < 500) {
          res.statusCode = status_code;
          res.end(body || 'Client Error');
        } else {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      }
    } catch (e) {
      Logger.error(`发送错误响应也失败: ${e.message}`);
    }
  }

  /**
   * 处理WebSocket升级响应
   */
  handleWebSocketUpgradeResponse(clientInfo, message) {
    const { upgrade_id, status_code, headers, error } = message;

    // 查找对应的WebSocket升级请求
    const upgradeInfo = global.proxyServer.requestQueue.get(upgrade_id);
    if (!upgradeInfo || upgradeInfo.type !== 'websocket_upgrade') {
      Logger.warn(`未找到WebSocket升级请求: ${upgrade_id}`);
      return;
    }

    const { socket } = upgradeInfo;

    try {
      if (status_code === 101) {
        this.handleSuccessfulWebSocketUpgrade(socket, upgradeInfo, headers);
        this.setupWebSocketDataForwarding(socket, clientInfo, upgrade_id);
      } else {
        this.handleFailedWebSocketUpgrade(socket, upgradeInfo, status_code, error);
      }
    } catch (error) {
      Logger.error(`处理WebSocket升级响应失败: ${error.message}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }

    // 从ProxyServer的requestQueue中删除请求
    global.proxyServer.requestQueue.delete(upgrade_id);
  }

  /**
   * 处理成功的WebSocket升级
   */
  handleSuccessfulWebSocketUpgrade(socket, upgradeInfo, headers) {
    Logger.info(`WebSocket升级成功: ${upgradeInfo.originalWebSocketKey}`);

    // 清除升级超时计时器
    if (upgradeInfo.upgradeTimeoutId) {
      clearTimeout(upgradeInfo.upgradeTimeoutId);
    }

    // 创建响应头
    const responseHeaders = WebSocketUtils.createWebSocketResponseHeaders(
      upgradeInfo.originalWebSocketKey,
      headers
    );

    Logger.info(`📤 [WebSocket升级] 发送升级响应头：\n${responseHeaders.replace(/\r\n/g, '\\r\\n\n')}`);

    try {
      if (socket && socket.writable && !socket.destroyed) {
        // 先写入响应头
        socket.write(responseHeaders);
        
        // 立即刷新缓冲区确保响应头被发送
        if (typeof socket.flush === 'function') {
          socket.flush();
        }
        
        // 设置 socket 为 nodelay 模式，减少延迟
        if (typeof socket.setNoDelay === 'function') {
          socket.setNoDelay(true);
        }
        
        Logger.info(`✅ [WebSocket升级] 响应头发送成功`);
      } else {
        Logger.warn(`⚠️ Socket不可写，无法发送WebSocket升级响应: writable=${socket?.writable}, destroyed=${socket?.destroyed}`)
      }
    } catch (error) {
      Logger.error(`❌ 发送WebSocket升级响应失败: ${error.message}`)
      Logger.error(`❌ 错误堆栈: ${error.stack}`)
    }
  }

  /**
   * 处理失败的WebSocket升级
   */
  handleFailedWebSocketUpgrade(socket, upgradeInfo, status_code, errorMessage) {
    Logger.warn(`WebSocket升级失败: 状态码 ${status_code}, 错误: ${errorMessage || '未知错误'}`);

    // 清除升级超时计时器
    if (upgradeInfo.upgradeTimeoutId) {
      clearTimeout(upgradeInfo.upgradeTimeoutId);
    }

    // 为iOS客户端提供更详细的错误响应
    let errorResponse = `HTTP/1.1 ${status_code} WebSocket Upgrade Failed\r\n`;
    errorResponse += 'Connection: close\r\n';
    errorResponse += 'Content-Type: text/plain\r\n';
    errorResponse += 'Cache-Control: no-cache, no-store, must-revalidate\r\n';
    errorResponse += 'Pragma: no-cache\r\n';
    errorResponse += 'Expires: 0\r\n';
    
    if (errorMessage) {
      errorResponse += `X-Error-Reason: ${errorMessage}\r\n`;
    }
    
    errorResponse += '\r\n';
    
    if (errorMessage) {
      errorResponse += errorMessage;
    }

    try {
      if (socket && socket.writable && !socket.destroyed) {
        socket.write(errorResponse);
        socket.destroy();
      } else {
        Logger.warn(`⚠️ Socket已关闭，无法发送WebSocket错误响应`)
      }
    } catch (error) {
      Logger.error(`❌ 发送WebSocket错误响应失败: ${error.message}`)
      try {
        socket.destroy();
      } catch (destroyError) {
        Logger.error(`❌ 销毁socket失败: ${destroyError.message}`)
      }
    }
  }

  /**
   * 设置WebSocket数据转发
   */
  setupWebSocketDataForwarding(browserSocket, clientInfo, upgradeId) {
    // 创建认证状态跟踪
    const authState = {
      required: false,
      responseSent: false,
      timeoutId: null,
      lastActivityTime: Date.now()
    };

    // 存储WebSocket连接
    this.requestQueue.set(`ws_${upgradeId}`, {
      browserSocket,
      clientInfo,
      timestamp: Date.now(),
      type: 'websocket_connection',
      authState
    });

    // 设置认证监控定时器
    authState.timeoutId = setTimeout(() => {
      this.handleAuthTimeout(upgradeId, authState);
    }, 10000); // 10秒认证超时

    // 浏览器 -> 客户端 (WebSocket帧)
    browserSocket.on('data', (data) => {
      try {
        authState.lastActivityTime = Date.now();
        
        Logger.info(`� [WebSocket] 收到浏览器数据: 长度=${data.length}, upgrade_id=${upgradeId}`);
        Logger.info(`🔍 [WebSocket] 数据前32字节: ${data.slice(0, 32).toString('hex')}`);

        // 解析WebSocket帧，提取消息内容
        const messages = WebSocketUtils.parseWebSocketFrames(data);
        Logger.info(`� [WebSocket] 解析出 ${messages.length} 个消息`);
        
        for (let i = 0; i < messages.length; i++) {
          const messageData = messages[i];
          Logger.info(`� [WebSocket] 消息 ${i+1}: 长度=${messageData.length}`);
          
          // 尝试解析消息内容以便调试
          try {
            const messageText = messageData.toString('utf8');
            Logger.info(`� [WebSocket] 消息内容: ${messageText}`);
            
            // **重要的iOS认证监控**
            try {
              const jsonMsg = JSON.parse(messageText);
              if (jsonMsg.type) {
                Logger.info(`🔐 [WebSocket] *** 检测到JSON消息类型: ${jsonMsg.type} ***`);
                
                if (jsonMsg.type === 'auth') {
                  Logger.info(`🎉 [iOS认证] *** 成功接收到iOS认证消息! ***`);
                  Logger.info(`🎉 [iOS认证] 连接ID: ${upgradeId}`);
                  Logger.info(`🎉 [iOS认证] 完整消息: ${JSON.stringify(jsonMsg, null, 2)}`);
                  Logger.info(`🎉 [iOS认证] 现在转发到HA客户端...`);
                  
                  // 清除认证超时
                  if (authState.timeoutId) {
                    clearTimeout(authState.timeoutId);
                    authState.timeoutId = null;
                  }
                  authState.responseSent = true;
                } else {
                  Logger.info(`📨 [消息监控] 其他消息类型: ${jsonMsg.type}`);
                }
              }
            } catch (jsonError) {
              // 不是JSON消息，检查是否包含认证相关内容
              if (messageText.includes('auth') || messageText.includes('token') || messageText.includes('access_token')) {
                Logger.warn(`🔍 [认证监控] 非JSON但可能含认证数据: ${messageText}`);
              }
            }
          } catch (textError) {
            Logger.info(`� [WebSocket] 消息为二进制数据，长度: ${messageData.length}`);
          }
          
          const wsMessage = {
            type: 'websocket_data',
            upgrade_id: upgradeId,
            data: messageData.toString('base64'),
            timestamp: Date.now()
          };
          this.sendMessage(clientInfo.socket, wsMessage);
          Logger.info(`📤 [WebSocket] 已转发消息到客户端`);
        }
      } catch (error) {
        Logger.error(`❌ [WebSocket] 解析WebSocket帧失败: ${error.message}`);
        Logger.error(`❌ [WebSocket] 错误堆栈: ${error.stack}`);
        Logger.error(`❌ [WebSocket] 原始数据长度: ${data.length}`);
      }
    });

    // 处理浏览器连接关闭
    browserSocket.on('close', () => {
      this.cleanupWebSocketConnection(upgradeId, authState, clientInfo);
    });

    browserSocket.on('error', (error) => {
      Logger.error(`浏览器WebSocket连接错误: ${error.message}`);
      this.cleanupWebSocketConnection(upgradeId, authState, clientInfo);
    });
  }

  /**
   * 清理WebSocket连接
   */
  cleanupWebSocketConnection(upgradeId, authState, clientInfo) {
    // 清除认证监控定时器
    if (authState.timeoutId) {
      clearTimeout(authState.timeoutId);
    }

    const wsMessage = {
      type: 'websocket_close',
      upgrade_id: upgradeId,
      timestamp: Date.now()
    };
    this.sendMessage(clientInfo.socket, wsMessage);
    this.requestQueue.delete(`ws_${upgradeId}`);
  }
  /**
   * 处理WebSocket数据
   */
  handleWebSocketData(clientInfo, message) {
    const { upgrade_id, data } = message;

    const wsConnection = this.requestQueue.get(`ws_${upgrade_id}`);
    if (!wsConnection || wsConnection.type !== 'websocket_connection') {
      Logger.warn(`未找到WebSocket连接: ${upgrade_id}`);
      return;
    }

    try {
      // 解码base64数据
      const messageData = Buffer.from(data, 'base64');

      // 判断是否为二进制消息
      const isBinaryMessage = this.isBinaryWebSocketMessage(messageData);

      Logger.info(`📨 WebSocket数据转发到浏览器: ${upgrade_id}, 长度: ${messageData.length}, 类型: ${isBinaryMessage ? '二进制' : '文本'}`);

      // 分析消息类型（仅对文本消息进行JSON分析）
      let isAuthMessage = false;
      let messageType = null;

      if (!isBinaryMessage) {
        const analysis = WebSocketUtils.analyzeMessage(messageData);
        isAuthMessage = analysis.isAuthMessage;
        messageType = analysis.messageType;

        if (isAuthMessage) {
          this.handleAuthMessage(wsConnection, messageType, messageData, upgrade_id);
        }
      }

      // 构造WebSocket帧并发送（智能选择帧类型）
      const frame = WebSocketUtils.createWebSocketFrame(messageData, isBinaryMessage ? 2 : 1);
      this.sendWebSocketFrame(wsConnection.browserSocket, frame, isAuthMessage);

    } catch (error) {
      Logger.error(`WebSocket数据转发失败: ${error.message}`);
    }
  }

  /**
   * 判断是否为二进制WebSocket消息
   * @param {Buffer} buffer - 要检查的数据缓冲区
   * @returns {boolean} - true表示二进制消息，false表示文本消息
   */
  isBinaryWebSocketMessage(buffer) {
    // 检查空缓冲区
    if (!buffer || buffer.length === 0) {
      return false;
    }

    // 常见的二进制文件头检查
    const binaryHeaders = [
      [0x89, 0x50, 0x4E, 0x47], // PNG
      [0xFF, 0xD8, 0xFF],        // JPEG
      [0x47, 0x49, 0x46],        // GIF
      [0x52, 0x49, 0x46, 0x46], // RIFF (WAV, AVI等)
      [0x50, 0x4B, 0x03, 0x04], // ZIP
      [0x25, 0x50, 0x44, 0x46], // PDF
      [0x00, 0x00, 0x00],        // 通用二进制标识
    ];

    // 检查是否匹配已知的二进制文件头
    for (const header of binaryHeaders) {
      if (buffer.length >= header.length) {
        let matches = true;
        for (let i = 0; i < header.length; i++) {
          if (buffer[i] !== header[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return true;
        }
      }
    }

    // 检查是否包含过多的控制字符或不可打印字符
    let nonPrintableCount = 0;
    const sampleSize = Math.min(buffer.length, 1024); // 只检查前1024字节

    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];

      // 允许的控制字符：换行、回车、制表符
      if (byte === 0x0A || byte === 0x0D || byte === 0x09) {
        continue;
      }

      // 空字节通常表示二进制数据
      if (byte === 0x00) {
        return true;
      }

      // 不可打印字符计数（0-31和127-255，除了已允许的）
      if ((byte < 32 && byte !== 0x0A && byte !== 0x0D && byte !== 0x09) || byte >= 127) {
        nonPrintableCount++;
      }
    }

    // 如果不可打印字符超过30%，认为是二进制数据
    const nonPrintableRatio = nonPrintableCount / sampleSize;
    return nonPrintableRatio > 0.3;
  }

  /**
   * 处理认证消息
   */
  handleAuthMessage(wsConnection, messageType, messageData, upgradeId) {
    if (messageType === 'auth_required') {
      wsConnection.authState.required = true;
      Logger.info(`🔐 检测到认证消息: ${messageType} - ${upgradeId}`);
    } else if (['auth_ok', 'auth_invalid'].includes(messageType)) {
      wsConnection.authState.responseSent = true;
      // 清除认证监控定时器
      if (wsConnection.authState.timeoutId) {
        clearTimeout(wsConnection.authState.timeoutId);
        wsConnection.authState.timeoutId = null;
      }
      Logger.info(`🔐 检测到认证响应: ${messageType} - ${upgradeId}`);
    }
  }

  /**
   * 发送WebSocket帧
   */
  sendWebSocketFrame(browserSocket, frame, isAuthMessage = false) {
    if (!browserSocket || !browserSocket.writable || browserSocket.destroyed) {
      Logger.warn(`⚠️ [WebSocket] 连接不可写，跳过发送: writable=${browserSocket?.writable}, destroyed=${browserSocket?.destroyed}`)
      return false
    }

    // 为iOS添加额外的连接检查
    if (browserSocket.readyState && browserSocket.readyState !== 'open') {
      Logger.warn(`⚠️ [iOS检查] Socket状态异常: ${browserSocket.readyState}`)
      return false
    }

    try {
      const writeSuccess = browserSocket.write(frame);
      if (!writeSuccess) {
        Logger.warn(`📤 [WebSocket] 写入缓冲区已满，等待排空`);
      }

      // 对于认证消息，执行强制刷新并检查iOS连接状态
      if (isAuthMessage) {
        Logger.info(`🔐 [WebSocket] 这是认证相关消息，将立即刷新缓冲区`);
        WebSocketUtils.flushWebSocket(browserSocket);
        
        // 延迟检查连接状态，如果iOS立即断开连接，我们就能检测到
        setTimeout(() => {
          if (!browserSocket.writable || browserSocket.destroyed) {
            Logger.warn(`🍎 [iOS问题] 认证消息发送后iOS立即断开连接`);
          } else {
            Logger.info(`✅ [iOS检查] 认证消息发送后连接仍然活跃`);
          }
        }, 100);
      }
      
      return writeSuccess
    } catch (error) {
      if (error.code === 'EPIPE') {
        Logger.warn(`🔌 [WebSocket] 客户端连接已断开 (EPIPE): ${error.message}`)
      } else if (error.code === 'ECONNRESET') {
        Logger.warn(`🔌 [WebSocket] 连接被重置 (ECONNRESET): ${error.message}`)
      } else {
        Logger.error(`❌ [WebSocket] 帧发送失败: ${error.message}`)
      }
      return false
    }
  }

  /**
   * 处理WebSocket认证超时
   */
  handleAuthTimeout(upgradeId, authState) {
    Logger.warn(`⏰ WebSocket认证超时: ${upgradeId}`);
    Logger.warn(`🔍 [认证诊断] 认证状态分析:`);
    Logger.warn(`   - 需要认证: ${authState.required}`);
    Logger.warn(`   - 已发送响应: ${authState.responseSent}`);
    Logger.warn(`   - 最后活动时间: ${new Date(authState.lastActivityTime).toISOString()}`);
    Logger.warn(`   - 超时时间: ${new Date().toISOString()}`);

    const wsConnection = this.requestQueue.get(`ws_${upgradeId}`);
    if (!wsConnection || wsConnection.type !== 'websocket_connection') {
      Logger.warn(`🔍 [认证诊断] 未找到WebSocket连接: ${upgradeId}`);
      return;
    }

    // 如果已经发送了认证响应或没有要求认证，就不需要补偿
    if (authState.responseSent || !authState.required) {
      Logger.warn(`🔍 [认证诊断] 跳过超时处理 - 已处理或无需认证`);
      return;
    }

    Logger.warn(`🔍 [认证诊断] iOS可能的认证问题:`);
    Logger.warn(`   1. iOS应用没有收到auth_required消息`);
    Logger.warn(`   2. iOS应用发送了认证消息但格式不正确`);
    Logger.warn(`   3. WebSocket帧解析出现问题`);
    Logger.warn(`   4. 网络传输中认证消息丢失`);
  }

  /**
   * 处理WebSocket关闭
   */
  handleWebSocketClose(clientInfo, message) {
    const { upgrade_id } = message;
    const wsConnection = this.requestQueue.get(`ws_${upgrade_id}`);
    if (wsConnection && wsConnection.type === 'websocket_connection') {
      // WebSocket连接已在其他地方处理关闭
    }
  }

  /**
   * 发送代理请求给客户端
   */
  sendProxyRequest(clientInfo, req, res, ctx = null) {
    const requestId = Utils.generateRequestId();

    // 存储请求信息
    this.requestQueue.set(requestId, { req, res, clientInfo, timestamp: Date.now() });

    // 处理请求体
    this.processProxyRequestBody(clientInfo, req, res, ctx, requestId);

    // 设置超时
    setTimeout(() => {
      if (this.requestQueue.has(requestId)) {
        this.requestQueue.delete(requestId);
        if (!res.headersSent) {
          res.statusCode = 504;
          res.end('Gateway Timeout');
        }
        Logger.warn(`代理请求超时: ${requestId}`);
      }
    }, 30000); // 30秒超时
  }

  /**
   * 处理代理请求体 - 修复以支持原始请求体传输
   */
  processProxyRequestBody(clientInfo, req, res, ctx, requestId) {
    // 使用 Koa 上下文中的原始请求体
    if (ctx && ctx.rawBody) {
      // 直接使用原始 Buffer，确保100%保真度
      const body = ctx.rawBody.toString('base64'); // 使用 base64 编码传输二进制数据
      this.sendProxyMessage(clientInfo, req, body, requestId);
    } else {
      // 回退到标准处理（兼容性）
      this.handleStandardRequest(clientInfo, req, requestId);
    }
  }

  /**
   * 处理multipart请求 - 使用原始数据
   */
  handleMultipartRequest(clientInfo, req, ctx, requestId) {
    if (ctx && ctx.rawBody) {
      const body = ctx.rawBody.toString('base64');
      this.sendProxyMessage(clientInfo, req, body, requestId);
    } else {
      // 回退处理
      let bodyBuffer = Buffer.alloc(0);
      ctx.req.on('data', chunk => {
        bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
      });

      ctx.req.on('end', () => {
        const body = bodyBuffer.toString('base64');
        this.sendProxyMessage(clientInfo, req, body, requestId);
      });
    }
  }

  /**
   * 处理标准请求 - 保持二进制完整性
   */
  handleStandardRequest(clientInfo, req, requestId) {
    let bodyBuffer = Buffer.alloc(0);
    
    req.on('data', chunk => {
      bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    });

    req.on('end', () => {
      const body = bodyBuffer.length > 0 ? bodyBuffer.toString('base64') : '';
      this.sendProxyMessage(clientInfo, req, body, requestId);
    });
  }

  /**
   * 发送代理消息
   */
  sendProxyMessage(clientInfo, req, body, requestId) {
    const message = {
      type: 'proxy_request',
      request_id: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body,
      timestamp: Date.now()
    };

    this.sendMessage(clientInfo.socket, message);
  }

  /**
   * 发送消息给客户端
   */
  sendMessage(socket, message) {
    try {
      // 检查socket状态
      if (!socket) {
        Logger.warn(`⚠️ [sendMessage] Socket为null或undefined`);
        return false;
      }

      if (!socket.writable) {
        Logger.warn(`⚠️ [sendMessage] Socket不可写: readyState=${socket.readyState}, destroyed=${socket.destroyed}`);
        return false;
      }

      if (socket.destroyed) {
        Logger.warn(`⚠️ [sendMessage] Socket已销毁`);
        return false;
      }

      const data = Utils.safeJsonStringify(message) + '\n';
      const success = socket.write(data);
      
      if (!success) {
        Logger.warn(`⚠️ [sendMessage] Socket缓冲区已满，消息可能被丢弃`);
      }
      
      return success;
    } catch (error) {
      if (error.code === 'EPIPE') {
        Logger.warn(`🔌 [sendMessage] 客户端连接已断开 (EPIPE): ${error.message}`);
      } else if (error.code === 'ECONNRESET') {
        Logger.warn(`🔌 [sendMessage] 连接被重置 (ECONNRESET): ${error.message}`);
      } else {
        Logger.error(`❌ [sendMessage] 发送消息失败: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * 启动心跳检查
   */
  startHeartbeatCheck() {
    setInterval(() => {
      const now = Date.now();

      // 清理超时的客户端
      this.clientManager.cleanupTimeoutClients();

      // 清理过期请求
      this.cleanupExpiredRequests(now);
    }, CONFIG.HEARTBEAT_INTERVAL);
  }
  /**
   * 清理过期请求
   */
  cleanupExpiredRequests(now) {
    for (const [requestId, requestInfo] of this.requestQueue.entries()) {
      if (now - requestInfo.timestamp > 30000) {
        this.requestQueue.delete(requestId);
        if (requestInfo.res && !requestInfo.res.headersSent) {
          requestInfo.res.statusCode = 504;
          requestInfo.res.end('Request Timeout');
        }
        Logger.warn(`清理过期请求: ${requestId}`);
      }
    }
  }

  /**
   * 停止服务器
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        Logger.info('隧道服务器已停止');
      });
    }
  }

  /**
   * 获取服务器状态
   */
  getStatus() {
    return {
      isRunning: !!this.server && this.server.listening,
      port: CONFIG.TUNNEL_PORT,
      activeRequests: this.requestQueue.size,
      clientCount: this.clientManager.getClientCount()
    };
  }
}

module.exports = TunnelServer;
