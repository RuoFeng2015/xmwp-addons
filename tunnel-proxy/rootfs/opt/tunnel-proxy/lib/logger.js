/**
 * 日志工具类
 */
class Logger {
  static info(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`)
  }

  static error(message) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`)
  }

  static warn(message) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
  }

  static debug(message) {
    const config = require('./config').getConfig()
    if (config.log_level === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`)
    }
  }
}

module.exports = Logger
