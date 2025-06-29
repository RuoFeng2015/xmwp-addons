/**
 * 域名管理模块
 * 负责用户域名的分配、管理和回收
 */

const crypto = require('crypto');
const Logger = require('../core/logger');
const { CONFIG } = require('../core/config');
const TencentCloudDNS = require('./tencent-dns');

class DomainManager {
  constructor() {
    this.dns = new TencentCloudDNS();
    this.userDomains = new Map(); // clientId -> domainInfo
    this.domainToClient = new Map(); // fullDomain -> clientId
    this.reservedDomains = new Set(['www', 'mail', 'ftp', 'api', 'admin', 'test']); // 保留域名
  }

  /**
   * 生成用户子域名
   * 直接使用 client_id 作为子域名，不添加随机后缀
   */
  generateSubdomain(clientId) {
    // 确保ID符合域名规范（只包含字母数字和连字符）
    const subdomain = clientId.toLowerCase().replace(/[^a-z0-9-]/g, '');

    // 验证域名格式
    if (!subdomain || subdomain.length === 0) {
      throw new Error('客户端ID无效，无法生成域名');
    }

    return subdomain;
  }

  /**
   * 为客户端分配域名
   */
  async allocateDomain(clientId, serverIp) {
    try {
      console.log(`🌐 [DomainManager] 开始为客户端 ${clientId} 分配域名，服务器IP: ${serverIp}`);
      
      // 检查是否已经分配了域名
      if (this.userDomains.has(clientId)) {
        const existingDomain = this.userDomains.get(clientId);
        console.log(`🌐 [DomainManager] 客户端 ${clientId} 已有域名: ${existingDomain.fullDomain}`);
        Logger.info(`客户端 ${clientId} 已有域名: ${existingDomain.fullDomain}`);
        return {
          success: true,
          ...existingDomain,
          isExisting: true
        };
      }

      // 生成子域名（直接使用clientId）
      const subdomain = this.generateSubdomain(clientId);
      console.log(`🌐 [DomainManager] 生成子域名: ${subdomain}`);

      // 检查是否是保留域名
      if (this.reservedDomains.has(subdomain)) {
        const error = `域名 ${subdomain} 是保留域名，无法分配`;
        console.log(`❌ [DomainManager] ${error}`);
        throw new Error(error);
      }

      // 检查DNS操作是否需要执行
      let createResult = { success: true, recordId: 'mock-record-id' };
      let dnsOperationAttempted = false;
      
      if (CONFIG.TENCENT_SECRET_ID && CONFIG.TENCENT_SECRET_KEY) {
        try {
          console.log(`🌐 [DomainManager] 检查DNS中域名可用性: ${subdomain}`);
          // 检查DNS中是否已存在（理论上clientId应该是唯一的）
          const isAvailable = await this.dns.isDomainAvailable(subdomain);
          if (!isAvailable) {
            throw new Error(`域名 ${subdomain} 已被占用`);
          }

          // 在DNS中创建记录
          console.log(`🌐 [DomainManager] 在DNS中创建记录: ${subdomain} -> ${serverIp}`);
          dnsOperationAttempted = true;
          createResult = await this.dns.createRecord(subdomain, serverIp);
          
          if (!createResult.success) {
            console.log(`⚠️ [DomainManager] DNS记录创建失败，但继续使用本地映射: ${createResult.error}`);
            createResult = { success: true, recordId: `local-${Date.now()}` };
          } else {
            console.log(`🌐 [DomainManager] DNS记录创建成功，记录ID: ${createResult.recordId}`);
          }
        } catch (dnsError) {
          console.log(`⚠️ [DomainManager] DNS操作失败，但继续使用本地映射: ${dnsError.message}`);
          createResult = { success: true, recordId: `local-${Date.now()}` };
        }
      } else {
        console.log(`⚠️ [DomainManager] 未配置腾讯云DNS凭据，使用本地映射模式`);
      }

      // 保存域名信息
      const domainInfo = {
        clientId: clientId,
        subdomain: subdomain,
        fullDomain: `${subdomain}.${CONFIG.BASE_DOMAIN}`,
        recordId: createResult.recordId,
        serverIp: serverIp,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      console.log(`🌐 [DomainManager] 保存域名信息:`, domainInfo);

      this.userDomains.set(clientId, domainInfo);
      this.domainToClient.set(domainInfo.fullDomain, clientId);

      console.log(`✅ [DomainManager] 域名映射已建立: ${domainInfo.fullDomain} -> ${clientId}`);
      console.log(`📊 [DomainManager] 当前映射数量: ${this.domainToClient.size}`);
      console.log(`📊 [DomainManager] 所有映射:`, Array.from(this.domainToClient.entries()));

      Logger.info(`为客户端 ${clientId} 分配域名: ${domainInfo.fullDomain}`);

      return {
        success: true,
        ...domainInfo,
        isExisting: false
      };

    } catch (error) {
      console.log(`❌ [DomainManager] 域名分配失败: ${error.message}`);
      Logger.error(`域名分配失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 释放客户端域名
   */
  async releaseDomain(clientId) {
    try {
      const domainInfo = this.userDomains.get(clientId);
      if (!domainInfo) {
        Logger.warn(`客户端 ${clientId} 没有分配的域名`);
        return { success: true };
      }

      // 从DNS中删除记录
      const deleteResult = await this.dns.deleteRecord(domainInfo.recordId);
      if (!deleteResult.success) {
        Logger.error(`DNS记录删除失败: ${deleteResult.error}`);
        // 继续清理本地记录，即使DNS删除失败
      }

      // 清理本地记录
      this.userDomains.delete(clientId);
      this.domainToClient.delete(domainInfo.fullDomain);

      Logger.info(`释放客户端 ${clientId} 的域名: ${domainInfo.fullDomain}`);

      return {
        success: true,
        releasedDomain: domainInfo.fullDomain
      };

    } catch (error) {
      Logger.error(`域名释放失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  /**
   * 根据域名查找客户端
   */
  getClientByDomain(domain) {
    console.log(`🗺️ DomainManager.getClientByDomain: ${domain}`);
    console.log(`📊 当前域名映射数量: ${this.domainToClient.size}`);
    console.log(`📋 所有域名映射:`, Array.from(this.domainToClient.entries()));

    // 支持完整域名和子域名查找
    let clientId = this.domainToClient.get(domain);
    console.log(`🎯 直接查找结果: ${clientId}`);

    if (!clientId && domain.includes('.')) {
      // 如果没找到，尝试添加基础域名
      const fullDomain = domain.endsWith(`.${CONFIG.BASE_DOMAIN}`) ?
        domain : `${domain}.${CONFIG.BASE_DOMAIN}`;
      console.log(`🔗 尝试完整域名: ${fullDomain}`);
      clientId = this.domainToClient.get(fullDomain);
      console.log(`🎯 完整域名查找结果: ${clientId}`);
    }

    if (clientId) {
      // 更新最后使用时间
      const domainInfo = this.userDomains.get(clientId);
      if (domainInfo) {
        domainInfo.lastUsed = Date.now();
      }
    }

    console.log(`✅ 最终返回clientId: ${clientId}`);
    return clientId;
  }

  /**
   * 获取客户端的域名信息
   */
  getDomainInfo(clientId) {
    return this.userDomains.get(clientId);
  }

  /**
   * 获取所有域名映射
   */
  getAllDomains() {
    return Array.from(this.userDomains.values());
  }

  /**
   * 清理过期域名（超过7天未使用）
   */
  async cleanupExpiredDomains() {
    const now = Date.now();
    const expireTime = 7 * 24 * 60 * 60 * 1000; // 7天

    const expiredClients = [];
    for (const [clientId, domainInfo] of this.userDomains.entries()) {
      if (now - domainInfo.lastUsed > expireTime) {
        expiredClients.push(clientId);
      }
    }

    for (const clientId of expiredClients) {
      Logger.info(`清理过期域名: ${clientId}`);
      await this.releaseDomain(clientId);
    }

    if (expiredClients.length > 0) {
      Logger.info(`清理了 ${expiredClients.length} 个过期域名`);
    }
  }

  /**
   * 验证域名格式
   */
  isValidDomain(domain) {
    // 基本的域名格式验证
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * 更新域名的服务器IP
   */
  async updateDomainIP(clientId, newServerIp) {
    try {
      const domainInfo = this.userDomains.get(clientId);
      if (!domainInfo) {
        throw new Error('客户端没有分配的域名');
      }

      // 删除旧记录
      await this.dns.deleteRecord(domainInfo.recordId);

      // 创建新记录
      const createResult = await this.dns.createRecord(domainInfo.subdomain, newServerIp);
      if (!createResult.success) {
        throw new Error(`更新DNS记录失败: ${createResult.error}`);
      }

      // 更新本地记录
      domainInfo.recordId = createResult.recordId;
      domainInfo.serverIp = newServerIp;
      domainInfo.lastUsed = Date.now();

      Logger.info(`更新域名 ${domainInfo.fullDomain} 的IP: ${newServerIp}`);

      return { success: true };

    } catch (error) {
      Logger.error(`更新域名IP失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取域名统计信息
   */
  getStats() {
    const now = Date.now();
    const domains = Array.from(this.userDomains.values());

    return {
      totalDomains: domains.length,
      activeDomains: domains.filter(d => now - d.lastUsed < 24 * 60 * 60 * 1000).length, // 24小时内活跃
      oldestDomain: domains.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest, domains[0]),
      newestDomain: domains.reduce((newest, current) =>
        current.createdAt > newest.createdAt ? current : newest, domains[0])
    };
  }
}

module.exports = DomainManager;
