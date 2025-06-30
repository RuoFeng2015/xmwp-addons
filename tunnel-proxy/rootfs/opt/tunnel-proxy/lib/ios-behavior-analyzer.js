const Logger = require('./logger');

/**
 * iOS Home Assistant App 行为分析器
 * 专门分析iOS App在OAuth成功后的行为模式
 */
class IOSBehaviorAnalyzer {
  constructor() {
    this.sessionData = {
      oauthStartTime: null,
      oauthCompleteTime: null,
      websocketConnectTime: null,
      websocketAuthTime: null,
      firstAPIRequestTime: null,
      apiRequests: [],
      issues: []
    };
  }

  /**
   * 记录OAuth开始
   */
  recordOAuthStart() {
    this.sessionData.oauthStartTime = Date.now();
    Logger.info(`🍎 [行为分析] OAuth流程开始`);
  }

  /**
   * 记录OAuth完成
   */
  recordOAuthComplete() {
    this.sessionData.oauthCompleteTime = Date.now();
    const duration = this.sessionData.oauthCompleteTime - this.sessionData.oauthStartTime;
    Logger.info(`🍎 [行为分析] OAuth流程完成，耗时: ${duration}ms`);
  }

  /**
   * 记录WebSocket连接
   */
  recordWebSocketConnect() {
    this.sessionData.websocketConnectTime = Date.now();
    Logger.info(`🍎 [行为分析] WebSocket连接建立`);
  }

  /**
   * 记录WebSocket认证
   */
  recordWebSocketAuth() {
    this.sessionData.websocketAuthTime = Date.now();
    const timeSinceOAuth = this.sessionData.websocketAuthTime - this.sessionData.oauthCompleteTime;
    Logger.info(`🍎 [行为分析] WebSocket认证完成，OAuth后 ${timeSinceOAuth}ms`);
  }

  /**
   * 记录API请求
   */
  recordAPIRequest(method, url, statusCode, responseSize) {
    const now = Date.now();
    const apiRequest = {
      timestamp: now,
      method,
      url,
      statusCode,
      responseSize,
      timeSinceOAuth: this.sessionData.oauthCompleteTime ? now - this.sessionData.oauthCompleteTime : null,
      timeSinceWebSocketAuth: this.sessionData.websocketAuthTime ? now - this.sessionData.websocketAuthTime : null
    };

    this.sessionData.apiRequests.push(apiRequest);

    // 记录第一个API请求
    if (!this.sessionData.firstAPIRequestTime && url.includes('/api/')) {
      this.sessionData.firstAPIRequestTime = now;
      Logger.info(`🍎 [行为分析] 首个HA API请求: ${method} ${url}`);
    }

    // 分析请求模式
    this.analyzeRequestPattern(apiRequest);
  }

  /**
   * 分析请求模式
   */
  analyzeRequestPattern(request) {
    const { url, statusCode, timeSinceOAuth, timeSinceWebSocketAuth } = request;

    // 检查关键API
    if (url === '/api/config') {
      if (statusCode === 200) {
        Logger.info(`🍎 [行为分析] ✅ 配置API成功 - iOS App应能获取HA基本信息`);
      } else {
        Logger.error(`🍎 [行为分析] ❌ 配置API失败(${statusCode}) - iOS App可能无法正常工作`);
        this.sessionData.issues.push(`配置API返回${statusCode}`);
      }
    }

    if (url === '/api/states') {
      if (statusCode === 200) {
        Logger.info(`🍎 [行为分析] ✅ 状态API成功 - iOS App应能看到实体`);
      } else {
        Logger.error(`🍎 [行为分析] ❌ 状态API失败(${statusCode}) - iOS App看不到实体`);
        this.sessionData.issues.push(`状态API返回${statusCode}`);
      }
    }

    // 检查时间间隔
    if (timeSinceOAuth && timeSinceOAuth > 30000) { // 30秒
      Logger.warn(`🍎 [行为分析] ⚠️ OAuth后${Math.round(timeSinceOAuth/1000)}秒才发起API请求`);
      this.sessionData.issues.push(`API请求延迟${Math.round(timeSinceOAuth/1000)}秒`);
    }

    if (timeSinceWebSocketAuth && timeSinceWebSocketAuth > 10000) { // 10秒
      Logger.warn(`🍎 [行为分析] ⚠️ WebSocket认证后${Math.round(timeSinceWebSocketAuth/1000)}秒才发起API请求`);
    }
  }

  /**
   * 生成行为分析报告
   */
  generateReport() {
    Logger.info(`📊 [行为分析] *** iOS App行为分析报告 ***`);
    
    const now = Date.now();
    const session = this.sessionData;

    // 时间线分析
    if (session.oauthStartTime) {
      Logger.info(`📊 [时间线] OAuth开始: ${new Date(session.oauthStartTime).toISOString()}`);
    }
    if (session.oauthCompleteTime) {
      Logger.info(`📊 [时间线] OAuth完成: ${new Date(session.oauthCompleteTime).toISOString()}`);
      const oauthDuration = session.oauthCompleteTime - session.oauthStartTime;
      Logger.info(`📊 [时间线] OAuth耗时: ${oauthDuration}ms`);
    }
    if (session.websocketConnectTime) {
      Logger.info(`📊 [时间线] WebSocket连接: ${new Date(session.websocketConnectTime).toISOString()}`);
    }
    if (session.websocketAuthTime) {
      Logger.info(`📊 [时间线] WebSocket认证: ${new Date(session.websocketAuthTime).toISOString()}`);
    }
    if (session.firstAPIRequestTime) {
      Logger.info(`📊 [时间线] 首个API请求: ${new Date(session.firstAPIRequestTime).toISOString()}`);
      const delay = session.firstAPIRequestTime - session.oauthCompleteTime;
      Logger.info(`📊 [时间线] API请求延迟: ${delay}ms`);
    } else {
      Logger.error(`📊 [时间线] ❌ 至今未发起HA API请求!`);
    }

    // API请求统计
    Logger.info(`📊 [API统计] 总请求数: ${session.apiRequests.length}`);
    
    const apiTypes = {};
    session.apiRequests.forEach(req => {
      const type = this.categorizeAPI(req.url);
      apiTypes[type] = (apiTypes[type] || 0) + 1;
    });
    
    Object.entries(apiTypes).forEach(([type, count]) => {
      Logger.info(`📊 [API统计] ${type}: ${count}次`);
    });

    // 关键API检查
    const hasConfig = session.apiRequests.some(req => req.url === '/api/config');
    const hasStates = session.apiRequests.some(req => req.url === '/api/states');
    const hasServices = session.apiRequests.some(req => req.url === '/api/services');

    Logger.info(`📊 [关键API] 配置API: ${hasConfig ? '✅' : '❌'}`);
    Logger.info(`📊 [关键API] 状态API: ${hasStates ? '✅' : '❌'}`);
    Logger.info(`📊 [关键API] 服务API: ${hasServices ? '✅' : '❌'}`);

    // 问题总结
    if (session.issues.length > 0) {
      Logger.error(`📊 [问题] 发现${session.issues.length}个问题:`);
      session.issues.forEach((issue, index) => {
        Logger.error(`📊 [问题] ${index + 1}. ${issue}`);
      });
    } else {
      Logger.info(`📊 [问题] ✅ 未发现明显问题`);
    }

    // 诊断建议
    this.generateDiagnosticAdvice();

    Logger.info(`📊 [行为分析] *** 报告结束 ***`);
  }

  /**
   * 分类API请求
   */
  categorizeAPI(url) {
    if (url.includes('/api/config')) return 'HA配置';
    if (url.includes('/api/states')) return 'HA状态';
    if (url.includes('/api/services')) return 'HA服务';
    if (url.includes('/api/')) return 'HA-API';
    if (url === '/') return '主页';
    if (url.includes('/frontend_')) return '前端资源';
    if (url.includes('/static/')) return '静态资源';
    if (url.includes('/manifest.json')) return '应用清单';
    return '其他';
  }

  /**
   * 生成诊断建议
   */
  generateDiagnosticAdvice() {
    const session = this.sessionData;
    
    Logger.info(`💡 [诊断建议] *** 根据行为模式的建议 ***`);

    // 检查是否有OAuth但无API请求
    if (session.oauthCompleteTime && !session.firstAPIRequestTime) {
      const timeSinceOAuth = Date.now() - session.oauthCompleteTime;
      if (timeSinceOAuth > 15000) { // 15秒
        Logger.error(`💡 [诊断建议] ❌ OAuth完成${Math.round(timeSinceOAuth/1000)}秒后仍无API请求`);
        Logger.error(`💡 [诊断建议] 建议：检查iOS Console日志、重装App、检查证书`);
      }
    }

    // 检查API请求模式
    const apiRequests = session.apiRequests.filter(req => req.url.includes('/api/'));
    if (apiRequests.length === 0 && session.websocketAuthTime) {
      Logger.error(`💡 [诊断建议] ❌ WebSocket认证成功但无HTTP API请求`);
      Logger.error(`💡 [诊断建议] 这不是正常的iOS App行为模式`);
      Logger.error(`💡 [诊断建议] 建议：检查CORS策略、App内部状态、网络权限`);
    }

    // 检查关键API缺失
    const hasConfig = session.apiRequests.some(req => req.url === '/api/config');
    if (!hasConfig && session.apiRequests.length > 0) {
      Logger.warn(`💡 [诊断建议] ⚠️ 缺少关键的配置API请求`);
      Logger.warn(`💡 [诊断建议] iOS App可能无法正确初始化`);
    }

    Logger.info(`💡 [诊断建议] *** 建议结束 ***`);
  }

  /**
   * 重置分析器
   */
  reset() {
    this.sessionData = {
      oauthStartTime: null,
      oauthCompleteTime: null,
      websocketConnectTime: null,
      websocketAuthTime: null,
      firstAPIRequestTime: null,
      apiRequests: [],
      issues: []
    };
    Logger.info(`🍎 [行为分析] 分析器已重置`);
  }
}

module.exports = IOSBehaviorAnalyzer;
