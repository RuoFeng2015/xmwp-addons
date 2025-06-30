const http = require('http');
const Logger = require('./logger');
const { getConfig } = require('./config');

/**
 * HA API健康检查器
 */
class HAHealthChecker {
  constructor() {
    this.lastCheckTime = 0;
    this.checkInterval = 30000; // 30秒检查一次
    this.criticalAPIs = [
      '/api/config',
      '/api/states', 
      '/api/services',
      '/manifest.json'
    ];
  }

  /**
   * 启动健康检查
   */
  startHealthCheck(hostname) {
    if (Date.now() - this.lastCheckTime < this.checkInterval) {
      return; // 避免频繁检查
    }
    
    this.lastCheckTime = Date.now();
    Logger.info(`🏥 [健康检查] 开始检查HA实例: ${hostname}`);
    
    this.criticalAPIs.forEach(async (apiPath) => {
      try {
        await this.checkAPI(hostname, apiPath);
      } catch (error) {
        Logger.error(`🏥 [健康检查] API ${apiPath} 检查失败: ${error.message}`);
      }
    });
  }

  /**
   * 检查单个API端点
   */
  checkAPI(hostname, apiPath) {
    return new Promise((resolve, reject) => {
      const config = getConfig();
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: apiPath,
        method: 'GET',
        headers: {
          'User-Agent': 'HomeAssistant-Health-Checker/1.0',
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            Logger.info(`🏥 [健康检查] ✅ ${apiPath}: ${res.statusCode} (${data.length} bytes)`);
            
            // 特别检查关键API的内容
            if (apiPath === '/api/config' && data.length > 0) {
              try {
                const config = JSON.parse(data);
                Logger.info(`🏥 [健康检查] HA版本: ${config.version || '未知'}`);
                Logger.info(`🏥 [健康检查] HA配置正常，iOS App应能正常获取`);
              } catch (e) {
                Logger.warn(`🏥 [健康检查] /api/config 响应解析异常`);
              }
            }
            
            if (apiPath === '/api/states' && data.length > 0) {
              try {
                const states = JSON.parse(data);
                if (Array.isArray(states)) {
                  Logger.info(`🏥 [健康检查] 实体数量: ${states.length}`);
                  Logger.info(`🏥 [健康检查] HA状态API正常，iOS App应能看到实体`);
                }
              } catch (e) {
                Logger.warn(`🏥 [健康检查] /api/states 响应解析异常`);
              }
            }
            
          } else {
            Logger.warn(`🏥 [健康检查] ⚠️ ${apiPath}: ${res.statusCode}`);
          }
          resolve();
        });
      });

      req.on('error', (error) => {
        Logger.error(`🏥 [健康检查] ❌ ${apiPath}: ${error.message}`);
        reject(error);
      });

      req.on('timeout', () => {
        Logger.warn(`🏥 [健康检查] ⏰ ${apiPath}: 超时`);
        req.destroy();
        reject(new Error('超时'));
      });

      req.end();
    });
  }

  /**
   * 检查iOS App需要的特定功能
   */
  async checkiOSCompatibility(hostname) {
    Logger.info(`🍎 [iOS兼容性] 开始检查iOS App所需功能...`);
    
    // 检查manifest.json (PWA支持)
    try {
      await this.checkAPI(hostname, '/manifest.json');
    } catch (e) {
      Logger.warn(`🍎 [iOS兼容性] manifest.json 不可用，可能影响PWA功能`);
    }
    
    // 检查auth端点
    try {
      await this.checkAPI(hostname, '/auth/providers');
    } catch (e) {
      Logger.error(`🍎 [iOS兼容性] 认证端点不可用，iOS App无法登录`);
    }
    
    Logger.info(`🍎 [iOS兼容性] 兼容性检查完成`);
  }
}

module.exports = HAHealthChecker;
