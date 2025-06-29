/**
 * 主应用入口文件
 * 协调各个服务模块的启动和停止
 */

const { CONFIG, validateConfig, getConfigInfo } = require('./core/config');
const Logger = require('./core/logger');
const ClientManager = require('./core/client-manager');
const TunnelServer = require('./servers/tunnel-server');
const ProxyServer = require('./servers/proxy-server');
const AdminServer = require('./servers/admin-server');

/**
 * 主服务器应用类
 */
class TunnelServerApp {
  constructor() {
    this.clientManager = null;
    this.tunnelServer = null;
    this.proxyServer = null;
    this.adminServer = null;
    this.isRunning = false;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      Logger.info('正在初始化内网穿透中转服务器...');

      // 验证配置
      await this.validateConfiguration();

      // 创建组件实例
      this.createComponents();

      // 设置全局引用
      this.setupGlobalReferences();

      Logger.info('应用初始化完成');
    } catch (error) {
      Logger.error(`应用初始化失败: ${error.message}`);
      throw error;
    }
  }
  /**
   * 验证配置
   */
  async validateConfiguration() {
    Logger.info('验证配置参数...');

    const configErrors = validateConfig();
    if (configErrors.length > 0) {
      const errorMessage = `配置验证失败:\n${configErrors.join('\n')}`;
      throw new Error(errorMessage);
    }

    // 域名模式特殊验证
    if (CONFIG.DOMAIN_MODE) {
      Logger.info('域名模式已启用');
      Logger.info(`基础域名: ${CONFIG.BASE_DOMAIN}`);
      Logger.info(`服务器IP: ${CONFIG.SERVER_IP}`);

      if (!CONFIG.TENCENT_SECRET_ID || !CONFIG.TENCENT_SECRET_KEY) {
        throw new Error('域名模式需要配置腾讯云API密钥');
      }

      Logger.info('腾讯云DNS配置已设置');
    } else {
      Logger.info('使用传统IP+路径模式');
    }

    // 输出配置信息
    const configInfo = getConfigInfo();
    Logger.info('配置验证通过:');
    Object.entries(configInfo).forEach(([key, value]) => {
      Logger.info(`  ${key}: ${value}`);
    });
  }

  /**
   * 创建组件实例
   */
  createComponents() {
    Logger.info('创建服务组件...');

    // 创建客户端管理器
    this.clientManager = new ClientManager();

    // 创建各个服务器
    this.tunnelServer = new TunnelServer(this.clientManager);
    this.proxyServer = new ProxyServer(this.clientManager);
    this.adminServer = new AdminServer(this.clientManager);

    Logger.info('服务组件创建完成');
  }

  /**
   * 设置全局引用
   */
  setupGlobalReferences() {
    // 设置全局引用，供各模块间通信使用
    global.tunnelServer = this.tunnelServer;
    global.proxyServer = this.proxyServer;
    global.clientManager = this.clientManager;
  }

  /**
   * 启动所有服务
   */
  async start() {
    if (this.isRunning) {
      Logger.warn('服务器已在运行中');
      return;
    }

    try {
      Logger.info('启动内网穿透中转服务器...');

      // 确保已初始化
      if (!this.clientManager) {
        await this.initialize();
      }

      // 启动各个服务器
      await this.startServers();

      this.isRunning = true;
      Logger.info('所有服务启动成功！');
      this.printServerInfo();

    } catch (error) {
      Logger.error(`服务启动失败: ${error.message}`);
      await this.stop(); // 清理已启动的服务
      throw error;
    }
  }

  /**
   * 启动各个服务器
   */
  async startServers() {
    const startPromises = [];

    // 隧道服务器
    startPromises.push(new Promise((resolve, reject) => {
      try {
        this.tunnelServer.start();
        resolve('tunnel');
      } catch (error) {
        reject(new Error(`隧道服务器启动失败: ${error.message}`));
      }
    }));

    // 代理服务器
    startPromises.push(new Promise((resolve, reject) => {
      try {
        this.proxyServer.start();
        resolve('proxy');
      } catch (error) {
        reject(new Error(`代理服务器启动失败: ${error.message}`));
      }
    }));

    // 管理后台服务器
    startPromises.push(new Promise((resolve, reject) => {
      try {
        this.adminServer.start();
        resolve('admin');
      } catch (error) {
        reject(new Error(`管理服务器启动失败: ${error.message}`));
      }
    }));

    // 等待所有服务启动
    try {
      await Promise.all(startPromises);

      // 启动定期任务
      this.startPeriodicTasks();
    } catch (error) {
      throw new Error(`服务启动失败: ${error.message}`);
    }
  }

  /**
   * 启动定期任务
   */
  startPeriodicTasks() {
    // 每24小时清理一次过期域名
    if (CONFIG.DOMAIN_MODE) {
      setInterval(async () => {
        try {
          Logger.info('执行定期域名清理...');
          await this.clientManager.cleanupExpiredDomains();
        } catch (error) {
          Logger.error(`定期域名清理失败: ${error.message}`);
        }
      }, 24 * 60 * 60 * 1000); // 24小时

      Logger.info('定期域名清理任务已启动（每24小时执行一次）');
    }
  }

  /**
   * 停止所有服务
   */
  async stop() {
    if (!this.isRunning) {
      Logger.info('服务器未在运行');
      return;
    }

    Logger.info('正在停止服务器...');

    try {
      // 停止各个服务器
      if (this.tunnelServer) {
        this.tunnelServer.stop();
      }
      if (this.proxyServer) {
        this.proxyServer.stop();
      }
      if (this.adminServer) {
        this.adminServer.stop();
      }

      this.isRunning = false;
      Logger.info('服务器已停止');
    } catch (error) {
      Logger.error(`停止服务器时发生错误: ${error.message}`);
    }
  }

  /**
   * 重启服务器
   */
  async restart() {
    Logger.info('重启服务器...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    await this.start();
  }

  /**
   * 获取服务器状态
   */
  getStatus() {
    return {
      running: this.isRunning,
      uptime: this.isRunning ? process.uptime() : 0,
      components: {
        client_manager: !!this.clientManager,
        tunnel_server: !!this.tunnelServer,
        proxy_server: !!this.proxyServer,
        admin_server: !!this.adminServer
      },
      connections: this.clientManager ? this.clientManager.getConnectionStats() : null,
      memory: process.memoryUsage(),
      timestamp: Date.now()
    };
  }

  /**
   * 打印服务器信息
   */
  printServerInfo() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 内网穿透中转服务器 - 运行信息');
    console.log('='.repeat(60));
    console.log(`🔗 隧道连接端口: ${CONFIG.TUNNEL_PORT}`);
    console.log(`🌐 HTTP代理端口: ${CONFIG.PROXY_PORT} ${CONFIG.SSL_ENABLED ? '(HTTPS)' : '(HTTP)'}`);
    console.log(`⚙️  管理后台端口: ${CONFIG.ADMIN_PORT}`);
    console.log(`👥 最大客户端数: ${CONFIG.MAX_CLIENTS}`);
    console.log(`❤️  心跳间隔: ${CONFIG.HEARTBEAT_INTERVAL}ms`);
    console.log(`⏱️  客户端超时: ${CONFIG.CLIENT_TIMEOUT}ms`);
    console.log(`🔐 管理员账号: ${CONFIG.ADMIN_USERNAME}`);
    console.log(`📊 日志级别: ${CONFIG.LOG_LEVEL}`);

    if (this.clientManager) {
      const stats = this.clientManager.getConnectionStats();
      console.log(`📱 当前连接: ${stats.total}/${stats.maxAllowed} (${stats.utilizationRate}%)`);
    }

    console.log('\n🔗 访问地址:');
    console.log(`   管理后台: http://localhost:${CONFIG.ADMIN_PORT}`);
    console.log(`   健康检查: http://localhost:${CONFIG.ADMIN_PORT}/api/health`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * 设置优雅关闭处理
   */
  setupGracefulShutdown() {
    // SIGTERM信号处理
    process.on('SIGTERM', async () => {
      Logger.info('收到SIGTERM信号，正在优雅关闭服务器...');
      await this.stop();
      process.exit(0);
    });

    // SIGINT信号处理 (Ctrl+C)
    process.on('SIGINT', async () => {
      Logger.info('收到SIGINT信号，正在优雅关闭服务器...');
      await this.stop();
      process.exit(0);
    });

    // 未捕获异常处理
    process.on('uncaughtException', async (error) => {
      Logger.error(`未捕获的异常: ${error.message}`);
      Logger.error(error.stack);
      await this.stop();
      process.exit(1);
    });

    // 未处理的Promise拒绝
    process.on('unhandledRejection', async (reason, promise) => {
      Logger.error(`未处理的Promise拒绝: ${reason}`);
      await this.stop();
      process.exit(1);
    });
  }
}

// 创建应用实例
const app = new TunnelServerApp();

// 如果直接运行此文件
if (require.main === module) {
  async function main() {
    try {
      // 设置优雅关闭
      app.setupGracefulShutdown();

      // 初始化并启动应用
      await app.initialize();
      await app.start();
    } catch (error) {
      Logger.error(`应用启动失败: ${error.message}`);
      process.exit(1);
    }
  }

  main();
}

// 导出应用实例和相关类
module.exports = {
  TunnelServerApp,
  app,
  CONFIG,
  Logger
};
