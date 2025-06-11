const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const koaStatic = require('koa-static');
const http = require('http');
const httpProxy = require('http-proxy');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const net = require('net');
const TunnelClient = require('./tunnel-client');

// 配置文件路径
const CONFIG_PATH = process.env.NODE_ENV === 'development'
  ? path.join(__dirname, 'config-dev.json')
  : '/data/options.json';
const JWT_SECRET = 'ha-tunnel-proxy-secret-key-2023';

// 全局变量
let config = {};
let server = null;
let proxy = null;
let tunnelClient = null;
let connectionStatus = 'disconnected';
let lastHeartbeat = null;
let activeConnections = new Map(); // 存储活跃连接

/**
 * 日志工具类
 */
class Logger {
  static info(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  }

  static error(message) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
  }

  static warn(message) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  }

  static debug(message) {
    if (config.log_level === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
  }
}

/**
 * 配置管理类
 */
class ConfigManager {
  static loadConfig() {
    try {
      // 检查配置文件是否存在
      if (!fs.existsSync(CONFIG_PATH)) {
        // 如果是开发环境，创建默认配置
        if (process.env.NODE_ENV === 'development') {
          Logger.warn('开发环境：配置文件不存在，使用默认配置');
          config = this.getDefaultConfig();
          // 创建开发配置文件
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
          Logger.info('已创建开发配置文件: ' + CONFIG_PATH);
          return config;
        } else {
          throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
        }
      }

      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
      Logger.info('配置文件加载成功');
      return config;
    } catch (error) {
      Logger.error(`配置文件加载失败: ${error.message}`);
      if (process.env.NODE_ENV === 'development') {
        Logger.info('开发环境：使用默认配置继续运行');
        config = this.getDefaultConfig();
        return config;
      }
      process.exit(1);
    }
  }

  static getDefaultConfig() {
    return {
      server_host: "localhost",
      server_port: 8080,
      local_ha_port: 8123,
      username: "admin",
      password: "password",
      client_id: "ha-dev-client",
      proxy_port: 9001,
      log_level: "debug"
    };
  }

  static validateConfig() {
    const required = ['server_host', 'server_port', 'username', 'password', 'client_id'];
    for (const field of required) {
      if (!config[field]) {
        Logger.error(`缺少必要配置项: ${field}`);
        process.exit(1);
      }
    }

    // 设置默认值
    config.local_ha_port = config.local_ha_port || 8123;
    config.proxy_port = config.proxy_port || 9001;
    config.log_level = config.log_level || 'info';

    Logger.info('配置验证通过');
  }
}

/**
 * 身份验证类
 */
class AuthManager {
  static generateToken(username) {
    const payload = {
      username: username,
      client_id: config.client_id,
      timestamp: Date.now()
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      Logger.warn(`Token验证失败: ${error.message}`);
      return null;
    }
  }

  static authenticate(username, password) {
    return username === config.username && password === config.password;
  }
}

/**
 * 隧道连接管理类
 */
class TunnelManager {
  static async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        Logger.info(`正在连接到中转服务器: ${config.server_host}:${config.server_port}`);

        tunnelClient = new TunnelClient({
          host: config.server_host,
          port: config.server_port,
          username: config.username,
          password: config.password,
          clientId: config.client_id
        });

        // 连接事件
        tunnelClient.on('connected', () => {
          Logger.info('隧道连接建立成功');
          connectionStatus = 'connecting';
        });

        tunnelClient.on('authenticated', () => {
          Logger.info('服务器认证成功');
          connectionStatus = 'connected';
          lastHeartbeat = Date.now();
          resolve();
        });

        tunnelClient.on('auth_failed', (reason) => {
          Logger.error(`服务器认证失败: ${reason}`);
          connectionStatus = 'auth_failed';
          reject(new Error(`认证失败: ${reason}`));
        });

        tunnelClient.on('disconnected', () => {
          Logger.warn('隧道连接已断开');
          connectionStatus = 'disconnected';
        });

        tunnelClient.on('reconnecting', (attempt) => {
          Logger.info(`正在尝试重连 (${attempt}/10)`);
          connectionStatus = 'reconnecting';
        });

        tunnelClient.on('error', (error) => {
          Logger.error(`隧道连接错误: ${error.message}`);
          connectionStatus = 'error';
          reject(error);
        });

        tunnelClient.on('proxy_request', (message) => {
          this.handleProxyRequest(message);
        });

        // 开始连接
        tunnelClient.connect();

      } catch (error) {
        Logger.error(`隧道连接失败: ${error.message}`);
        reject(error);
      }
    });
  }

  static handleProxyRequest(message) {
    Logger.debug(`处理代理请求: ${message.request_id}`);

    // 这里实现具体的代理逻辑
    // 将请求转发到本地HA实例
    try {
      // 可以在这里添加请求转发逻辑
      // 例如使用http模块转发到本地HA
    } catch (error) {
      Logger.error(`处理代理请求失败: ${error.message}`);
    }
  }

  static getStatus() {
    if (tunnelClient) {
      const status = tunnelClient.getStatus();
      return {
        connected: status.connected,
        authenticated: status.authenticated,
        last_heartbeat: status.last_heartbeat,
        connection_attempts: status.connection_attempts,
        status: connectionStatus
      };
    }
    return {
      connected: false,
      authenticated: false,
      last_heartbeat: null,
      connection_attempts: 0,
      status: connectionStatus
    };
  }

  static disconnect() {
    if (tunnelClient) {
      tunnelClient.disconnect();
      tunnelClient = null;
    }
    connectionStatus = 'disconnected';
  }
}

/**
 * 代理服务器类
 */
class ProxyServer {
  static createProxyServer() {
    const app = new Koa();
    const router = new Router();

    // 中间件
    app.use(cors());
    app.use(bodyParser());

    // 静态文件服务
    app.use(koaStatic(path.join(__dirname, 'public')));

    // 错误处理
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        Logger.error(`请求处理错误: ${err.message}`);
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

      const decoded = AuthManager.verifyToken(token);
      if (!decoded) {
        ctx.status = 401;
        ctx.body = { error: '无效的认证令牌' };
        return;
      }

      ctx.user = decoded;
      await next();
    };

    // 管理界面路由
    router.get('/', async (ctx) => {
      ctx.redirect('/index.html');
    });

    // 登录接口
    router.post('/api/auth/login', async (ctx) => {
      const { username, password } = ctx.request.body;

      if (!username || !password) {
        ctx.status = 400;
        ctx.body = { error: '用户名和密码不能为空' };
        return;
      }

      if (!AuthManager.authenticate(username, password)) {
        ctx.status = 401;
        ctx.body = { error: '用户名或密码错误' };
        return;
      }

      const token = AuthManager.generateToken(username);
      ctx.body = {
        token,
        user: { username },
        expires_in: 86400 // 24小时
      };

      Logger.info(`用户 ${username} 登录成功`);
    });        // 状态接口
    router.get('/api/status', authMiddleware, async (ctx) => {
      const tunnelStatus = TunnelManager.getStatus();
      ctx.body = {
        status: tunnelStatus.status,
        connected: tunnelStatus.connected,
        authenticated: tunnelStatus.authenticated,
        last_heartbeat: tunnelStatus.last_heartbeat,
        connection_attempts: tunnelStatus.connection_attempts,
        active_connections: activeConnections.size,
        server_host: config.server_host,
        server_port: config.server_port,
        client_id: config.client_id,
        uptime: process.uptime()
      };
    });

    // 健康检查接口
    router.get('/api/health', async (ctx) => {
      ctx.body = {
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.0'
      };
    });

    // 代理配置接口
    router.get('/api/config', authMiddleware, async (ctx) => {
      ctx.body = {
        server_host: config.server_host,
        server_port: config.server_port,
        local_ha_port: config.local_ha_port,
        proxy_port: config.proxy_port,
        client_id: config.client_id,
        log_level: config.log_level
      };
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }

  static createHttpProxy() {
    // 创建HTTP代理
    proxy = httpProxy.createProxyServer({
      target: `http://127.0.0.1:${config.local_ha_port}`,
      changeOrigin: true,
      ws: true, // 支持WebSocket
      timeout: 30000
    });

    proxy.on('error', (err, req, res) => {
      Logger.error(`代理错误: ${err.message}`);
      if (res && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('代理服务器错误');
      }
    });

    proxy.on('proxyReq', (proxyReq, req, res) => {
      Logger.debug(`代理请求: ${req.method} ${req.url}`);

      // 记录活跃连接
      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      activeConnections.set(connectionId, {
        timestamp: Date.now(),
        method: req.method,
        url: req.url
      });
    });

    proxy.on('proxyRes', (proxyRes, req, res) => {
      Logger.debug(`代理响应: ${proxyRes.statusCode} ${req.url}`);

      // 清理连接记录
      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      activeConnections.delete(connectionId);
    });

    return proxy;
  }
}

/**
 * 主应用类
 */
class TunnelProxyApp {
  static async start() {
    try {
      Logger.info('正在启动内网穿透代理服务...');

      // 加载和验证配置
      ConfigManager.loadConfig();
      ConfigManager.validateConfig();

      // 创建代理服务器
      const app = ProxyServer.createProxyServer();
      const httpProxy = ProxyServer.createHttpProxy();

      // 启动HTTP服务器
      server = http.createServer(app.callback());

      // 处理代理请求
      server.on('request', (req, res) => {
        // 这里可以添加认证逻辑
        httpProxy.web(req, res);
      });

      // 处理WebSocket升级
      server.on('upgrade', (req, socket, head) => {
        Logger.debug('WebSocket升级请求');
        httpProxy.ws(req, socket, head);
      });            // 启动服务器
      server.listen(config.proxy_port, () => {
        Logger.info(`代理服务器已启动，监听端口: ${config.proxy_port}`);
      });

      // 处理端口冲突
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          if (process.env.NODE_ENV === 'development') {
            Logger.warn(`端口 ${config.proxy_port} 被占用，尝试其他端口...`);
            config.proxy_port = config.proxy_port + 1;
            setTimeout(() => {
              server.listen(config.proxy_port, () => {
                Logger.info(`代理服务器已启动，监听端口: ${config.proxy_port}`);
              });
            }, 1000);
          } else {
            Logger.error(`端口 ${config.proxy_port} 被占用`);
            throw error;
          }
        } else {
          throw error;
        }
      });

      // 连接到中转服务器
      try {
        await TunnelManager.connectToServer();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          Logger.warn(`开发环境：中转服务器连接失败，但服务将继续运行: ${error.message}`);
        } else {
          throw error;
        }
      }

      // 清理过期连接
      setInterval(() => {
        const now = Date.now();
        for (const [connectionId, connection] of activeConnections.entries()) {
          if (now - connection.timestamp > 300000) { // 5分钟超时
            activeConnections.delete(connectionId);
          }
        }
      }, 60000); // 1分钟清理一次

      Logger.info('内网穿透代理服务启动成功！');

    } catch (error) {
      Logger.error(`服务启动失败: ${error.message}`);
      if (process.env.NODE_ENV !== 'development') {
        process.exit(1);
      } else {
        Logger.warn('开发环境：忽略启动错误，服务将继续运行');
      }
    }
  }

  static async stop() {
    Logger.info('正在停止服务...');

    TunnelManager.disconnect();

    if (server) {
      server.close();
    }

    if (proxy) {
      proxy.close();
    }

    Logger.info('服务已停止');
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  Logger.info('收到SIGTERM信号，正在优雅关闭...');
  TunnelProxyApp.stop().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  Logger.info('收到SIGINT信号，正在优雅关闭...');
  TunnelProxyApp.stop().then(() => {
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  Logger.error(`未捕获的异常: ${error.message}`);
  Logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`未处理的Promise拒绝: ${reason}`);
});

// 启动应用
if (require.main === module) {
  TunnelProxyApp.start();
}

module.exports = TunnelProxyApp;
