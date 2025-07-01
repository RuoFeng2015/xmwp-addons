const Logger = require('./logger');

/**
 * iOS App 重复服务器检测修复器
 * 专门处理 OnboardingAuthStepDuplicate 失败和 invalidURL 错误
 */
class IOSDuplicateServerFix {
  constructor() {
    this.detectedIssues = {
      duplicateServerError: false,
      invalidURLError: false,
      oauthStepFailure: false
    };
  }

  /**
   * 检测是否有重复服务器问题的迹象
   */
  detectDuplicateIssues(requests) {
    Logger.info(`🔍 [重复服务器] *** 开始检测iOS重复服务器问题 ***`);
    
    // 分析请求模式
    const tokenRevokes = requests.filter(req => 
      req.url === '/auth/token' && req.method === 'POST'
    );
    
    const loginFlows = requests.filter(req => 
      req.url.includes('/auth/login_flow')
    );

    // 检测异常模式
    if (tokenRevokes.length > 1) {
      Logger.warn(`🔍 [重复服务器] 检测到多次token撤销: ${tokenRevokes.length}次`);
      this.detectedIssues.duplicateServerError = true;
    }

    if (loginFlows.length > 0 && tokenRevokes.length > 0) {
      const lastLogin = Math.max(...loginFlows.map(r => r.timestamp || 0));
      const lastRevoke = Math.max(...tokenRevokes.map(r => r.timestamp || 0));
      
      if (lastRevoke > lastLogin) {
        Logger.error(`🔍 [重复服务器] ❌ 检测到OAuth后立即撤销token的异常模式`);
        Logger.error(`🔍 [重复服务器] 这表明iOS App认为服务器已存在或URL无效`);
        this.detectedIssues.oauthStepFailure = true;
      }
    }

    return this.detectedIssues;
  }

  /**
   * 生成修复建议
   */
  generateFixRecommendations() {
    Logger.info(`🛠️ [重复服务器修复] *** iOS重复服务器问题修复建议 ***`);
    
    if (this.detectedIssues.oauthStepFailure || this.detectedIssues.duplicateServerError) {
      Logger.error(`🛠️ [重复服务器修复] 发现重复服务器检测问题!`);
      Logger.info(`🛠️ [重复服务器修复] `);
      Logger.info(`🛠️ [重复服务器修复] 🎯 立即解决方案:`);
      Logger.info(`🛠️ [重复服务器修复] 1. 完全删除Home Assistant App中的所有服务器`);
      Logger.info(`🛠️ [重复服务器修复] 2. 清除App数据:`);
      Logger.info(`🛠️ [重复服务器修复]    - iOS设置 > Home Assistant > 卸载App`);
      Logger.info(`🛠️ [重复服务器修复]    - 重启iPhone`);
      Logger.info(`🛠️ [重复服务器修复]    - 重新安装App`);
      Logger.info(`🛠️ [重复服务器修复] `);
      Logger.info(`🛠️ [重复服务器修复] 🔧 URL配置检查:`);
      Logger.info(`🛠️ [重复服务器修复] 1. 确保使用完整URL: https://ha-client-001.wzzhk.club`);
      Logger.info(`🛠️ [重复服务器修复] 2. 不要添加端口号或路径`);
      Logger.info(`🛠️ [重复服务器修复] 3. 确保域名可以在Safari中正常访问`);
      Logger.info(`🛠️ [重复服务器修复] `);
      Logger.info(`🛠️ [重复服务器修复] 🌐 网络和证书:`);
      Logger.info(`🛠️ [重复服务器修复] 1. 在Safari中访问: https://ha-client-001.wzzhk.club`);
      Logger.info(`🛠️ [重复服务器修复] 2. 如果有证书警告，点击"高级">"继续访问"`);
      Logger.info(`🛠️ [重复服务器修复] 3. 在iOS设置中信任证书:`);
      Logger.info(`🛠️ [重复服务器修复]    设置 > 通用 > 关于本机 > 证书信任设置`);
      Logger.info(`🛠️ [重复服务器修复] `);
      Logger.info(`🛠️ [重复服务器修复] 🔄 重新添加步骤:`);
      Logger.info(`🛠️ [重复服务器修复] 1. 打开Home Assistant App`);
      Logger.info(`🛠️ [重复服务器修复] 2. 选择"手动输入地址"`);
      Logger.info(`🛠️ [重复服务器修复] 3. 输入: https://ha-client-001.wzzhk.club`);
      Logger.info(`🛠️ [重复服务器修复] 4. 点击"连接"`);
      Logger.info(`🛠️ [重复服务器修复] 5. 如果失败，重复以上步骤`);
      Logger.info(`🛠️ [重复服务器修复] `);
      Logger.info(`🛠️ [重复服务器修复] ⚠️ 如果问题持续:`);
      Logger.info(`🛠️ [重复服务器修复] 1. 尝试使用不同的网络(移动数据)`);
      Logger.info(`🛠️ [重复服务器修复] 2. 重启iPhone`);
      Logger.info(`🛠️ [重复服务器修复] 3. 检查iOS版本是否过旧`);
      Logger.info(`🛠️ [重复服务器修复] 4. 联系技术支持并提供日志`);
    } else {
      Logger.info(`🛠️ [重复服务器修复] 未检测到重复服务器问题`);
    }
    
    Logger.info(`🛠️ [重复服务器修复] *** 修复建议结束 ***`);
  }

  /**
   * 执行完整的诊断和修复建议
   */
  performFullDiagnosis(requests) {
    const issues = this.detectDuplicateIssues(requests || []);
    this.generateFixRecommendations();
    return issues;
  }

  /**
   * 重置检测状态
   */
  reset() {
    this.detectedIssues = {
      duplicateServerError: false,
      invalidURLError: false,
      oauthStepFailure: false
    };
  }
}

module.exports = IOSDuplicateServerFix;
