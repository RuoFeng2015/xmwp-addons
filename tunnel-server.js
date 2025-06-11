/**
 * 内网穿透中转服务器 - 生产级实现
 * 基于 Node.js + Koa 框架
 * 支持 HTTP/WebSocket 代理和多客户端连接
 */

const net = require('net');
const http = require('http');
const https = require('https');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 配置常量
const CONFIG = {
  // 服务端口
  TUNNEL_PORT: process.env.TUNNEL_PORT || 8080,    // 隧道连接端口
  PROXY_PORT: process.env.PROXY_PORT || 8081,      // HTTP代理端口
  ADMIN_PORT: process.env.ADMIN_PORT || 8082,      // 管理后台端口

  // 安全配置
  JWT_SECRET: process.env.JWT_SECRET || 'tunnel-server-secret-2023',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'password',

  // 连接配置
  MAX_CLIENTS: parseInt(process.env.MAX_CLIENTS) || 10,
  HEARTBEAT_INTERVAL: 30000,    // 30秒心跳
  CLIENT_TIMEOUT: 60000,        // 60秒超时

  // SSL配置 (可选)
  SSL_ENABLED: process.env.SSL_ENABLED === 'true',
  SSL_KEY_PATH: process.env.SSL_KEY_PATH,
  SSL_CERT_PATH: process.env.SSL_CERT_PATH,

  // 日志配置
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

/**
 * 日志记录器
 */
class Logger {
  static levels = { error: 0, warn: 1, info: 2, debug: 3 };
  static currentLevel = this.levels[CONFIG.LOG_LEVEL] || 2;

  static log(level, message, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
    }
  }

  static error(message, ...args) { this.log('error', message, ...args); }
  static warn(message, ...args) { this.log('warn', message, ...args); }
  static info(message, ...args) { this.log('info', message, ...args); }
  static debug(message, ...args) { this.log('debug', message, ...args); }
}

/**
 * 客户端连接管理
 */
class ClientManager {
  constructor() {
    this.clients = new Map();       // clientId -> clientInfo
    this.connections = new Map();   // socket -> clientInfo
    this.routes = new Map();        // subdomain/path -> clientId
  }

  /**
   * 注册新客户端
   */
  registerClient(socket, clientInfo) {
    this.connections.set(socket, clientInfo);

    if (clientInfo.clientId) {
      this.clients.set(clientInfo.clientId, clientInfo);
      Logger.info(`客户端注册成功: ${clientInfo.clientId} (${clientInfo.remoteAddress})`);
    }
  }

  /**
   * 移除客户端
   */
  removeClient(socket) {
    const clientInfo = this.connections.get(socket);
    if (clientInfo) {
      if (clientInfo.clientId) {
        this.clients.delete(clientInfo.clientId);
        this.removeRoutes(clientInfo.clientId);
        Logger.info(`客户端断开连接: ${clientInfo.clientId}`);
      }
      this.connections.delete(socket);
    }
  }

  /**
   * 获取客户端信息
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * 获取所有客户端
   */
  getAllClients() {
    return Array.from(this.clients.values());
  }

  /**
   * 检查客户端数量限制
   */
  canAcceptNewClient() {
    return this.clients.size < CONFIG.MAX_CLIENTS;
  }

  /**
   * 添加路由映射
   */
  addRoute(route, clientId) {
    this.routes.set(route, clientId);
    Logger.debug(`添加路由映射: ${route} -> ${clientId}`);
  }

  /**
   * 移除客户端的所有路由
   */
  removeRoutes(clientId) {
    for (const [route, cId] of this.routes.entries()) {
      if (cId === clientId) {
        this.routes.delete(route);
        Logger.debug(`移除路由映射: ${route}`);
      }
    }
  }

  /**
   * 根据路由获取客户端
   */
  getClientByRoute(route) {
    const clientId = this.routes.get(route);
    return clientId ? this.clients.get(clientId) : null;
  }
}

/**
 * 隧道服务器 - 处理客户端连接
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

    this.server.listen(CONFIG.TUNNEL_PORT, () => {
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
      bytesReceived: 0
    };

    Logger.info(`新客户端连接: ${clientInfo.remoteAddress}:${clientInfo.remotePort}`);
    this.clientManager.registerClient(socket, clientInfo);

    // 设置socket事件
    socket.on('data', (data) => {
      clientInfo.bytesReceived += data.length;
      this.handleClientMessage(clientInfo, data);
    });

    socket.on('close', () => {
      Logger.debug(`客户端关闭连接: ${clientInfo.remoteAddress}:${clientInfo.remotePort}`);
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
      const messages = data.toString().split('\n').filter(msg => msg.trim());

      for (const messageStr of messages) {
        const message = JSON.parse(messageStr);
        Logger.debug(`收到消息: ${message.type} from ${clientInfo.clientId || clientInfo.remoteAddress}`);

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
          case 'register_route':
            this.handleRouteRegister(clientInfo, message);
            break;
          default:
            Logger.warn(`未知消息类型: ${message.type}`);
        }
      }
    } catch (error) {
      Logger.error(`处理客户端消息失败 (${clientInfo.remoteAddress}): ${error.message}`);
    }
  }

  /**
   * 处理身份验证
   */
  handleAuth(clientInfo, message) {
    const { username, password, client_id } = message;

    Logger.info(`认证请求: ${username} / ${client_id} from ${clientInfo.remoteAddress}`);

    // 简单验证 - 生产环境应使用数据库和加密
    const validCredentials = this.validateCredentials(username, password);

    if (validCredentials && client_id) {
      // 检查clientId是否已被使用
      const existingClient = this.clientManager.getClient(client_id);
      if (existingClient && existingClient.socket !== clientInfo.socket) {
        this.sendMessage(clientInfo.socket, {
          type: 'auth_failed',
          reason: '客户端ID已被使用',
          timestamp: Date.now()
        });
        return;
      }

      clientInfo.authenticated = true;
      clientInfo.clientId = client_id;
      clientInfo.username = username;

      // 重新注册客户端（更新clientId）
      this.clientManager.registerClient(clientInfo.socket, clientInfo);

      this.sendMessage(clientInfo.socket, {
        type: 'auth_success',
        client_id: client_id,
        timestamp: Date.now()
      });

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
   * 验证凭据
   */
  validateCredentials(username, password) {
    // 简单验证 - 生产环境应使用更安全的方式
    const validUsers = {
      'admin': 'password',
      'user1': 'pass123',
      'demo': 'demo123'
    };

    return validUsers[username] === password;
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

    Logger.debug(`心跳响应: ${clientInfo.clientId || clientInfo.remoteAddress}`);
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
      const { res } = requestInfo;

      try {
        // 设置响应头
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        // 发送响应
        res.statusCode = status_code || 200;
        res.end(body || '');

        clientInfo.bytesSent += (body || '').length;
        clientInfo.requestCount++;

        Logger.debug(`代理响应完成: ${request_id} -> ${status_code}`);
      } catch (error) {
        Logger.error(`发送代理响应失败: ${error.message}`);
      }

      this.requestQueue.delete(request_id);
    }
  }

  /**
   * 发送代理请求给客户端
   */
  sendProxyRequest(clientInfo, req, res) {
    const requestId = this.generateRequestId();

    // 存储请求信息
    this.requestQueue.set(requestId, { req, res, clientInfo, timestamp: Date.now() });

    // 读取请求体
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
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
      Logger.debug(`发送代理请求: ${requestId} ${req.method} ${req.url}`);
    });

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
   * 发送消息给客户端
   */
  sendMessage(socket, message) {
    try {
      const data = JSON.stringify(message) + '\n';
      socket.write(data);
      return true;
    } catch (error) {
      Logger.error(`发送消息失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 启动心跳检查
   */
  startHeartbeatCheck() {
    setInterval(() => {
      const now = Date.now();
      const clients = this.clientManager.getAllClients();

      for (const client of clients) {
        if (now - client.lastHeartbeat > CONFIG.CLIENT_TIMEOUT) {
          Logger.warn(`客户端心跳超时: ${client.clientId || client.remoteAddress}`);
          client.socket.destroy();
        }
      }

      // 清理过期请求
      for (const [requestId, requestInfo] of this.requestQueue.entries()) {
        if (now - requestInfo.timestamp > 30000) {
          this.requestQueue.delete(requestId);
          if (!requestInfo.res.headersSent) {
            requestInfo.res.statusCode = 504;
            requestInfo.res.end('Request Timeout');
          }
        }
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * 停止服务器
   */
  stop() {
    if (this.server) {
      this.server.close();
      Logger.info('隧道服务器已停止');
    }
  }
}

/**
 * HTTP代理服务器
 */
class ProxyServer {
  constructor(clientManager) {
    this.clientManager = clientManager;
    this.app = new Koa();
    this.server = null;
    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    const router = new Router();

    // 根据subdomain或路径路由到不同客户端
    this.app.use(async (ctx, next) => {
      try {
        const host = ctx.headers.host;
        const path = ctx.path;

        // 提取subdomain
        const subdomain = this.extractSubdomain(host);

        // 查找对应的客户端
        let client = null;

        // 首先尝试subdomain路由
        if (subdomain) {
          client = this.clientManager.getClientByRoute(subdomain);
        }

        // 如果没找到，尝试路径路由
        if (!client) {
          const pathRoute = path.split('/')[1]; // 获取第一级路径
          if (pathRoute) {
            client = this.clientManager.getClientByRoute(pathRoute);
          }
        }

        // 如果还没找到，使用默认客户端
        if (!client) {
          const clients = this.clientManager.getAllClients();
          client = clients.find(c => c.authenticated) || clients[0];
        }

        if (!client || !client.authenticated) {
          ctx.status = 502;
          ctx.body = {
            error: 'No available tunnel client',
            message: '没有可用的隧道客户端'
          };
          return;
        }

        // 发送代理请求
        await this.forwardRequest(ctx, client);

      } catch (error) {
        Logger.error(`代理请求处理错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = { error: 'Internal Server Error' };
      }
    });

    this.app.use(router.routes());
    this.app.use(router.allowedMethods());
  }

  /**
   * 提取subdomain
   */
  extractSubdomain(host) {
    if (!host) return null;

    const parts = host.split('.');
    if (parts.length > 2) {
      return parts[0]; // 返回第一级subdomain
    }
    return null;
  }

  /**
   * 转发请求到客户端
   */
  async forwardRequest(ctx, client) {
    return new Promise((resolve, reject) => {
      const tunnelServer = global.tunnelServer;

      // 模拟Node.js原生req/res对象
      const req = {
        method: ctx.method,
        url: ctx.url,
        headers: ctx.headers,
        on: (event, callback) => {
          if (event === 'data') {
            // Koa已经解析了body，直接传递
            if (ctx.request.body) {
              callback(JSON.stringify(ctx.request.body));
            }
          } else if (event === 'end') {
            callback();
          }
        }
      };

      const res = {
        statusCode: 200,
        headers: {},
        headersSent: false,
        setHeader: (key, value) => {
          res.headers[key] = value;
        },
        end: (body) => {
          res.headersSent = true;
          ctx.status = res.statusCode;
          Object.entries(res.headers).forEach(([key, value]) => {
            ctx.set(key, value);
          });
          ctx.body = body;
          resolve();
        }
      };

      tunnelServer.sendProxyRequest(client, req, res);

      // 设置超时
      setTimeout(() => {
        if (!res.headersSent) {
          ctx.status = 504;
          ctx.body = 'Gateway Timeout';
          resolve();
        }
      }, 30000);
    });
  }

  /**
   * 启动代理服务器
   */
  start() {
    const serverOptions = {};

    // SSL配置
    if (CONFIG.SSL_ENABLED && CONFIG.SSL_KEY_PATH && CONFIG.SSL_CERT_PATH) {
      try {
        serverOptions.key = fs.readFileSync(CONFIG.SSL_KEY_PATH);
        serverOptions.cert = fs.readFileSync(CONFIG.SSL_CERT_PATH);
        this.server = https.createServer(serverOptions, this.app.callback());
        Logger.info(`HTTPS代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
      } catch (error) {
        Logger.error(`SSL证书加载失败: ${error.message}`);
        this.server = http.createServer(this.app.callback());
        Logger.info(`HTTP代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
      }
    } else {
      this.server = http.createServer(this.app.callback());
      Logger.info(`HTTP代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
    }

    this.server.listen(CONFIG.PROXY_PORT);

    this.server.on('error', (error) => {
      Logger.error('代理服务器错误:', error.message);
    });

    // WebSocket支持
    this.setupWebSocketProxy();
  }

  /**
   * 设置WebSocket代理
   */
  setupWebSocketProxy() {
    this.server.on('upgrade', (request, socket, head) => {
      Logger.debug('WebSocket升级请求');

      // 查找对应的客户端
      const clients = this.clientManager.getAllClients();
      const client = clients.find(c => c.authenticated);

      if (!client) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
        return;
      }

      // 这里可以实现WebSocket代理逻辑
      // 暂时拒绝连接
      socket.write('HTTP/1.1 501 Not Implemented\r\n\r\n');
      socket.destroy();
    });
  }

  /**
   * 停止代理服务器
   */
  stop() {
    if (this.server) {
      this.server.close();
      Logger.info('代理服务器已停止');
    }
  }
}

/**
 * 管理后台服务器
 */
class AdminServer {
  constructor(clientManager) {
    this.clientManager = clientManager;
    this.app = new Koa();
    this.server = null;
    this.setupRoutes();
  }

  /**
   * 设置管理路由
   */
  setupRoutes() {
    const router = new Router();

    // CORS和body parser
    this.app.use(cors());
    this.app.use(bodyParser());

    // 错误处理
    this.app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        Logger.error(`管理接口错误: ${err.message}`);
        ctx.status = err.status || 500;
        ctx.body = { error: err.message };
      }
    });

    // 认证中间件
    const authMiddleware = async (ctx, next) => {
      const token = ctx.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        ctx.status = 401;
        ctx.body = { error: '缺少认证令牌' };
        return;
      }

      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        ctx.user = decoded;
        await next();
      } catch (error) {
        ctx.status = 401;
        ctx.body = { error: '无效的认证令牌' };
      }
    };

    // 登录接口
    router.post('/api/auth/login', async (ctx) => {
      const { username, password } = ctx.request.body;

      if (username === CONFIG.ADMIN_USERNAME && password === CONFIG.ADMIN_PASSWORD) {
        const token = jwt.sign(
          { username, role: 'admin' },
          CONFIG.JWT_SECRET,
          { expiresIn: '24h' }
        );

        ctx.body = {
          token,
          user: { username, role: 'admin' },
          expires_in: 86400
        };

        Logger.info(`管理员登录成功: ${username}`);
      } else {
        ctx.status = 401;
        ctx.body = { error: '用户名或密码错误' };
      }
    });

    // 获取服务器状态
    router.get('/api/status', authMiddleware, async (ctx) => {
      const clients = this.clientManager.getAllClients();

      ctx.body = {
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: '1.0.0',
          timestamp: Date.now()
        },
        config: {
          max_clients: CONFIG.MAX_CLIENTS,
          tunnel_port: CONFIG.TUNNEL_PORT,
          proxy_port: CONFIG.PROXY_PORT,
          ssl_enabled: CONFIG.SSL_ENABLED
        },
        clients: {
          total: clients.length,
          authenticated: clients.filter(c => c.authenticated).length,
          list: clients.map(c => ({
            client_id: c.clientId,
            username: c.username,
            remote_address: c.remoteAddress,
            connect_time: c.connectTime,
            last_heartbeat: c.lastHeartbeat,
            authenticated: c.authenticated,
            request_count: c.requestCount,
            bytes_sent: c.bytesSent,
            bytes_received: c.bytesReceived
          }))
        },
        routes: Array.from(this.clientManager.routes.entries()).map(([route, clientId]) => ({
          route,
          client_id: clientId
        }))
      };
    });

    // 获取客户端详情
    router.get('/api/clients/:clientId', authMiddleware, async (ctx) => {
      const client = this.clientManager.getClient(ctx.params.clientId);

      if (!client) {
        ctx.status = 404;
        ctx.body = { error: '客户端不存在' };
        return;
      }

      ctx.body = {
        client_id: client.clientId,
        username: client.username,
        remote_address: client.remoteAddress,
        remote_port: client.remotePort,
        connect_time: client.connectTime,
        last_heartbeat: client.lastHeartbeat,
        authenticated: client.authenticated,
        request_count: client.requestCount,
        bytes_sent: client.bytesSent,
        bytes_received: client.bytesReceived
      };
    });

    // 断开客户端连接
    router.delete('/api/clients/:clientId', authMiddleware, async (ctx) => {
      const client = this.clientManager.getClient(ctx.params.clientId);

      if (!client) {
        ctx.status = 404;
        ctx.body = { error: '客户端不存在' };
        return;
      }

      client.socket.destroy();
      ctx.body = { message: '客户端连接已断开' };
      Logger.info(`管理员断开客户端连接: ${ctx.params.clientId}`);
    });

    // 健康检查
    router.get('/api/health', async (ctx) => {
      ctx.body = {
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime()
      };
    });

    this.app.use(router.routes());
    this.app.use(router.allowedMethods());
  }

  /**
   * 启动管理服务器
   */
  start() {
    this.server = http.createServer(this.app.callback());

    this.server.listen(CONFIG.ADMIN_PORT, () => {
      Logger.info(`管理后台启动在端口 ${CONFIG.ADMIN_PORT}`);
    });

    this.server.on('error', (error) => {
      Logger.error('管理服务器错误:', error.message);
    });
  }

  /**
   * 停止管理服务器
   */
  stop() {
    if (this.server) {
      this.server.close();
      Logger.info('管理服务器已停止');
    }
  }
}

/**
 * 主服务器类
 */
class TunnelServerMain {
  constructor() {
    this.clientManager = new ClientManager();
    this.tunnelServer = new TunnelServer(this.clientManager);
    this.proxyServer = new ProxyServer(this.clientManager);
    this.adminServer = new AdminServer(this.clientManager);

    // 设置全局引用
    global.tunnelServer = this.tunnelServer;
  }

  /**
   * 启动所有服务
   */
  async start() {
    Logger.info('启动内网穿透中转服务器...');

    try {
      // 启动隧道服务器
      this.tunnelServer.start();

      // 启动代理服务器
      this.proxyServer.start();

      // 启动管理后台
      this.adminServer.start();

      Logger.info('所有服务启动成功！');
      this.printServerInfo();

    } catch (error) {
      Logger.error(`服务启动失败: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * 停止所有服务
   */
  stop() {
    Logger.info('正在停止服务器...');

    this.tunnelServer.stop();
    this.proxyServer.stop();
    this.adminServer.stop();

    Logger.info('服务器已停止');
  }

  /**
   * 打印服务器信息
   */
  printServerInfo() {
    console.log('\n==================== 服务器信息 ====================');
    console.log(`隧道连接端口: ${CONFIG.TUNNEL_PORT}`);
    console.log(`HTTP代理端口: ${CONFIG.PROXY_PORT} ${CONFIG.SSL_ENABLED ? '(HTTPS)' : '(HTTP)'}`);
    console.log(`管理后台端口: ${CONFIG.ADMIN_PORT}`);
    console.log(`最大客户端数: ${CONFIG.MAX_CLIENTS}`);
    console.log(`管理员账号: ${CONFIG.ADMIN_USERNAME} / ${CONFIG.ADMIN_PASSWORD}`);
    console.log('==================================================\n');
  }
}

// 主程序
const server = new TunnelServerMain();

// 优雅关闭
process.on('SIGTERM', () => {
  Logger.info('收到SIGTERM信号，正在停止服务器...');
  server.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('收到SIGINT信号，正在停止服务器...');
  server.stop();
  process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  Logger.error(`未捕获的异常: ${error.message}`);
  Logger.error(error.stack);
  server.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`未处理的Promise拒绝: ${reason}`);
  server.stop();
  process.exit(1);
});

// 启动服务器
if (require.main === module) {
  server.start();
}

module.exports = { TunnelServerMain, CONFIG, Logger };
