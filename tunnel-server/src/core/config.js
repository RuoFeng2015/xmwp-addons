/**
 * 配置管理模块
 * 统一管理服务端所有配置项
 */

// 加载环境变量
require('dotenv').config();

console.log("%c Line:12 🥖 process.env", "color:#3f7cff", process.env);
const CONFIG = {
  // 服务端口
  TUNNEL_PORT: process.env.TUNNEL_PORT || 3080,    // 隧道连接端口
  PROXY_PORT: process.env.PROXY_PORT || 3081,      // HTTP代理端口
  ADMIN_PORT: process.env.ADMIN_PORT || 3082,      // 管理后台端口

  // 安全配置
  JWT_SECRET: process.env.JWT_SECRET || 'tunnel-server-secret-2023',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'password',

  // 连接配置
  MAX_CLIENTS: parseInt(process.env.MAX_CLIENTS) || 10,
  HEARTBEAT_INTERVAL: 30000,    // 30秒心跳
  CLIENT_TIMEOUT: 60000,        // 60秒超时

  // SSL配置 (可选)
  SSL_ENABLED: process.env.SSL_ENABLED === 'true',
  SSL_KEY_PATH: process.env.SSL_KEY_PATH,
  SSL_CERT_PATH: process.env.SSL_CERT_PATH,

  // 日志配置
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // 腾讯云DNS配置
  TENCENT_SECRET_ID: process.env.TENCENT_SECRET_ID,
  TENCENT_SECRET_KEY: process.env.TENCENT_SECRET_KEY,
  TENCENT_REGION: process.env.TENCENT_REGION || 'ap-guangzhou',

  // 域名配置
  BASE_DOMAIN: process.env.BASE_DOMAIN || 'wzzhk.club',
  SERVER_IP: process.env.SERVER_IP, // 服务器公网IP
  SERVER_DOMAIN: process.env.SERVER_DOMAIN || 'tunnel.wzzhk.club', // 服务器域名
  DOMAIN_MODE: process.env.DOMAIN_MODE === 'true' || true, // 启用域名模式
};

/**
 * 验证配置的有效性
 */
function validateConfig() {
  const errors = [];

  // 验证端口号
  if (CONFIG.TUNNEL_PORT < 1 || CONFIG.TUNNEL_PORT > 65535) {
    errors.push('TUNNEL_PORT must be between 1 and 65535');
  }
  if (CONFIG.PROXY_PORT < 1 || CONFIG.PROXY_PORT > 65535) {
    errors.push('PROXY_PORT must be between 1 and 65535');
  }
  if (CONFIG.ADMIN_PORT < 1 || CONFIG.ADMIN_PORT > 65535) {
    errors.push('ADMIN_PORT must be between 1 and 65535');
  }

  // 验证端口不能重复
  const ports = [CONFIG.TUNNEL_PORT, CONFIG.PROXY_PORT, CONFIG.ADMIN_PORT];
  const uniquePorts = [...new Set(ports)];
  if (ports.length !== uniquePorts.length) {
    errors.push('All ports must be unique');
  }

  // 验证最大客户端数
  if (CONFIG.MAX_CLIENTS < 1 || CONFIG.MAX_CLIENTS > 10000) {
    errors.push('MAX_CLIENTS must be between 1 and 10000');
  }

  // 验证SSL配置
  if (CONFIG.SSL_ENABLED) {
    if (!CONFIG.SSL_KEY_PATH || !CONFIG.SSL_CERT_PATH) {
      errors.push('SSL_KEY_PATH and SSL_CERT_PATH are required when SSL is enabled');
    }
  }

  // 验证腾讯云DNS配置（当启用域名模式时）
  if (CONFIG.DOMAIN_MODE) {
    if (!CONFIG.TENCENT_SECRET_ID || !CONFIG.TENCENT_SECRET_KEY) {
      errors.push('TENCENT_SECRET_ID and TENCENT_SECRET_KEY are required when DOMAIN_MODE is enabled');
    }
    if (!CONFIG.BASE_DOMAIN) {
      errors.push('BASE_DOMAIN is required when DOMAIN_MODE is enabled');
    }
    if (!CONFIG.SERVER_IP) {
      errors.push('SERVER_IP is required when DOMAIN_MODE is enabled');
    }
  }

  return errors;
}

/**
 * 获取配置信息（用于日志输出）
 */
function getConfigInfo() {
  return {
    tunnel_port: CONFIG.TUNNEL_PORT,
    proxy_port: CONFIG.PROXY_PORT,
    admin_port: CONFIG.ADMIN_PORT,
    max_clients: CONFIG.MAX_CLIENTS,
    ssl_enabled: CONFIG.SSL_ENABLED,
    log_level: CONFIG.LOG_LEVEL
  };
}

module.exports = {
  CONFIG,
  validateConfig,
  getConfigInfo
};
