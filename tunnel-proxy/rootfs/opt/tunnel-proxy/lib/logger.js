/**
 * 日志工具类
 */
class Logger {
  static info(message) {
    console.log(`[INFO] ${this.getNowTime()} - ${message}`)
  }

  static error(message) {
    console.error(`[ERROR] ${this.getNowTime()} - ${message}`)
  }

  static warn(message) {
    console.warn(`[WARN] ${this.getNowTime()} - ${message}`)
  }

  static debug(message) {
    const config = require('./config').getConfig()
    if (config.log_level === 'debug') {
      console.log(`[DEBUG] ${this.getNowTime()} - ${message}`)
    }
  }
  static getNowTime() {
    var date = new Date();
    let year = date.getFullYear();
    let month = this.padZero(date.getMonth() + 1);
    let day = this.padZero(date.getDate());
    let hours = this.padZero(date.getHours());
    let minutes = this.padZero(date.getMinutes());
    let seconds = this.padZero(date.getSeconds());
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds
  };
  // 补0
  static padZero(num) {
    return num < 10 ? '0' + num : num;
  }
}

module.exports = Logger



