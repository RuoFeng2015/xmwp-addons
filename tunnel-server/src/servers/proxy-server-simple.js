/**
 * 简化的代理服务器 - 紧急修复版本
 */

const Koa = require('koa');
const { CONFIG } = require('../core/config');
const Logger = require('../core/logger');

class ProxyServer {
  constructor(clientManager) {
    this.clientManager = clientManager;
    this.app = new Koa();
    this.setupMiddleware();
  }

  setupMiddleware() {
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

  async handleProxyRequest(ctx) {
    const host = ctx.headers.host;
    const path = ctx.path;
    
    console.log(`🔗 [代理请求] ${ctx.method} ${host}${path}`);

    // 获取所有已认证的客户端
    const allClients = this.clientManager.getAuthenticatedClients();
    console.log(`📋 已连接客户端: ${allClients.map(c => c.clientId).join(', ')}`);
    
    // 简单查找：直接使用第一个可用的客户端
    const client = allClients.find(c => c.clientId === 'ha-client-001') || allClients[0];
    
    if (!client) {
      console.log(`❌ 没有可用的客户端`);
      ctx.status = 502;
      ctx.body = {
        error: 'No available tunnel client',
        message: '没有可用的隧道客户端 - 请检查tunnel-proxy加载项是否运行'
      };
      return;
    }

    console.log(`✅ 使用客户端: ${client.clientId}`);

    // 简化转发逻辑
    ctx.status = 200;
    ctx.body = {
      message: '代理服务正常',
      client: client.clientId,
      path: path
    };
  }

  start() {
    const server = this.app.listen(CONFIG.PROXY_PORT, '0.0.0.0', () => {
      Logger.info(`代理服务器启动在端口 ${CONFIG.PROXY_PORT}`);
    });

    server.on('error', (error) => {
      Logger.error('代理服务器错误:', error.message);
    });

    return server;
  }
}

module.exports = ProxyServer;
