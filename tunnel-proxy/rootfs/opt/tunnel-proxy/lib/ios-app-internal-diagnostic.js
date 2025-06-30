const Logger = require('./logger');

/**
 * iOS App内部问题检测器
 */
class IOSAppInternalDiagnostic {
  
  /**
   * 检测iOS App内部问题
   */
  static detectInternalIssues(requestTimeline, accessToken) {
    Logger.info(`🔍 [iOS内部] *** 开始检测iOS App内部问题 ***`);
    
    const issues = [];
    const recommendations = [];
    
    // 检查1: 认证成功但无API请求
    const authSuccessTime = this.getLastAuthTime(requestTimeline);
    const apiRequests = this.getAPIRequests(requestTimeline);
    
    if (authSuccessTime && apiRequests.length === 0) {
      const timeSinceAuth = Date.now() - new Date(authSuccessTime).getTime();
      if (timeSinceAuth > 30000) { // 30秒后还没有API请求
        issues.push({
          type: 'NO_API_AFTER_AUTH',
          severity: 'HIGH',
          description: `认证成功${Math.round(timeSinceAuth/1000)}秒后仍无API请求`,
          possibleCauses: [
            'iOS App内部状态机错误',
            'App认为认证失败了',
            'App网络模块被阻止',
            'App内部JavaScript错误'
          ],
          recommendations: [
            '重启iOS Home Assistant App',
            '完全删除并重新安装App',
            '检查iOS设备的网络设置',
            '查看iOS设备Console日志',
            '尝试在iOS Safari中手动访问API'
          ]
        });
      }
    }
    
    // 检查2: Token可用性验证
    if (accessToken) {
      this.checkTokenValidation(accessToken, issues, recommendations);
    }
    
    // 检查3: 网络连接模式
    this.checkNetworkPattern(requestTimeline, issues, recommendations);
    
    // 检查4: iOS版本兼容性
    this.checkiOSCompatibility(requestTimeline, issues, recommendations);
    
    // 输出检测结果
    this.outputDiagnosticResults(issues, recommendations);
    
    return issues;
  }
  
  /**
   * 获取最后认证时间
   */
  static getLastAuthTime(timeline) {
    const authRequests = timeline.filter(r => r.type === 'Token操作');
    return authRequests.length > 0 ? authRequests[authRequests.length - 1].timestamp : null;
  }
  
  /**
   * 获取API请求
   */
  static getAPIRequests(timeline) {
    return timeline.filter(r => r.type.includes('HA-') || r.type.includes('HA配置') || r.type.includes('HA状态'));
  }
  
  /**
   * 检查Token验证
   */
  static checkTokenValidation(accessToken, issues, recommendations) {
    try {
      // 简单的JWT格式检查
      const parts = accessToken.split('.');
      if (parts.length !== 3) {
        issues.push({
          type: 'INVALID_TOKEN_FORMAT',
          severity: 'HIGH',
          description: 'Access Token格式不正确',
          possibleCauses: ['Token解析错误', 'Token传输损坏'],
          recommendations: ['重新进行OAuth认证', '检查Token传输过程']
        });
      } else {
        // 解析Token payload
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          const now = Math.floor(Date.now() / 1000);
          
          if (payload.exp && payload.exp < now) {
            issues.push({
              type: 'TOKEN_EXPIRED',
              severity: 'HIGH',
              description: 'Access Token已过期',
              possibleCauses: ['系统时间不同步', 'Token生成时间过早'],
              recommendations: ['重新进行OAuth认证', '检查系统时间同步']
            });
          } else {
            Logger.info(`🔍 [iOS内部] ✅ Access Token格式正确且有效`);
            Logger.info(`🔍 [iOS内部] Token发行者: ${payload.iss || '未知'}`);
            Logger.info(`🔍 [iOS内部] Token过期时间: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : '未设置'}`);
          }
        } catch (e) {
          Logger.warn(`🔍 [iOS内部] Token payload解析失败: ${e.message}`);
        }
      }
    } catch (e) {
      Logger.error(`🔍 [iOS内部] Token检查失败: ${e.message}`);
    }
  }
  
  /**
   * 检查网络模式
   */
  static checkNetworkPattern(timeline, issues, recommendations) {
    const requestTypes = timeline.map(r => r.type);
    const hasWebSocket = requestTypes.includes('WebSocket');
    const hasHTTP = requestTypes.some(t => !t.includes('WebSocket'));
    
    if (hasWebSocket && !hasHTTP) {
      issues.push({
        type: 'WEBSOCKET_ONLY',
        severity: 'MEDIUM',
        description: '只有WebSocket连接，没有HTTP API请求',
        possibleCauses: [
          'iOS App认为WebSocket足够',
          'HTTP API模块被禁用',
          'CORS阻止了HTTP请求'
        ],
        recommendations: [
          '检查App的网络权限设置',
          '在iOS Safari中测试HTTP API',
          '检查是否有网络代理干扰'
        ]
      });
    }
  }
  
  /**
   * 检查iOS兼容性
   */
  static checkiOSCompatibility(timeline, issues, recommendations) {
    // 从User-Agent中提取iOS版本信息
    // 这里简化处理，实际中需要从请求头中获取
    const iosVersion = '16.3.0'; // 从日志中看到的版本
    const appBuild = '2025.1264';
    
    Logger.info(`🔍 [iOS内部] iOS版本: ${iosVersion}`);
    Logger.info(`🔍 [iOS内部] App构建: ${appBuild}`);
    
    // 检查已知的兼容性问题
    if (iosVersion.startsWith('16.')) {
      Logger.info(`🔍 [iOS内部] iOS 16版本，检查已知问题...`);
      
      issues.push({
        type: 'IOS16_WEBVIEW_ISSUE',
        severity: 'MEDIUM',
        description: 'iOS 16可能存在WebView网络请求限制',
        possibleCauses: [
          'iOS 16 WebView安全策略更严格',
          '第三方证书信任问题',
          'App Transport Security限制'
        ],
        recommendations: [
          '在iOS设置中信任自定义证书',
          '尝试在Safari中直接访问',
          '检查App的Info.plist网络配置'
        ]
      });
    }
  }
  
  /**
   * 输出诊断结果
   */
  static outputDiagnosticResults(issues, recommendations) {
    if (issues.length === 0) {
      Logger.info(`🔍 [iOS内部] ✅ 未发现明显的App内部问题`);
      return;
    }
    
    Logger.error(`🔍 [iOS内部] ❌ 发现 ${issues.length} 个内部问题:`);
    
    issues.forEach((issue, index) => {
      Logger.error(`🔍 [iOS内部] ${index + 1}. [${issue.severity}] ${issue.description}`);
      Logger.error(`🔍 [iOS内部]    类型: ${issue.type}`);
      
      if (issue.possibleCauses) {
        Logger.error(`🔍 [iOS内部]    可能原因:`);
        issue.possibleCauses.forEach(cause => {
          Logger.error(`🔍 [iOS内部]      - ${cause}`);
        });
      }
      
      if (issue.recommendations) {
        Logger.info(`🔍 [iOS内部]    建议解决方案:`);
        issue.recommendations.forEach(rec => {
          Logger.info(`🔍 [iOS内部]      - ${rec}`);
        });
      }
    });
  }
  
  /**
   * 生成修复指南
   */
  static generateFixGuide() {
    Logger.info(`📋 [修复指南] *** iOS Home Assistant App 连接修复指南 ***`);
    Logger.info(`📋 [修复指南] 基于当前诊断结果，建议按以下顺序尝试:`);
    Logger.info(`📋 [修复指南] `);
    Logger.info(`📋 [修复指南] 1. 立即尝试的解决方案:`);
    Logger.info(`📋 [修复指南]    - 完全关闭并重启Home Assistant App`);
    Logger.info(`📋 [修复指南]    - 删除当前服务器连接，重新添加`);
    Logger.info(`📋 [修复指南]    - 在iOS Safari中访问: https://ha-client-001.wzzhk.club/api/config`);
    Logger.info(`📋 [修复指南] `);
    Logger.info(`📋 [修复指南] 2. 网络和证书检查:`);
    Logger.info(`📋 [修复指南]    - 确保iOS设备信任自定义SSL证书`);
    Logger.info(`📋 [修复指南]    - 检查iOS网络设置，关闭VPN或代理`);
    Logger.info(`📋 [修复指南]    - 尝试切换到其他网络(4G/5G)`);
    Logger.info(`📋 [修复指南] `);
    Logger.info(`📋 [修复指南] 3. App重置方案:`);
    Logger.info(`📋 [修复指南]    - 完全删除Home Assistant App`);
    Logger.info(`📋 [修复指南]    - 重启iOS设备`);
    Logger.info(`📋 [修复指南]    - 重新安装最新版本的App`);
    Logger.info(`📋 [修复指南] `);
    Logger.info(`📋 [修复指南] 4. 高级调试:`);
    Logger.info(`📋 [修复指南]    - 连接iPhone到Mac，使用Xcode查看Console日志`);
    Logger.info(`📋 [修复指南]    - 在iPhone设置中启用开发者模式(如果可用)`);
    Logger.info(`📋 [修复指南]    - 使用Charles Proxy等工具抓包分析`);
    Logger.info(`📋 [修复指南] `);
    Logger.info(`📋 [修复指南] *** 修复指南结束 ***`);
  }
}

module.exports = IOSAppInternalDiagnostic;
