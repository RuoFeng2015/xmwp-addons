/**
 * 通用工具模块
 * 提供各种通用的工具函数
 */

const crypto = require('crypto');
const { isBinaryFile } = require('isbinaryfile');

/**
 * 工具函数集合
 */
class Utils {
  /**
   * 生成唯一的请求ID
   * @returns {string} 十六进制请求ID
   */
  static generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 生成唯一的客户端ID
   * @param {string} prefix 前缀
   * @returns {string} 客户端ID
   */
  static generateClientId(prefix = 'client') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * 验证用户凭据
   * @param {string} username 用户名
   * @param {string} password 密码
   * @returns {boolean} 是否有效
   */
  static validateCredentials(username, password) {
    // 简单验证 - 生产环境应使用更安全的方式
    const validUsers = {
      'admin': 'password',
      'user1': 'pass123',
      'demo': 'demo123'
    };

    return validUsers[username] === password;
  }

  /**
   * 提取subdomain
   * @param {string} host 主机名
   * @returns {string|null} subdomain
   */
  static extractSubdomain(host) {
    if (!host) return null;

    // 移除端口号
    const cleanHost = host.split(':')[0];
    const parts = cleanHost.split('.');

    if (parts.length > 2) {
      return parts[0]; // 返回第一级subdomain
    }
    return null;
  }

  /**
   * 验证域名格式
   * @param {string} domain 域名
   * @returns {boolean} 是否有效
   */
  static isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * 检查是否为基础域名的子域名
   * @param {string} host 主机名
   * @param {string} baseDomain 基础域名
   * @returns {boolean} 是否为子域名
   */
  static isSubdomainOf(host, baseDomain) {
    if (!host || !baseDomain) return false;

    const cleanHost = host.split(':')[0].toLowerCase();
    const cleanBase = baseDomain.toLowerCase();

    return cleanHost.endsWith(`.${cleanBase}`) || cleanHost === cleanBase;
  }

  /**
   * 从完整域名中提取子域名部分
   * @param {string} fullDomain 完整域名
   * @param {string} baseDomain 基础域名
   * @returns {string|null} 子域名
   */
  static extractSubdomainFromFull(fullDomain, baseDomain) {
    if (!this.isSubdomainOf(fullDomain, baseDomain)) {
      return null;
    }

    const cleanHost = fullDomain.split(':')[0].toLowerCase();
    const cleanBase = baseDomain.toLowerCase();

    if (cleanHost === cleanBase) {
      return null; // 是基础域名本身
    }

    return cleanHost.replace(`.${cleanBase}`, '');
  }
  /**
   * 智能处理响应体数据
   * @param {string|Buffer} body 响应体
   * @returns {Buffer} 处理后的Buffer
   */
  static processResponseBody(body) {
    if (!body) {
      return Buffer.alloc(0);
    }

    // 如果已经是Buffer，直接返回
    if (Buffer.isBuffer(body)) {
      return body;
    }

    let responseBody;

    try {
      // 检查是否为有效的base64字符串
      if (typeof body === 'string' && body.length > 0) {
        // 更严格的base64验证
        if (this.isValidBase64(body.trim())) {
          responseBody = Buffer.from(body.trim(), 'base64');
        } else {
          // 不是有效的base64，当作普通字符串处理
          responseBody = Buffer.from(body, 'utf8');
        }
      } else {
        // 其他类型转换为字符串再转Buffer
        responseBody = Buffer.from(String(body), 'utf8');
      }
    } catch (error) {
      // 如果UTF-8编码失败，使用binary编码作为fallback
      responseBody = Buffer.from(String(body), 'binary');
    }

    return responseBody;
  }

  /**
   * 验证是否为有效的base64字符串
   * @param {string} str 要验证的字符串
   * @returns {boolean} 是否为有效的base64
   */
  static isValidBase64(str) {
    if (!str || typeof str !== 'string') {
      return false;
    }

    // base64字符串基本格式检查
    if (!/^[A-Za-z0-9+/]+=*$/.test(str)) {
      return false;
    }

    // 长度必须是4的倍数（补齐padding后）
    if (str.length % 4 !== 0) {
      return false;
    }

    // padding字符只能出现在末尾，且最多2个
    const paddingMatch = str.match(/=*$/);
    if (paddingMatch && paddingMatch[0].length > 2) {
      return false;
    }

    try {
      // 尝试解码验证
      const decoded = Buffer.from(str, 'base64');
      const reencoded = decoded.toString('base64');
      
      // 重新编码后应该相同（可能padding会标准化）
      return str === reencoded || str === reencoded.replace(/=+$/, '');
    } catch (error) {
      return false;
    }
  }  /**
   * 检测Buffer是否包含二进制数据
   * @param {Buffer} buffer 要检查的Buffer
   * @returns {boolean} 是否为二进制数据
   */
  static isBinaryData(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      // 使用成熟的 isbinaryfile 库进行判断（同步版本）
      // 注意：isBinaryFile 返回 Promise，但在这里我们需要同步判断
      // 所以我们结合库的逻辑和一些快速检查
      
      // 快速检查：空字节强烈表示二进制数据
      if (buffer.includes(0x00)) {
        return true;
      }      // 检查常见的二进制文件头
      const binarySignatures = [
        [0x89, 0x50, 0x4E, 0x47], // PNG
        [0xFF, 0xD8, 0xFF],        // JPEG
        [0x47, 0x49, 0x46],        // GIF
        [0x52, 0x49, 0x46, 0x46], // RIFF (WAV, AVI等)
        [0x50, 0x4B, 0x03, 0x04], // ZIP
        [0x25, 0x50, 0x44, 0x46], // PDF
        [0x7F, 0x45, 0x4C, 0x46], // ELF
        [0x4D, 0x5A],              // PE/COFF (.exe, .dll)
      ];

      // 检查文件头
      for (const signature of binarySignatures) {
        if (buffer.length >= signature.length) {
          let matches = true;
          for (let i = 0; i < signature.length; i++) {
            if (buffer[i] !== signature[i]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            return true;
          }
        }
      }

      // 统计控制字符（优先检查，因为这是强指标）
      let controlCharCount = 0;
      const sampleSize = Math.min(buffer.length, 1024);
      
      for (let i = 0; i < sampleSize; i++) {
        const byte = buffer[i];
        
        // 允许的控制字符：换行、回车、制表符
        if (byte === 0x0A || byte === 0x0D || byte === 0x09) {
          continue;
        }
        
        // 其他控制字符
        if (byte < 32) {
          controlCharCount++;
        }
      }

      // 如果控制字符超过15%，认为是二进制数据
      const controlCharRatio = controlCharCount / sampleSize;
      if (controlCharRatio > 0.15) {
        return true;
      }

      // 检查是否为有效的UTF-8文本
      if (this.isValidUTF8(buffer)) {
        return false; // 有效的UTF-8文本不是二进制数据
      }

      // 如果到这里还没确定，说明可能是编码有问题的数据，认为是二进制
      return true;
      
    } catch (error) {
      // 如果出错，回退到简单的空字节检查
      console.error('isBinaryData error:', error);
      return buffer.includes(0x00);
    }
  }

  /**
   * 异步检测Buffer是否包含二进制数据（使用 isbinaryfile 库）
   * @param {Buffer} buffer 要检查的Buffer
   * @returns {Promise<boolean>} 是否为二进制数据
   */
  static async isBinaryDataAsync(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      return await isBinaryFile(buffer);
    } catch (error) {
      console.error('isBinaryDataAsync error:', error);
      return buffer.includes(0x00);
    }
  }

  /**
   * 检查Buffer是否为有效的UTF-8编码
   * @param {Buffer} buffer 要检查的Buffer
   * @returns {boolean} 是否为有效的UTF-8
   */
  static isValidUTF8(buffer) {
    try {
      const text = buffer.toString('utf8');
      // 检查是否包含替换字符（�），这通常表示UTF-8解码失败
      if (text.includes('\uFFFD')) {
        return false;
      }
      
      // 尝试重新编码验证
      const reencoded = Buffer.from(text, 'utf8');
      return reencoded.equals(buffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * 安全的JSON解析
   * @param {string} str 要解析的字符串
   * @param {*} defaultValue 默认值
   * @returns {*} 解析结果或默认值
   */
  static safeJsonParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * 安全的JSON字符串化
   * @param {*} obj 要字符串化的对象
   * @param {string} defaultValue 默认值
   * @returns {string} JSON字符串或默认值
   */
  static safeJsonStringify(obj, defaultValue = '{}') {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * 格式化字节数
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的字符串
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化时间间隔
   * @param {number} ms 毫秒数
   * @returns {string} 格式化后的时间字符串
   */
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天 ${hours % 24}小时`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  /**
   * 检查端口是否可用
   * @param {number} port 端口号
   * @param {string} host 主机地址
   * @returns {Promise<boolean>} 是否可用
   */
  static async isPortAvailable(port, host = 'localhost') {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();

      server.listen(port, host, () => {
        server.once('close', () => resolve(true));
        server.close();
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * 创建延迟Promise
   * @param {number} ms 延迟毫秒数
   * @returns {Promise} 延迟Promise
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重试机制
   * @param {Function} fn 要重试的函数
   * @param {number} maxRetries 最大重试次数
   * @param {number} delayMs 重试间隔
   * @returns {Promise} 函数执行结果
   */
  static async retry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          await this.delay(delayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * 清理对象中的敏感信息
   * @param {Object} obj 原始对象
   * @param {Array} sensitiveKeys 敏感字段列表
   * @returns {Object} 清理后的对象
   */
  static sanitizeObject(obj, sensitiveKeys = ['password', 'token', 'secret', 'key']) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };

    sensitiveKeys.forEach(key => {
      if (sanitized.hasOwnProperty(key)) {
        sanitized[key] = '***';
      }
    });

    return sanitized;
  }

  /**
   * 获取客户端IP地址
   * @param {Object} ctx Koa上下文或请求对象
   * @returns {string} IP地址
   */
  static getClientIP(ctx) {
    if (ctx.request && ctx.request.ip) {
      return ctx.request.ip;
    }

    if (ctx.headers) {
      return ctx.headers['x-forwarded-for'] ||
        ctx.headers['x-real-ip'] ||
        ctx.connection?.remoteAddress ||
        ctx.socket?.remoteAddress ||
        'unknown';
    }

    return 'unknown';
  }
}

module.exports = Utils;
