const http = require('http');
const Logger = require('./logger');
const { getConfig } = require('./config');

/**
 * 实时API监控器 - 模拟iOS App的API调用模式
 */
class APIMonitor {
  constructor() {
    this.isMonitoring = false;
    this.lastOAuthSuccess = null;
    this.monitorInterval = null;
  }

  /**
   * 开始监控 - 当检测到iOS OAuth成功后启动
   */
  startMonitoring(hostname, accessToken) {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastOAuthSuccess = Date.now();
    
    Logger.info(`🔍 [API监控] *** 开始监控iOS API调用模式 ***`);
    Logger.info(`🔍 [API监控] 目标主机: ${hostname}`);
    Logger.info(`🔍 [API监控] 使用access_token: ${accessToken ? accessToken.substring(0, 20) + '...' : '无'}`);
    
    // 5秒后开始模拟iOS App的API调用
    setTimeout(() => {
      this.simulateiOSAPICalls(hostname, accessToken);
    }, 5000);
    
    // 每30秒检查一次
    this.monitorInterval = setInterval(() => {
      this.checkAPIHealth(hostname, accessToken);
    }, 30000);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    Logger.info(`🔍 [API监控] 监控已停止`);
  }

  /**
   * 模拟iOS App的API调用顺序
   */
  async simulateiOSAPICalls(hostname, accessToken) {
    Logger.info(`🍎 [API模拟] *** 开始模拟iOS App的API调用顺序 ***`);
    
    const apis = [
      { path: '/api/config', description: 'HA配置信息' },
      { path: '/api/states', description: 'HA实体状态' },
      { path: '/api/services', description: 'HA可用服务' },
      { path: '/api/panels', description: 'HA面板配置' },
      { path: '/api/person', description: '用户信息' },
    ];

    for (const api of apis) {
      try {
        await this.testAPI(hostname, api.path, api.description, accessToken);
        await this.sleep(1000); // 1秒间隔
      } catch (error) {
        Logger.error(`🍎 [API模拟] ${api.path} 测试失败: ${error.message}`);
      }
    }
    
    Logger.info(`🍎 [API模拟] *** 模拟完成 - 如果以上API都能正常工作，说明HA实例正常 ***`);
    Logger.info(`🍎 [API模拟] *** iOS App应该能够正常获取数据，如果不能则可能是App内部问题 ***`);
  }

  /**
   * 测试单个API端点
   */
  testAPI(hostname, apiPath, description, accessToken) {
    return new Promise((resolve, reject) => {
      const config = getConfig();
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: apiPath,
        method: 'GET',
        headers: {
          'User-Agent': 'iOS-API-Monitor/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };

      // 如果有access_token，添加Authorization头
      if (accessToken) {
        options.headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const status = res.statusCode;
          const size = data.length;
          
          if (status === 200) {
            Logger.info(`🍎 [API模拟] ✅ ${apiPath} (${description}): ${status} - ${size} bytes`);
            
            // 检查关键API的响应内容
            if (apiPath === '/api/config' && size > 0) {
              try {
                const config = JSON.parse(data);
                Logger.info(`🍎 [API模拟] HA版本: ${config.version || '未知'}`);
                Logger.info(`🍎 [API模拟] HA配置正常，iOS App应能正常工作`);
              } catch (e) {
                Logger.warn(`🍎 [API模拟] config响应解析失败`);
              }
            }
            
            if (apiPath === '/api/states' && size > 0) {
              try {
                const states = JSON.parse(data);
                if (Array.isArray(states)) {
                  Logger.info(`🍎 [API模拟] 实体数量: ${states.length}`);
                  Logger.info(`🍎 [API模拟] HA状态API正常，iOS App应能看到实体`);
                }
              } catch (e) {
                Logger.warn(`🍎 [API模拟] states响应解析失败`);
              }
            }
            
          } else if (status === 401) {
            Logger.warn(`🍎 [API模拟] 🔐 ${apiPath}: ${status} - 需要认证 (${accessToken ? '有token但' : '无'}认证失败)`);
          } else {
            Logger.warn(`🍎 [API模拟] ⚠️ ${apiPath}: ${status} - ${size} bytes`);
          }
          
          resolve({ status, data });
        });
      });

      req.on('error', (error) => {
        Logger.error(`🍎 [API模拟] ❌ ${apiPath}: ${error.message}`);
        reject(error);
      });

      req.on('timeout', () => {
        Logger.warn(`🍎 [API模拟] ⏰ ${apiPath}: 超时`);
        req.destroy();
        reject(new Error('超时'));
      });

      req.end();
    });
  }

  /**
   * 检查API健康状态
   */
  async checkAPIHealth(hostname, accessToken) {
    Logger.info(`🏥 [API健康] 定期健康检查...`);
    try {
      await this.testAPI(hostname, '/api/config', '配置检查', accessToken);
    } catch (error) {
      Logger.error(`🏥 [API健康] 健康检查失败: ${error.message}`);
    }
  }

  /**
   * 工具函数：延时
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = APIMonitor;
