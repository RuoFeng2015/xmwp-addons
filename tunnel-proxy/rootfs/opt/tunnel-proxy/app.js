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
    Logger.debug(`处理代理请求: ${message.request_id} ${message.method} ${message.url}`);

    try {
      const http = require('http');
      const https = require('https');
      const url = require('url');
        // 构建目标URL - 强制使用IPv4地址
      const targetUrl = `http://127.0.0.1:${config.local_ha_port}${message.url}`;
      const parsedUrl = url.parse(targetUrl);
      
      Logger.debug(`转发请求到: ${targetUrl}`);

      // 创建请求选项 - 强制使用IPv4
      const options = {
        hostname: '127.0.0.1',  // 强制IPv4
        port: config.local_ha_port,
        path: message.url,  // 使用原始URL路径
        method: message.method,
        headers: { ...message.headers },
        family: 4  // 强制IPv4
      };

      // 移除可能导致问题的头信息
      delete options.headers['host'];
      delete options.headers['connection'];
      delete options.headers['content-length'];

      // 创建请求
      const proxyReq = http.request(options, (proxyRes) => {
        Logger.debug(`收到本地响应: ${proxyRes.statusCode}`);

        // 读取响应体
        let responseBody = '';
        proxyRes.on('data', chunk => {
          responseBody += chunk.toString();
        });

        proxyRes.on('end', () => {
          // 发送响应回服务器
          const response = {
            type: 'proxy_response',
            request_id: message.request_id,
            status_code: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody
          };

          tunnelClient.send(response);
          Logger.debug(`代理响应已发送: ${message.request_id}`);
        });
      });      // 处理请求错误
      proxyReq.on('error', (error) => {
        Logger.error(`代理请求失败: ${error.message}`);
        Logger.error(`目标地址: 127.0.0.1:${config.local_ha_port}`);
        Logger.error(`请确认Home Assistant正在运行并监听端口${config.local_ha_port}`);
        
        // 发送错误响应
        const errorResponse = {
          type: 'proxy_response',
          request_id: message.request_id,
          status_code: 502,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: `
            <html>
              <head><title>代理错误</title></head>
              <body>
                <h1>内网穿透代理错误</h1>
                <p><strong>错误信息:</strong> ${error.message}</p>
                <p><strong>目标地址:</strong> 127.0.0.1:${config.local_ha_port}</p>
                <p><strong>可能原因:</strong></p>
                <ul>
                  <li>Home Assistant未运行或未在端口${config.local_ha_port}监听</li>
                  <li>防火墙阻止了连接</li>
                  <li>Home Assistant配置了特定的绑定地址</li>
                </ul>
                <p><strong>解决方案:</strong></p>
                <ul>
                  <li>检查Home Assistant是否正常运行</li>
                  <li>确认Home Assistant监听在正确的端口</li>
                  <li>检查插件配置中的local_ha_port设置</li>
                </ul>
              </body>
            </html>
          `
        };

        tunnelClient.send(errorResponse);
      });

      // 设置请求超时
      proxyReq.setTimeout(25000, () => {
        Logger.warn(`代理请求超时: ${message.request_id}`);
        proxyReq.destroy();
        
        // 发送超时响应
        const timeoutResponse = {
          type: 'proxy_response',
          request_id: message.request_id,
          status_code: 504,
          headers: { 'content-type': 'text/plain' },
          body: 'Gateway Timeout'
        };

        tunnelClient.send(timeoutResponse);
      });

      // 发送请求体（如果有）
      if (message.body) {
        proxyReq.write(message.body);
      }
      
      proxyReq.end();

    } catch (error) {
      Logger.error(`处理代理请求失败: ${error.message}`);
      
      // 发送错误响应
      const errorResponse = {
        type: 'proxy_response',
        request_id: message.request_id,
        status_code: 500,
        headers: { 'content-type': 'text/plain' },
        body: `Internal Error: ${error.message}`
      };

      if (tunnelClient) {
        tunnelClient.send(errorResponse);
      }
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

  /**
   * 测试本地Home Assistant连接
   */
  static async testLocalConnection() {
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: config.local_ha_port,
        path: '/',
        method: 'GET',
        timeout: 5000,
        family: 4
      };

      const req = http.request(options, (res) => {
        Logger.info(`本地HA连接测试成功: HTTP ${res.statusCode}`);
        resolve(true);
      });

      req.on('error', (error) => {
        Logger.error(`本地HA连接测试失败: ${error.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        Logger.error(`本地HA连接测试超时`);
        req.destroy();
        resolve(false);
      });

      req.end();
    });
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

      // 测试本地Home Assistant连接
      setTimeout(async () => {
        Logger.info('正在测试本地Home Assistant连接...');
        const connectionOk = await TunnelProxy.testLocalConnection();
        if (connectionOk) {
          Logger.info(`✅ 本地Home Assistant连接正常 (127.0.0.1:${config.local_ha_port})`);
        } else {
          Logger.warn(`⚠️  无法连接到本地Home Assistant (127.0.0.1:${config.local_ha_port})`);
          Logger.warn('请检查Home Assistant是否正在运行并确认端口配置');
        }
      }, 2000); // 启动2秒后测试

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
