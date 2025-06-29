/**
 * 管理后台服务器模块
 * 提供REST API用于服务器管理和监控
 */

const http = require('http');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const jwt = require('jsonwebtoken');
const { CONFIG } = require('../core/config');
const Logger = require('../core/logger');
const Utils = require('../utils/utils');

/**
 * 管理后台服务器类
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

    // 基础中间件
    this.setupMiddleware();

    // 认证相关路由
    this.setupAuthRoutes(router);

    // 状态监控路由
    this.setupStatusRoutes(router);

    // 客户端管理路由
    this.setupClientRoutes(router);

    // 系统管理路由
    this.setupSystemRoutes(router);

    // 域名管理路由
    this.setupDomainRoutes(router);

    this.app.use(router.routes());
    this.app.use(router.allowedMethods());
  }

  /**
   * 设置基础中间件
   */
  setupMiddleware() {
    // CORS配置
    this.app.use(cors());

    // Body parser配置
    this.app.use(bodyParser({
      jsonLimit: '1mb',
      formLimit: '1mb',
      textLimit: '1mb',
      enableTypes: ['json', 'form', 'text'],
      onerror: (err, ctx) => {
        Logger.error(`管理接口Body parser错误: ${err.message}, URL: ${ctx.url}`);
        ctx.status = 400;
        ctx.body = { error: 'Invalid request body', message: err.message };
      }
    }));

    // 全局错误处理
    this.app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        Logger.error(`管理接口错误: ${err.message}`);
        ctx.status = err.status || 500;
        ctx.body = {
          error: err.message,
          timestamp: Date.now()
        };
      }
    });
  }

  /**
   * 设置认证相关路由
   */
  setupAuthRoutes(router) {
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
          expires_in: 86400,
          timestamp: Date.now()
        };

        Logger.info(`管理员登录成功: ${username} from ${Utils.getClientIP(ctx)}`);
      } else {
        ctx.status = 401;
        ctx.body = {
          error: '用户名或密码错误',
          timestamp: Date.now()
        };
        Logger.warn(`管理员登录失败: ${username} from ${Utils.getClientIP(ctx)}`);
      }
    });

    // 刷新令牌
    router.post('/api/auth/refresh', this.authMiddleware, async (ctx) => {
      const token = jwt.sign(
        { username: ctx.user.username, role: ctx.user.role },
        CONFIG.JWT_SECRET,
        { expiresIn: '24h' }
      );

      ctx.body = {
        token,
        expires_in: 86400,
        timestamp: Date.now()
      };
    });

    // 登出接口
    router.post('/api/auth/logout', this.authMiddleware, async (ctx) => {
      // 在实际应用中，这里可以将token加入黑名单
      ctx.body = {
        message: '登出成功',
        timestamp: Date.now()
      };
      Logger.info(`管理员登出: ${ctx.user.username}`);
    });
  }

  /**
   * 设置状态监控路由
   */
  setupStatusRoutes(router) {
    // 获取服务器状态
    router.get('/api/status', this.authMiddleware, async (ctx) => {
      const clients = this.clientManager.getAllClients();
      const connectionStats = this.clientManager.getConnectionStats();

      ctx.body = {
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: '2.0.0',
          timestamp: Date.now()
        },
        config: {
          max_clients: CONFIG.MAX_CLIENTS,
          tunnel_port: CONFIG.TUNNEL_PORT,
          proxy_port: CONFIG.PROXY_PORT,
          admin_port: CONFIG.ADMIN_PORT,
          ssl_enabled: CONFIG.SSL_ENABLED,
          heartbeat_interval: CONFIG.HEARTBEAT_INTERVAL,
          client_timeout: CONFIG.CLIENT_TIMEOUT
        },
        clients: {
          total: connectionStats.total,
          authenticated: connectionStats.authenticated,
          utilization_rate: connectionStats.utilizationRate,
          list: clients.map(c => this.sanitizeClientInfo(c))
        },
        routes: this.clientManager.getAllRoutes()
      };
    });

    // 获取服务器统计信息
    router.get('/api/stats', this.authMiddleware, async (ctx) => {
      const clients = this.clientManager.getAllClients();
      const now = Date.now();

      const stats = {
        connections: {
          total: clients.length,
          authenticated: clients.filter(c => c.authenticated).length,
          active_last_minute: clients.filter(c => now - c.lastHeartbeat < 60000).length
        },
        traffic: {
          total_bytes_sent: clients.reduce((sum, c) => sum + c.bytesSent, 0),
          total_bytes_received: clients.reduce((sum, c) => sum + c.bytesReceived, 0),
          total_requests: clients.reduce((sum, c) => sum + c.requestCount, 0)
        },
        performance: {
          memory_usage: process.memoryUsage(),
          uptime: process.uptime(),
          load_average: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
        },
        timestamp: now
      };

      ctx.body = stats;
    });

    // 健康检查
    router.get('/api/health', async (ctx) => {
      const connectionStats = this.clientManager.getConnectionStats();
      const isHealthy = connectionStats.utilizationRate < 95; // 利用率低于95%认为健康

      ctx.status = isHealthy ? 200 : 503;
      ctx.body = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        checks: {
          connection_utilization: {
            status: connectionStats.utilizationRate < 95 ? 'pass' : 'fail',
            utilization_rate: connectionStats.utilizationRate,
            max_clients: CONFIG.MAX_CLIENTS
          },
          memory_usage: {
            status: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'pass' : 'warn', // 500MB警告
            heap_used: process.memoryUsage().heapUsed
          }
        },
        timestamp: Date.now(),
        uptime: process.uptime()
      };
    });
  }

  /**
   * 设置客户端管理路由
   */
  setupClientRoutes(router) {
    // 获取所有客户端
    router.get('/api/clients', this.authMiddleware, async (ctx) => {
      const clients = this.clientManager.getAllClients();
      ctx.body = {
        clients: clients.map(c => this.sanitizeClientInfo(c)),
        total: clients.length,
        timestamp: Date.now()
      };
    });

    // 获取客户端详情
    router.get('/api/clients/:clientId', this.authMiddleware, async (ctx) => {
      const client = this.clientManager.getClient(ctx.params.clientId);

      if (!client) {
        ctx.status = 404;
        ctx.body = {
          error: '客户端不存在',
          client_id: ctx.params.clientId,
          timestamp: Date.now()
        };
        return;
      }

      ctx.body = {
        client: this.sanitizeClientInfo(client, true), // 详细信息
        timestamp: Date.now()
      };
    });

    // 断开客户端连接
    router.delete('/api/clients/:clientId', this.authMiddleware, async (ctx) => {
      const client = this.clientManager.getClient(ctx.params.clientId);

      if (!client) {
        ctx.status = 404;
        ctx.body = {
          error: '客户端不存在',
          client_id: ctx.params.clientId,
          timestamp: Date.now()
        };
        return;
      }

      // 断开连接
      if (client.socket && !client.socket.destroyed) {
        client.socket.destroy();
      }

      ctx.body = {
        message: '客户端连接已断开',
        client_id: ctx.params.clientId,
        timestamp: Date.now()
      };

      Logger.info(`管理员断开客户端连接: ${ctx.params.clientId} by ${ctx.user.username}`);
    });

    // 向客户端发送消息
    router.post('/api/clients/:clientId/message', this.authMiddleware, async (ctx) => {
      const client = this.clientManager.getClient(ctx.params.clientId);
      const { type, data } = ctx.request.body;

      if (!client) {
        ctx.status = 404;
        ctx.body = { error: '客户端不存在' };
        return;
      }

      if (!client.authenticated || !client.socket || client.socket.destroyed) {
        ctx.status = 400;
        ctx.body = { error: '客户端未连接或未认证' };
        return;
      }

      try {
        const message = {
          type: type || 'admin_message',
          data: data,
          timestamp: Date.now(),
          from: 'admin'
        };

        const success = global.tunnelServer.sendMessage(client.socket, message);

        ctx.body = {
          success,
          message: success ? '消息发送成功' : '消息发送失败',
          timestamp: Date.now()
        };
      } catch (error) {
        ctx.status = 500;
        ctx.body = { error: '发送消息失败: ' + error.message };
      }
    });
  }

  /**
   * 设置系统管理路由
   */
  setupSystemRoutes(router) {
    // 获取系统配置
    router.get('/api/system/config', this.authMiddleware, async (ctx) => {
      ctx.body = {
        config: Utils.sanitizeObject({
          TUNNEL_PORT: CONFIG.TUNNEL_PORT,
          PROXY_PORT: CONFIG.PROXY_PORT,
          ADMIN_PORT: CONFIG.ADMIN_PORT,
          MAX_CLIENTS: CONFIG.MAX_CLIENTS,
          HEARTBEAT_INTERVAL: CONFIG.HEARTBEAT_INTERVAL,
          CLIENT_TIMEOUT: CONFIG.CLIENT_TIMEOUT,
          SSL_ENABLED: CONFIG.SSL_ENABLED,
          LOG_LEVEL: CONFIG.LOG_LEVEL
        }),
        timestamp: Date.now()
      };
    });

    // 更新日志级别
    router.put('/api/system/log-level', this.authMiddleware, async (ctx) => {
      const { level } = ctx.request.body;

      if (!['error', 'warn', 'info', 'debug'].includes(level)) {
        ctx.status = 400;
        ctx.body = { error: '无效的日志级别' };
        return;
      }

      Logger.setLevel(level);

      ctx.body = {
        message: '日志级别已更新',
        level: level,
        timestamp: Date.now()
      };

      Logger.info(`管理员更新日志级别: ${level} by ${ctx.user.username}`);
    });

    // 清理超时连接
    router.post('/api/system/cleanup', this.authMiddleware, async (ctx) => {
      const cleanedCount = this.clientManager.cleanupTimeoutClients();

      ctx.body = {
        message: '清理完成',
        cleaned_count: cleanedCount,
        timestamp: Date.now()
      };

      Logger.info(`管理员执行连接清理: 清理了 ${cleanedCount} 个超时连接`);
    });

    // 获取路由信息
    router.get('/api/system/routes', this.authMiddleware, async (ctx) => {
      ctx.body = {
        routes: this.clientManager.getAllRoutes(),
        timestamp: Date.now()
      };
    });
  }

  /**
   * 设置域名管理路由
   */
  setupDomainRoutes(router) {
    // 获取所有域名映射
    router.get('/api/domains', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = {
          error: '域名模式未启用',
          timestamp: Date.now()
        };
        return;
      }

      const domains = this.clientManager.getAllDomains();
      const stats = this.clientManager.domainManager.getStats();

      ctx.body = {
        domains: domains,
        stats: stats,
        base_domain: CONFIG.BASE_DOMAIN,
        server_ip: CONFIG.SERVER_IP,
        total: domains.length,
        timestamp: Date.now()
      };
    });

    // 获取指定客户端的域名信息
    router.get('/api/domains/client/:clientId', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = { error: '域名模式未启用' };
        return;
      }

      const clientId = ctx.params.clientId;
      const domainInfo = this.clientManager.getClientDomain(clientId);

      if (!domainInfo) {
        ctx.status = 404;
        ctx.body = {
          error: '客户端没有分配的域名',
          client_id: clientId,
          timestamp: Date.now()
        };
        return;
      }

      ctx.body = {
        domain_info: domainInfo,
        timestamp: Date.now()
      };
    });

    // 手动为客户端分配域名
    router.post('/api/domains/allocate', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = { error: '域名模式未启用' };
        return;
      }

      const { client_id } = ctx.request.body;

      if (!client_id) {
        ctx.status = 400;
        ctx.body = { error: '缺少客户端ID' };
        return;
      }

      const client = this.clientManager.getClient(client_id);
      if (!client) {
        ctx.status = 404;
        ctx.body = { error: '客户端不存在' };
        return;
      }

      try {
        const result = await this.clientManager.allocateDomainForClient(client);

        if (result && result.success) {
          ctx.body = {
            message: '域名分配成功',
            domain_info: result,
            timestamp: Date.now()
          };
          Logger.info(`管理员为客户端 ${client_id} 分配域名: ${result.fullDomain} by ${ctx.user.username}`);
        } else {
          ctx.status = 500;
          ctx.body = {
            error: '域名分配失败',
            details: result ? result.error : '未知错误'
          };
        }
      } catch (error) {
        ctx.status = 500;
        ctx.body = {
          error: '域名分配异常',
          details: error.message
        };
        Logger.error(`域名分配异常: ${error.message}`);
      }
    });

    // 释放客户端域名
    router.delete('/api/domains/client/:clientId', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = { error: '域名模式未启用' };
        return;
      }

      const clientId = ctx.params.clientId;

      try {
        const result = await this.clientManager.releaseDomainForClient(clientId);

        if (result.success) {
          ctx.body = {
            message: '域名释放成功',
            released_domain: result.releasedDomain,
            timestamp: Date.now()
          };
          Logger.info(`管理员释放客户端 ${clientId} 域名 by ${ctx.user.username}`);
        } else {
          ctx.status = 500;
          ctx.body = {
            error: '域名释放失败',
            details: result.error
          };
        }
      } catch (error) {
        ctx.status = 500;
        ctx.body = {
          error: '域名释放异常',
          details: error.message
        };
        Logger.error(`域名释放异常: ${error.message}`);
      }
    });

    // 清理过期域名
    router.post('/api/domains/cleanup', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = { error: '域名模式未启用' };
        return;
      }

      try {
        await this.clientManager.cleanupExpiredDomains();

        ctx.body = {
          message: '过期域名清理完成',
          timestamp: Date.now()
        };
        Logger.info(`管理员执行过期域名清理 by ${ctx.user.username}`);
      } catch (error) {
        ctx.status = 500;
        ctx.body = {
          error: '域名清理异常',
          details: error.message
        };
        Logger.error(`域名清理异常: ${error.message}`);
      }
    });

    // 更新域名IP地址
    router.put('/api/domains/client/:clientId/ip', this.authMiddleware, async (ctx) => {
      if (!CONFIG.DOMAIN_MODE) {
        ctx.status = 400;
        ctx.body = { error: '域名模式未启用' };
        return;
      }

      const clientId = ctx.params.clientId;
      const { server_ip } = ctx.request.body;

      if (!server_ip) {
        ctx.status = 400;
        ctx.body = { error: '缺少服务器IP地址' };
        return;
      }

      try {
        const result = await this.clientManager.domainManager.updateDomainIP(clientId, server_ip);

        if (result.success) {
          ctx.body = {
            message: '域名IP更新成功',
            client_id: clientId,
            new_ip: server_ip,
            timestamp: Date.now()
          };
          Logger.info(`管理员更新客户端 ${clientId} 域名IP: ${server_ip} by ${ctx.user.username}`);
        } else {
          ctx.status = 500;
          ctx.body = {
            error: '域名IP更新失败',
            details: result.error
          };
        }
      } catch (error) {
        ctx.status = 500;
        ctx.body = {
          error: '域名IP更新异常',
          details: error.message
        };
        Logger.error(`域名IP更新异常: ${error.message}`);
      }
    });
  }

  /**
   * 认证中间件
   */
  authMiddleware = async (ctx, next) => {
    const token = ctx.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ctx.status = 401;
      ctx.body = {
        error: '缺少认证令牌',
        timestamp: Date.now()
      };
      return;
    }

    try {
      const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
      ctx.user = decoded;
      await next();
    } catch (error) {
      ctx.status = 401;
      ctx.body = {
        error: '无效的认证令牌',
        timestamp: Date.now()
      };
    }
  };

  /**
   * 清理客户端信息（移除敏感数据）
   */
  sanitizeClientInfo(client, detailed = false) {
    const basic = {
      client_id: client.clientId,
      username: client.username,
      remote_address: client.remoteAddress,
      authenticated: client.authenticated,
      connect_time: client.connectTime,
      last_heartbeat: client.lastHeartbeat,
      connection_duration: Date.now() - client.connectTime
    };

    if (detailed) {
      return {
        ...basic,
        remote_port: client.remotePort,
        request_count: client.requestCount,
        bytes_sent: client.bytesSent,
        bytes_received: client.bytesReceived,
        formatted_bytes_sent: Utils.formatBytes(client.bytesSent),
        formatted_bytes_received: Utils.formatBytes(client.bytesReceived),
        formatted_duration: Utils.formatDuration(basic.connection_duration)
      };
    }

    return basic;
  }

  /**
   * 启动管理服务器
   */
  start() {
    this.server = http.createServer(this.app.callback());

    this.server.listen(CONFIG.ADMIN_PORT, '0.0.0.0', () => {
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

module.exports = AdminServer;
