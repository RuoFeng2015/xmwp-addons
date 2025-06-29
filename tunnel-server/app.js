/**
 * 内网穿透服务器主入口
 * 使用模块化结构启动所有服务
 */

require('dotenv').config();

const { TunnelServerApp } = require('./src/app');
const Logger = require('./src/core/logger');

/**
 * 应用启动器
 */
class AppLauncher {
  constructor() {
    this.app = new TunnelServerApp();
  }

  /**
   * 启动应用
   */
  async start() {
    try {
      Logger.info('🚀 启动内网穿透服务器...');

      // 初始化应用
      await this.app.initialize();

      // 启动所有服务
      await this.app.start();

      Logger.info('🎉 服务器启动完成!');

    } catch (error) {
      Logger.error(`启动失败: ${error.message}`);
      Logger.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * 停止应用
   */
  async stop() {
    try {
      Logger.info('🔄 正在关闭服务器...');
      await this.app.stop();
      Logger.info('✅ 服务器已关闭');
    } catch (error) {
      Logger.error(`关闭失败: ${error.message}`);
    }
    process.exit(0);
  }
}

// 创建启动器实例
const launcher = new AppLauncher();

// 处理进程信号
process.on('SIGINT', () => {
  Logger.info('收到 SIGINT 信号，准备关闭...');
  launcher.stop();
});

process.on('SIGTERM', () => {
  Logger.info('收到 SIGTERM 信号，准备关闭...');
  launcher.stop();
});

process.on('uncaughtException', (error) => {
  Logger.error('未捕获的异常:', error);
  launcher.stop();
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('未处理的 Promise 拒绝:', reason);
  launcher.stop();
});

// 启动应用
if (require.main === module) {
  launcher.start();
}

module.exports = launcher;
