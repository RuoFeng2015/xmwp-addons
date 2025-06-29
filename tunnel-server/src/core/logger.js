/**
 * 日志记录器模块
 * 提供统一的日志记录功能
 */

const { CONFIG } = require('./config');

/**
 * 日志记录器
 */
class Logger {
  static levels = { error: 0, warn: 1, info: 2, debug: 3 };
  static currentLevel = this.levels[CONFIG.LOG_LEVEL] || 2;

  /**
   * 记录日志
   */
  static log(level, message, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
    }
  }

  /**
   * 错误日志
   */
  static error(message, ...args) {
    this.log('error', message, ...args);
  }

  /**
   * 警告日志
   */
  static warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  /**
   * 信息日志
   */
  static info(message, ...args) {
    this.log('info', message, ...args);
  }

  /**
   * 调试日志
   */
  static debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  /**
   * 设置日志级别
   */
  static setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.currentLevel = this.levels[level];
      this.info(`日志级别设置为: ${level}`);
    } else {
      this.warn(`无效的日志级别: ${level}`);
    }
  }

  /**
   * 获取当前日志级别
   */
  static getLevel() {
    for (const [level, value] of Object.entries(this.levels)) {
      if (value === this.currentLevel) {
        return level;
      }
    }
    return 'unknown';
  }
}

module.exports = Logger;
