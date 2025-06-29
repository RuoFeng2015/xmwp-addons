/**
 * 客户端连接管理模块
 * 负责管理所有客户端连接、路由映射等
 */

const { CONFIG } = require('./config');
const Logger = require('./logger');
const DomainManager = require('../utils/domain-manager');

/**
 * 客户端连接管理器
 */
class ClientManager {
  constructor() {
    this.clients = new Map();       // clientId -> clientInfo
    this.connections = new Map();   // socket -> clientInfo
    this.routes = new Map();        // subdomain/path -> clientId
    this.domainManager = new DomainManager(); // 域名管理器
  }
  /**
   * 注册新客户端
   * @param {Socket} socket 客户端socket
   * @param {Object} clientInfo 客户端信息
   */
  async registerClient(socket, clientInfo) {
    console.log(`🔵 [ClientManager] 开始注册客户端: ${JSON.stringify({
      clientId: clientInfo.clientId,
      username: clientInfo.username,
      remoteAddress: clientInfo.remoteAddress,
      authenticated: clientInfo.authenticated,
      domainMode: CONFIG.DOMAIN_MODE,
      baseDomain: CONFIG.BASE_DOMAIN,
      serverIP: CONFIG.SERVER_IP
    })}`);

    this.connections.set(socket, clientInfo);

    if (clientInfo.clientId) {
      this.clients.set(clientInfo.clientId, clientInfo);

      // 如果启用域名模式，分配域名
      if (CONFIG.DOMAIN_MODE) {
        console.log(`🌐 [ClientManager] 为客户端 ${clientInfo.clientId} 分配域名...`);
        console.log(`🌐 [ClientManager] 域名配置检查: BASE_DOMAIN=${CONFIG.BASE_DOMAIN}, SERVER_IP=${CONFIG.SERVER_IP}`);
        
        const domainResult = await this.allocateDomainForClient(clientInfo);
        console.log(`🌐 [ClientManager] 域名分配结果:`, domainResult);
        
        // 立即检查分配后的映射状态
        const allDomains = this.domainManager.getAllDomains();
        const mappingCount = this.domainManager.domainToClient.size;
        console.log(`📊 [ClientManager] 分配后域名映射数量: ${mappingCount}`);
        console.log(`📊 [ClientManager] 所有域名信息:`, allDomains);
        
        // 测试域名查找
        if (domainResult && domainResult.fullDomain) {
          const testClient = this.getClientByDomain(domainResult.fullDomain);
          console.log(`🧪 [ClientManager] 域名查找测试 ${domainResult.fullDomain} -> ${testClient ? testClient.clientId : 'null'}`);
        }
      }

      Logger.info(`客户端注册成功: ${clientInfo.clientId} (${clientInfo.remoteAddress})`);
      console.log(`📊 [ClientManager] 当前已连接客户端数: ${this.clients.size}`);
      console.log(`📊 [ClientManager] 已连接客户端列表: ${Array.from(this.clients.keys()).join(', ')}`);
    } else {
      console.log(`⚠️ [ClientManager] 客户端没有clientId，无法完成注册`);
    }
  }
  /**
   * 移除客户端
   * @param {Socket} socket 客户端socket
   */
  async removeClient(socket) {
    const clientInfo = this.connections.get(socket);
    if (clientInfo) {
      if (clientInfo.clientId) {
        this.clients.delete(clientInfo.clientId);
        this.removeRoutes(clientInfo.clientId);

        // 如果启用域名模式，释放域名
        if (CONFIG.DOMAIN_MODE) {
          await this.releaseDomainForClient(clientInfo.clientId);
        }

        Logger.info(`客户端断开连接: ${clientInfo.clientId}`);
      }
      this.connections.delete(socket);
    }
  }

  /**
   * 获取客户端信息
   * @param {string} clientId 客户端ID
   * @returns {Object|null} 客户端信息
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * 获取socket对应的客户端信息
   * @param {Socket} socket 客户端socket
   * @returns {Object|null} 客户端信息
   */
  getClientBySocket(socket) {
    return this.connections.get(socket);
  }

  /**
   * 获取所有客户端
   * @returns {Array} 客户端列表
   */
  getAllClients() {
    return Array.from(this.clients.values());
  }

  /**
   * 获取已认证的客户端
   * @returns {Array} 已认证客户端列表
   */
  getAuthenticatedClients() {
    return this.getAllClients().filter(client => client.authenticated);
  }

  /**
   * 检查是否可以接受新客户端
   * @returns {boolean} 是否可以接受
   */
  canAcceptNewClient() {
    return this.clients.size < CONFIG.MAX_CLIENTS;
  }

  /**
   * 获取连接统计信息
   * @returns {Object} 统计信息
   */
  getConnectionStats() {
    const allClients = this.getAllClients();
    return {
      total: allClients.length,
      authenticated: allClients.filter(c => c.authenticated).length,
      maxAllowed: CONFIG.MAX_CLIENTS,
      utilizationRate: Math.round((allClients.length / CONFIG.MAX_CLIENTS) * 100)
    };
  }

  /**
   * 添加路由映射
   * @param {string} route 路由
   * @param {string} clientId 客户端ID
   */
  addRoute(route, clientId) {
    this.routes.set(route, clientId);
    Logger.debug(`添加路由映射: ${route} -> ${clientId}`);
  }

  /**
   * 移除客户端的所有路由
   * @param {string} clientId 客户端ID
   */
  removeRoutes(clientId) {
    for (const [route, cId] of this.routes.entries()) {
      if (cId === clientId) {
        this.routes.delete(route);
        Logger.debug(`移除路由映射: ${route}`);
      }
    }
  }

  /**
   * 根据路由获取客户端
   * @param {string} route 路由
   * @returns {Object|null} 客户端信息
   */
  getClientByRoute(route) {
    const clientId = this.routes.get(route);
    return clientId ? this.clients.get(clientId) : null;
  }

  /**
   * 获取所有路由映射
   * @returns {Array} 路由映射列表
   */
  getAllRoutes() {
    return Array.from(this.routes.entries()).map(([route, clientId]) => ({
      route,
      client_id: clientId
    }));
  }

  /**
   * 检查客户端ID是否已存在
   * @param {string} clientId 客户端ID
   * @param {Socket} excludeSocket 排除的socket
   * @returns {boolean} 是否已存在
   */
  isClientIdExists(clientId, excludeSocket = null) {
    const existingClient = this.getClient(clientId);
    return existingClient && existingClient.socket !== excludeSocket;
  }

  /**
   * 更新客户端心跳时间
   * @param {Socket} socket 客户端socket
   */
  updateHeartbeat(socket) {
    const clientInfo = this.getClientBySocket(socket);
    if (clientInfo) {
      clientInfo.lastHeartbeat = Date.now();
    }
  }

  /**
   * 检查超时的客户端
   * @returns {Array} 超时的客户端列表
   */
  getTimeoutClients() {
    const now = Date.now();
    return this.getAllClients().filter(client =>
      now - client.lastHeartbeat > CONFIG.CLIENT_TIMEOUT
    );
  }

  /**
   * 清理超时的客户端
   * @returns {number} 清理的客户端数量
   */
  cleanupTimeoutClients() {
    const timeoutClients = this.getTimeoutClients();
    let cleanedCount = 0;

    for (const client of timeoutClients) {
      Logger.warn(`客户端心跳超时: ${client.clientId || client.remoteAddress}`);
      if (client.socket && !client.socket.destroyed) {
        client.socket.destroy();
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 为客户端分配域名
   * @param {Object} clientInfo 客户端信息
   */
  async allocateDomainForClient(clientInfo) {
    try {
      console.log(`🌐 [ClientManager] 开始为客户端 ${clientInfo.clientId} 分配域名`);
      console.log(`🌐 [ClientManager] 服务器配置: SERVER_IP=${CONFIG.SERVER_IP}, BASE_DOMAIN=${CONFIG.BASE_DOMAIN}`);
      
      const result = await this.domainManager.allocateDomain(
        clientInfo.clientId,
        CONFIG.SERVER_IP
      );

      console.log(`🌐 [ClientManager] 域名管理器返回结果:`, result);

      if (result.success) {
        clientInfo.domainInfo = result;
        Logger.info(`客户端 ${clientInfo.clientId} 分配域名: ${result.fullDomain}`);

        // 添加域名路由映射
        console.log(`🗺️ [ClientManager] 添加路由映射: ${result.fullDomain} -> ${clientInfo.clientId}`);
        this.addRoute(result.fullDomain, clientInfo.clientId);
        
        console.log(`🗺️ [ClientManager] 添加路由映射: ${result.subdomain} -> ${clientInfo.clientId}`);
        this.addRoute(result.subdomain, clientInfo.clientId);

        // 验证映射是否正确添加
        console.log(`🔍 [ClientManager] 验证路由映射 ${result.fullDomain}:`, this.routes.get(result.fullDomain));
        console.log(`🔍 [ClientManager] 验证路由映射 ${result.subdomain}:`, this.routes.get(result.subdomain));

        return result;
      } else {
        Logger.error(`客户端 ${clientInfo.clientId} 域名分配失败: ${result.error}`);
        return null;
      }
    } catch (error) {
      Logger.error(`域名分配异常: ${error.message}`);
      console.log(`❌ [ClientManager] 域名分配异常详情:`, error.stack);
      return null;
    }
  }

  /**
   * 释放客户端域名
   * @param {string} clientId 客户端ID
   */
  async releaseDomainForClient(clientId) {
    try {
      const result = await this.domainManager.releaseDomain(clientId);
      if (result.success) {
        Logger.info(`客户端 ${clientId} 域名释放成功: ${result.releasedDomain}`);
      } else {
        Logger.error(`客户端 ${clientId} 域名释放失败: ${result.error}`);
      }
      return result;
    } catch (error) {
      Logger.error(`域名释放异常: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  /**
   * 根据域名查找客户端
   * @param {string} domain 域名
   * @returns {Object|null} 客户端信息
   */
  getClientByDomain(domain) {
    console.log(`🔎 ClientManager.getClientByDomain: ${domain}`);
    console.log(`🔧 域名模式启用: ${CONFIG.DOMAIN_MODE}`);

    if (!CONFIG.DOMAIN_MODE) {
      console.log('❌ 域名模式未启用，返回null');
      return null;
    }

    const clientId = this.domainManager.getClientByDomain(domain);
    console.log(`🆔 DomainManager返回的clientId: ${clientId}`);

    const client = clientId ? this.getClient(clientId) : null;
    console.log(`👤 最终找到的客户端: ${client ? client.clientId : 'null'}`);

    return client;
  }

  /**
   * 获取客户端的域名信息
   * @param {string} clientId 客户端ID
   * @returns {Object|null} 域名信息
   */
  getClientDomain(clientId) {
    if (!CONFIG.DOMAIN_MODE) {
      return null;
    }

    return this.domainManager.getDomainInfo(clientId);
  }

  /**
   * 获取所有域名映射
   * @returns {Array} 域名映射列表
   */
  getAllDomains() {
    if (!CONFIG.DOMAIN_MODE) {
      return [];
    }

    return this.domainManager.getAllDomains();
  }

  /**
   * 清理过期域名
   */
  async cleanupExpiredDomains() {
    if (!CONFIG.DOMAIN_MODE) {
      return;
    }

    await this.domainManager.cleanupExpiredDomains();
  }
}

module.exports = ClientManager;
