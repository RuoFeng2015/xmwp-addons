/**
 * HTTP代理服务器模块
 * 处理HTTP请求转发和WebSocket升级
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const { CONFIG } = require('../core/config');
const Logger = require('../core/logger');
const Utils = require('../utils/utils');

/**
 * HTTP代理服务器类
 */
class ProxyServer {
  constructor(clientManager) {
    this.clientManager = clientManager;
    this.app = new Koa();
    this.server = null;
    this.requestQueue = new Map(); // 存储待处理的请求
    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    // 简化的CORS配置 - 避免过度配置导致兼容性问题
    this.app.use(cors({
      origin: '*',
      credentials: true
    }));

    // RAW body parser - 保持原始请求体，确保100%还原转发
    this.app.use(async (ctx, next) => {
      // 对于有 body 的请求，我们需要保持原始数据
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        const body = [];
        ctx.req.on('data', chunk => body.push(chunk));
        
        await new Promise((resolve) => {
          ctx.req.on('end', () => {
            ctx.rawBody = Buffer.concat(body);
            
            // 特别记录OAuth请求的原始数据
            if (ctx.url && ctx.url.includes('/auth/token')) {
              Logger.info(`🔐 [服务器收到OAuth] 原始请求体长度: ${ctx.rawBody.length} bytes`);
              if (ctx.rawBody.length > 0) {
                const bodyString = ctx.rawBody.toString();
                Logger.info(`🔐 [服务器收到OAuth] 请求体内容: ${bodyString}`);
                
                // 检查OAuth请求类型
                const isTokenExchange = bodyString.includes('grant_type=authorization_code');
                const isTokenRevoke = bodyString.includes('action=revoke');
                const isTokenRefresh = bodyString.includes('grant_type=refresh_token');
                
                Logger.info(`🔐 [服务器OAuth分析] 请求体长度: ${ctx.rawBody.length} bytes`);
                Logger.info(`🔐 [服务器OAuth分析] isTokenExchange: ${isTokenExchange}, isTokenRevoke: ${isTokenRevoke}, isTokenRefresh: ${isTokenRefresh}`);
                
                if (isTokenExchange) {
                  Logger.info(`🔐 [服务器OAuth类型] *** AUTHORIZATION CODE交换请求 (关键!) ***`);
                  const hasGrantType = bodyString.includes('grant_type=');
                  const hasCode = bodyString.includes('code=');
                  const hasClientId = bodyString.includes('client_id=');
                  Logger.info(`🔐 [服务器OAuth验证] grant_type: ${hasGrantType}, code: ${hasCode}, client_id: ${hasClientId}`);
                  Logger.info(`🔐 [服务器OAuth重要] 这是iOS添加服务器的关键步骤! 必须成功返回access_token和refresh_token`);
                  
                  if (!hasClientId || !hasCode) {
                    Logger.error(`🔐 [服务器OAuth错误] ❌ 缺少关键参数! client_id: ${hasClientId}, code: ${hasCode}`);
                    Logger.error(`🔐 [服务器OAuth错误] 这会导致iOS OnboardingAuthError!`);
                  }
                } else if (isTokenRevoke) {
                  Logger.info(`🔐 [服务器OAuth类型] Token撤销请求 (iOS清理旧token)`);
                  Logger.info(`🔐 [服务器OAuth说明] 这是正常行为，HA会返回空响应`);
                } else if (isTokenRefresh) {
                  Logger.info(`🔐 [服务器OAuth类型] Token刷新请求`);
                } else {
                  Logger.warn(`🔐 [服务器OAuth类型] 未知类型的OAuth请求`);
                  Logger.info(`🔐 [服务器OAuth调试] 请求体内容: ${bodyString}`);
                }
              } else {
                Logger.error(`🔐 [服务器OAuth错误] ❌ OAuth请求体为空!`);
              }
            }
            
            resolve();
          });
        });
      }
      await next();
    });

    // 主要的代理处理逻辑
    this.app.use(async (ctx, next) => {
      try {
        await this.handleProxyRequest(ctx);
      } catch (error) {
        Logger.error(`代理请求处理错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = { error: 'Internal Server Error' };
      }
    });
  }

  /**
   * 处理代理请求
   */
  async handleProxyRequest(ctx) {
    const host = ctx.headers.host;
    const path = ctx.path;
    const method = ctx.method;
    const userAgent = ctx.headers['user-agent'] || '';

    // 基本的请求日志
    Logger.info(`📥 [HTTP请求] ${method} ${path} from ${host}`);
    
    // 检测重要的请求类型
    if (userAgent.includes('Home Assistant') || userAgent.includes('HomeAssistant')) {
      Logger.info(`🍎 [iOS应用] 检测到iOS请求: ${path}`);
    }

    if (path.includes('/api/')) {
      Logger.info(`🔌 [API请求] 检测到API请求: ${path}`);
    }

    console.log("%c Line:75 🥝 host", "color:#93c0a4", host);

    // 查找对应的客户端
    const client = this.findTargetClient(host, path);
    if (!client || !client.authenticated) {
      Logger.error(`❌ [代理错误] 找不到客户端: host=${host}, path=${path}`);
      
      ctx.status = 502;
      ctx.body = {
        error: 'No available tunnel client',
        message: '没有可用的隧道客户端'
      };
      return;
    }

    Logger.info(`✅ [代理成功] 找到客户端: ${client.clientId}`);

    // 转发请求到客户端
    await this.forwardRequest(ctx, client);
  }
  /**
   * 查找目标客户端
   */
  findTargetClient(host, path) {
    let client = null;

    // 如果启用域名模式，优先使用域名路由
    if (CONFIG.DOMAIN_MODE) {
      client = this.findClientByDomain(host);
      if (client) {
        Logger.debug(`域名路由匹配: ${host} -> ${client.clientId}`);
        return client;
      }
    }

    // 🍎 [iOS修复] 处理iOS应用使用IP地址访问的情况
    // 如果host是服务器IP，尝试查找默认客户端
    const cleanHost = host.split(':')[0];
    if (cleanHost === CONFIG.SERVER_IP || cleanHost === '114.132.237.146') {
      console.log(`🍎 [iOS修复] 检测到IP访问: ${cleanHost}，查找默认客户端`);
      const authenticatedClients = this.clientManager.getAuthenticatedClients();
      if (authenticatedClients.length > 0) {
        client = authenticatedClients[0]; // 使用第一个认证的客户端
        console.log(`🍎 [iOS修复] 使用默认客户端: ${client.clientId}`);
        return client;
      }
    }

    // 备用路由：使用子域名或路径
    const subdomain = Utils.extractSubdomain(host);
    if (subdomain) {
      client = this.clientManager.getClientByRoute(subdomain);
      if (client) {
        Logger.debug(`子域名路由匹配: ${subdomain} -> ${client.clientId}`);
        return client;
      }
    }

    // 路径路由（兼容旧模式）
    const pathRoute = path.split('/')[1]; // 获取第一级路径
    if (pathRoute) {
      // 首先尝试路由映射
      client = this.clientManager.getClientByRoute(pathRoute);
      if (client) {
        Logger.debug(`路径路由匹配: ${pathRoute} -> ${client.clientId}`);
        return client;
      }

      // 如果路由映射没找到，直接尝试按客户端ID查找
      client = this.clientManager.getClient(pathRoute);
      if (client) {
        Logger.debug(`客户端ID匹配: ${pathRoute} -> ${client.clientId}`);
        return client;
      }
    }

    // 如果还没找到，使用默认的已认证客户端
    if (!client) {
      const authenticatedClients = this.clientManager.getAuthenticatedClients();
      client = authenticatedClients[0]; // 使用第一个认证的客户端
    }

    return client;
  }
  /**
   * 根据域名查找客户端
   */
  findClientByDomain(host) {
    // 移除端口号
    const cleanHost = host.split(':')[0];
    console.log(`🔍 查找域名客户端: ${cleanHost}`);

    // 特殊处理：如果host是服务器IP地址，使用默认客户端
    if (cleanHost === CONFIG.SERVER_IP || cleanHost === '114.132.237.146') {
      console.log(`🌐 检测到服务器IP访问: ${cleanHost}，使用默认客户端`);
      const authenticatedClients = this.clientManager.getAuthenticatedClients();
      if (authenticatedClients.length > 0) {
        console.log(`✅ 为IP访问分配默认客户端: ${authenticatedClients[0].clientId}`);
        return authenticatedClients[0];
      }
    }

    // 检查是否启用域名模式
    if (!CONFIG.DOMAIN_MODE) {
      console.log('⚠️ 域名模式未启用');
      return null;
    }

    // 检查基础域名配置
    const baseDomain = CONFIG.BASE_DOMAIN;
    console.log(`🌐 基础域名: ${baseDomain}`);

    // 直接查找完整域名
    let client = this.clientManager.getClientByDomain(cleanHost);
    console.log(`📍 完整域名查找结果: ${client ? client.clientId : 'null'}`);
    if (client) {
      return client;
    }

    // 如果是基础域名的子域名，提取子域名部分
    if (cleanHost.endsWith(`.${baseDomain}`)) {
      const subdomain = cleanHost.replace(`.${baseDomain}`, '');
      console.log(`🏷️ 提取的子域名: ${subdomain}`);

      client = this.clientManager.getClientByDomain(subdomain);
      console.log(`🎯 子域名查找结果: ${client ? client.clientId : 'null'}`);

      if (client) {
        return client;
      }

      // 尝试直接查找客户端ID
      client = this.clientManager.getClient(subdomain);
      console.log(`👤 客户端ID查找结果: ${client ? client.clientId : 'null'}`);

      if (client) {
        return client;
      }
    }

    // 显示当前所有已连接的客户端
    const allClients = this.clientManager.getAuthenticatedClients();
    console.log(`📋 当前已连接客户端: ${allClients.map(c => c.clientId).join(', ')}`);

    return null;
  }

  /**
   * 转发请求到客户端
   */
  async forwardRequest(ctx, client) {
    return new Promise((resolve, reject) => {
      const tunnelServer = global.tunnelServer;

      // 重写URL
      const proxiedUrl = this.rewriteUrl(ctx.url, client.clientId);

      // 准备头信息
      const headersToSend = this.prepareHeaders(ctx.headers);

      // 创建请求对象
      const req = this.createRequestObject(ctx, proxiedUrl, headersToSend);

      // 创建响应对象
      const res = this.createResponseObject(ctx, resolve);

      // 发送代理请求
      tunnelServer.sendProxyRequest(client, req, res, ctx);

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
   * 重写URL
   */
  rewriteUrl(originalUrl, clientId) {
    let proxiedUrl = originalUrl;
    const clientIdFromPath = originalUrl.split('/')[1];

    if (clientId && clientIdFromPath === clientId) {
      const pathPrefix = `/${clientId}`;
      if (originalUrl.startsWith(pathPrefix)) {
        proxiedUrl = originalUrl.substring(pathPrefix.length);
        if (!proxiedUrl.startsWith('/')) {
          proxiedUrl = '/' + proxiedUrl;
        }
      }
      if (proxiedUrl === '') {
        proxiedUrl = '/';
      }
    }

    return proxiedUrl;
  }

  /**
   * 准备请求头 - 确保完全保持原始请求头
   */
  prepareHeaders(originalHeaders) {
    const headersToSend = { ...originalHeaders };

    // 不删除任何头信息，保持100%原始性
    // 删除 host 头会导致虚拟主机路由问题
    // 删除 content-length 会导致POST请求体丢失

    return headersToSend;
  }

  /**
   * 创建请求对象
   */
  createRequestObject(ctx, proxiedUrl, headersToSend) {
    const req = {
      method: ctx.method,
      url: proxiedUrl,
      headers: headersToSend,
      _dataHandlers: [],
      _endHandlers: [],
      on: (event, callback) => {
        if (event === 'data') {
          req._dataHandlers.push(callback);
        } else if (event === 'end') {
          req._endHandlers.push(callback);
        }
      }
    };

    // 异步触发数据事件
    this.triggerRequestEvents(req, ctx);

    return req;
  }

  /**
   * 触发请求事件 - 确保原始请求体100%还原
   */
  triggerRequestEvents(req, ctx) {
    setImmediate(() => {
      // 使用原始请求体数据，不进行任何转换
      if (ctx.rawBody && ctx.rawBody.length > 0) {
        // 将原始 Buffer 转换为 base64 字符串传输
        req.body = ctx.rawBody.toString('base64');

        // 触发数据事件 - 直接传输原始数据
        req._dataHandlers.forEach(handler => handler(ctx.rawBody));
      }

      // 触发结束事件
      req._endHandlers.forEach(handler => handler());
    });
  }

  /**
   * 创建响应对象
   */
  createResponseObject(ctx, resolve) {
    return {
      statusCode: 200,
      headers: {},
      headersSent: false,
      setHeader: (key, value) => {
        ctx.set(key, value);
      },
      end: (body) => {
        ctx.status = this.statusCode || 200;
        ctx.body = body;
        this.headersSent = true;
        resolve();
      }
    };
  }

  /**
   * 启动代理服务器
   */
  start() {
    const serverOptions = {};

    // SSL配置
    if (CONFIG.SSL_ENABLED && this.loadSSLCertificates(serverOptions)) {
      this.server = https.createServer(serverOptions, this.app.callback());
      Logger.info(`HTTPS代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
    } else {
      this.server = http.createServer(this.app.callback());
      Logger.info(`HTTP代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
    }

    this.server.listen(CONFIG.PROXY_PORT, '0.0.0.0');

    this.server.on('error', (error) => {
      Logger.error('代理服务器错误:', error.message);
    });

    // WebSocket支持
    this.setupWebSocketProxy();
  }

  /**
   * 加载SSL证书
   */
  loadSSLCertificates(serverOptions) {
    try {
      if (CONFIG.SSL_KEY_PATH && CONFIG.SSL_CERT_PATH) {
        serverOptions.key = fs.readFileSync(CONFIG.SSL_KEY_PATH);
        serverOptions.cert = fs.readFileSync(CONFIG.SSL_CERT_PATH);
        return true;
      }
    } catch (error) {
      Logger.error(`SSL证书加载失败: ${error.message}`);
    }
    return false;
  }

  /**
   * 设置WebSocket代理
   */
  setupWebSocketProxy() {
    this.server.on('upgrade', (request, socket, head) => {
      try {
        this.handleWebSocketUpgrade(request, socket, head);
      } catch (error) {
        Logger.error(`WebSocket升级处理失败: ${error.message}`);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    });
  }

  /**
   * 处理WebSocket升级
   */
  handleWebSocketUpgrade(request, socket, head) {
    Logger.info(`🔄 [ProxyServer] 处理WebSocket升级请求: ${request.url}`);

    // 记录原始请求头
    Logger.info(`🔍 [ProxyServer] 原始WebSocket头信息:`);
    Object.entries(request.headers).forEach(([key, value]) => {
      Logger.info(`   ${key}: ${value}`);
    });

    // 解析URL来确定客户端
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathRoute = url.pathname.split('/')[1];

    // 查找对应的客户端
    let client = this.findClientForWebSocket(pathRoute);

    if (!client || !client.authenticated) {
      Logger.warn('❌ [ProxyServer] WebSocket升级失败：没有可用的客户端');
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      return;
    }

    Logger.info(`✅ [ProxyServer] WebSocket升级请求转发到客户端: ${client.clientId}`);

    // 发送WebSocket升级请求到客户端
    this.forwardWebSocketUpgrade(request, socket, head, client);
  }

  /**
   * 查找WebSocket对应的客户端
   */
  findClientForWebSocket(pathRoute) {
    let client = null;

    if (pathRoute) {
      client = this.clientManager.getClientByRoute(pathRoute);
      if (!client) {
        client = this.clientManager.getClient(pathRoute);
      }
    }

    // 如果没找到特定客户端，使用默认的已认证客户端
    if (!client) {
      const authenticatedClients = this.clientManager.getAuthenticatedClients();
      client = authenticatedClients[0];
    }

    return client;
  }

  /**
   * 转发WebSocket升级
   */
  forwardWebSocketUpgrade(request, socket, head, client) {
    const upgradeId = Utils.generateRequestId();

    // 存储WebSocket连接信息
    this.requestQueue.set(upgradeId, {
      socket,
      clientInfo: client,
      timestamp: Date.now(),
      type: 'websocket_upgrade',
      originalWebSocketKey: request.headers['sec-websocket-key']
    });

    // 重写URL
    const proxiedUrl = this.rewriteWebSocketUrl(request.url, client.clientId);

    // 准备头信息
    const headersToSend = this.prepareWebSocketHeaders(request.headers);

    const upgradeMessage = {
      type: 'websocket_upgrade',
      upgrade_id: upgradeId,
      method: request.method,
      url: proxiedUrl,
      headers: headersToSend,
      timestamp: Date.now()
    };

    this.sendMessage(client.socket, upgradeMessage);

    // 设置超时
    this.setWebSocketUpgradeTimeout(upgradeId, socket);
  }

  /**
   * 重写WebSocket URL
   */
  rewriteWebSocketUrl(originalUrl, clientId) {
    let proxiedUrl = originalUrl;
    const clientIdFromPath = originalUrl.split('/')[1];

    if (clientId && clientIdFromPath === clientId) {
      const pathPrefix = `/${clientId}`;
      if (originalUrl.startsWith(pathPrefix)) {
        proxiedUrl = originalUrl.substring(pathPrefix.length);
        if (!proxiedUrl.startsWith('/')) {
          proxiedUrl = '/' + proxiedUrl;
        }
      }
    }

    return proxiedUrl;
  }

  /**
   * 准备WebSocket头信息
   */
  prepareWebSocketHeaders(originalHeaders) {
    const headersToSend = { ...originalHeaders };

    // 保留关键的WebSocket头信息，只删除host（因为会被重写）
    delete headersToSend.host;

    // 确保必要的WebSocket头信息存在
    if (!headersToSend['connection']) {
      headersToSend['connection'] = 'Upgrade';
    }

    if (!headersToSend['upgrade']) {
      headersToSend['upgrade'] = 'websocket';
    }

    if (!headersToSend['sec-websocket-version']) {
      headersToSend['sec-websocket-version'] = '13';
    }

    // 处理WebSocket扩展问题 - 移除可能导致协商问题的扩展头
    if (headersToSend['sec-websocket-extensions']) {
      Logger.info(`🔧 [ProxyServer] 检测到WebSocket扩展头: ${headersToSend['sec-websocket-extensions']}`);
      Logger.info(`🔧 [ProxyServer] 移除扩展头以避免iOS兼容性问题`);
      delete headersToSend['sec-websocket-extensions'];
    }

    Logger.info(`🔧 [WebSocket] 准备的头信息:`);
    Object.entries(headersToSend).forEach(([key, value]) => {
      Logger.info(`   ${key}: ${value}`);
    });

    return headersToSend;
  }

  /**
   * 设置WebSocket升级超时
   */
  setWebSocketUpgradeTimeout(upgradeId, socket) {
    const upgradeTimeoutId = setTimeout(() => {
      if (this.requestQueue.has(upgradeId)) {
        this.requestQueue.delete(upgradeId);
        Logger.warn(`WebSocket升级超时: ${upgradeId}`);
        socket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
        socket.destroy();
      }
    }, 10000); // 10秒超时

    // 将超时ID存储到请求信息中
    const upgradeInfo = this.requestQueue.get(upgradeId);
    if (upgradeInfo) {
      upgradeInfo.upgradeTimeoutId = upgradeTimeoutId;
    }
  }

  /**
   * 发送消息给客户端
   */
  sendMessage(socket, message) {
    try {
      const data = Utils.safeJsonStringify(message) + '\n';
      socket.write(data);
      return true;
    } catch (error) {
      Logger.error(`发送消息失败: ${error.message}`);
      return false;
    }
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

module.exports = ProxyServer;
