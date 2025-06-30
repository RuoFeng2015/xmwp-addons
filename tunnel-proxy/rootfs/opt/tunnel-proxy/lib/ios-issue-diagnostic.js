const Logger = require('./logger');

/**
 * iOS特定问题诊断器
 */
class IOSIssueDiagnostic {
  
  /**
   * 诊断iOS连接问题
   */
  static diagnoseConnectionIssue(requestTimeline, lastOAuthTime) {
    Logger.info(`🔍 [iOS诊断] *** 开始iOS连接问题诊断 ***`);
    
    if (!requestTimeline || requestTimeline.length === 0) {
      Logger.error(`🔍 [iOS诊断] 没有记录到任何iOS请求!`);
      return 'NO_REQUESTS';
    }
    
    const issues = [];
    const recommendations = [];
    
    // 检查OAuth流程完整性
    const oauthIssue = this.checkOAuthFlow(requestTimeline);
    if (oauthIssue) {
      issues.push(oauthIssue.issue);
      recommendations.push(oauthIssue.recommendation);
    }
    
    // 检查API请求模式
    const apiIssue = this.checkAPIPattern(requestTimeline);
    if (apiIssue) {
      issues.push(apiIssue.issue);
      recommendations.push(apiIssue.recommendation);
    }
    
    // 检查时间间隔
    const timingIssue = this.checkTiming(requestTimeline, lastOAuthTime);
    if (timingIssue) {
      issues.push(timingIssue.issue);
      recommendations.push(timingIssue.recommendation);
    }
    
    // 输出诊断结果
    if (issues.length > 0) {
      Logger.error(`🔍 [iOS诊断] 发现 ${issues.length} 个问题:`);
      issues.forEach((issue, index) => {
        Logger.error(`🔍 [iOS诊断] ${index + 1}. ${issue}`);
      });
      
      Logger.info(`🔍 [iOS诊断] 建议解决方案:`);
      recommendations.forEach((rec, index) => {
        Logger.info(`🔍 [iOS诊断] ${index + 1}. ${rec}`);
      });
    } else {
      Logger.info(`🔍 [iOS诊断] ✅ 未发现明显的技术问题`);
    }
    
    return issues.length > 0 ? 'ISSUES_FOUND' : 'OK';
  }
  
  /**
   * 检查OAuth流程
   */
  static checkOAuthFlow(timeline) {
    const oauthSteps = timeline.filter(r => r.type.includes('OAuth') || r.type.includes('Token'));
    
    if (oauthSteps.length === 0) {
      return {
        issue: 'OAuth流程缺失 - 没有检测到任何OAuth相关请求',
        recommendation: '检查iOS App是否正确启动OAuth流程，可能需要重新添加服务器'
      };
    }
    
    const hasAuthorize = oauthSteps.some(s => s.url.includes('/auth/authorize'));
    const hasToken = oauthSteps.some(s => s.url.includes('/auth/token'));
    
    if (!hasAuthorize) {
      return {
        issue: 'OAuth授权步骤缺失 - 没有/auth/authorize请求',
        recommendation: '检查iOS App的OAuth配置，确保正确的授权URL'
      };
    }
    
    if (!hasToken) {
      return {
        issue: 'Token交换步骤缺失 - 没有/auth/token请求', 
        recommendation: '检查OAuth授权是否成功完成，可能需要重新授权'
      };
    }
    
    return null; // 没有问题
  }
  
  /**
   * 检查API请求模式
   */
  static checkAPIPattern(timeline) {
    const apiRequests = timeline.filter(r => r.type.includes('HA-') || r.type.includes('HA配置') || r.type.includes('HA状态'));
    const oauthSuccess = timeline.some(r => r.type === 'Token操作');
    
    if (oauthSuccess && apiRequests.length === 0) {
      return {
        issue: 'OAuth成功但无HA API请求 - iOS App未发起任何HA数据请求',
        recommendation: '可能是CORS问题、证书问题或App内部错误，建议检查iOS Console日志'
      };
    }
    
    // 检查关键API
    const hasConfig = apiRequests.some(r => r.url.includes('/api/config'));
    const hasStates = apiRequests.some(r => r.url.includes('/api/states'));
    
    if (apiRequests.length > 0 && !hasConfig) {
      return {
        issue: '缺少配置API请求 - iOS App未获取HA配置信息',
        recommendation: '检查iOS App是否有权限访问/api/config端点'
      };
    }
    
    return null;
  }
  
  /**
   * 检查时间间隔
   */
  static checkTiming(timeline, lastOAuthTime) {
    if (!lastOAuthTime) return null;
    
    const timeSinceOAuth = Date.now() - new Date(lastOAuthTime).getTime();
    const apiRequests = timeline.filter(r => r.type.includes('HA-'));
    
    if (timeSinceOAuth > 30000 && apiRequests.length === 0) { // 30秒后还没有API请求
      return {
        issue: `OAuth完成${Math.round(timeSinceOAuth/1000)}秒后仍无API请求`,
        recommendation: '这表明iOS App可能在OAuth后遇到了问题，建议重启App或检查网络连接'
      };
    }
    
    return null;
  }
  
  /**
   * 生成iOS调试报告
   */
  static generateDebugReport(timeline, issues) {
    Logger.info(`📋 [iOS报告] *** iOS连接调试报告 ***`);
    Logger.info(`📋 [iOS报告] 时间: ${new Date().toISOString()}`);
    Logger.info(`📋 [iOS报告] 请求总数: ${timeline ? timeline.length : 0}`);
    
    if (timeline && timeline.length > 0) {
      const types = [...new Set(timeline.map(r => r.type))];
      Logger.info(`📋 [iOS报告] 请求类型: ${types.join(', ')}`);
      
      const lastRequest = timeline[timeline.length - 1];
      Logger.info(`📋 [iOS报告] 最后请求: ${lastRequest.timestamp} - ${lastRequest.type}`);
    }
    
    Logger.info(`📋 [iOS报告] 问题状态: ${issues || 'OK'}`);
    Logger.info(`📋 [iOS报告] *** 报告结束 ***`);
  }
}

module.exports = IOSIssueDiagnostic;
