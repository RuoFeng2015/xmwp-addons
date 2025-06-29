/**
 * 模块导出索引
 * 提供统一的模块导入接口
 */

// 核心模块
const { CONFIG } = require('./core/config');
const Logger = require('./core/logger');
const ClientManager = require('./core/client-manager');

// 服务器模块
const TunnelServer = require('./servers/tunnel-server');
const ProxyServer = require('./servers/proxy-server');
const AdminServer = require('./servers/admin-server');

// 工具模块
const Utils = require('./utils/utils');
const WebSocketUtils = require('./utils/websocket-utils');

// 主应用
const { TunnelServerApp } = require('./app');

module.exports = {
  // 核心模块
  CONFIG,
  Logger,
  ClientManager,

  // 服务器模块
  TunnelServer,
  ProxyServer,
  AdminServer,

  // 工具模块
  Utils,
  WebSocketUtils,

  // 主应用
  TunnelServerApp
};
