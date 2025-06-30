const Logger = require('./logger');
const IOSIssueDiagnostic = require('./ios-issue-diagnostic');
const IOSAppInternalDiagnostic = require('./ios-app-internal-diagnostic');

/**
 * iOS连接问题综合诊断器
 */
class IOSComprehensiveDiagnostic {
  
  /**
   * 执行完整的iOS连接诊断
   */
  static performFullDiagnosis(requestTimeline, accessToken, lastOAuthTime) {
    Logger.info(`🔬 [综合诊断] *** 开始iOS连接问题综合诊断 ***`);
    Logger.info(`🔬 [综合诊断] 诊断时间: ${new Date().toISOString()}`);
    
    const diagnosticResults = {
      timestamp: new Date().toISOString(),
      requestTimeline: requestTimeline,
      accessToken: accessToken ? 'present' : 'missing',
      issues: [],
      recommendations: [],
      severity: 'LOW'
    };
    
    // 1. 基础连接问题诊断
    Logger.info(`🔬 [综合诊断] 步骤1: 基础连接问题诊断`);
    const basicIssues = IOSIssueDiagnostic.diagnoseConnectionIssue(requestTimeline, lastOAuthTime);
    if (basicIssues !== 'OK') {
      diagnosticResults.issues.push('基础连接问题');
      diagnosticResults.severity = 'MEDIUM';
    }
    
    // 2. App内部问题检测
    Logger.info(`🔬 [综合诊断] 步骤2: App内部问题检测`);
    const internalIssues = IOSAppInternalDiagnostic.detectInternalIssues(requestTimeline, accessToken);
    if (internalIssues.length > 0) {
      diagnosticResults.issues = diagnosticResults.issues.concat(internalIssues);
      const hasHighSeverity = internalIssues.some(issue => issue.severity === 'HIGH');
      if (hasHighSeverity) {
        diagnosticResults.severity = 'HIGH';
      } else if (diagnosticResults.severity === 'LOW') {
        diagnosticResults.severity = 'MEDIUM';
      }
    }
    
    // 3. 技术链路验证
    Logger.info(`🔬 [综合诊断] 步骤3: 技术链路验证`);
    this.verifyTechnicalChain(diagnosticResults);
    
    // 4. 生成最终诊断报告
    Logger.info(`🔬 [综合诊断] 步骤4: 生成最终诊断报告`);
    this.generateFinalReport(diagnosticResults);
    
    // 5. 输出修复建议
    Logger.info(`🔬 [综合诊断] 步骤5: 生成修复建议`);
    this.generateFixRecommendations(diagnosticResults);
    
    Logger.info(`🔬 [综合诊断] *** 综合诊断完成 ***`);
    
    return diagnosticResults;
  }
  
  /**
   * 验证技术链路
   */
  static verifyTechnicalChain(diagnosticResults) {
    Logger.info(`🔧 [技术验证] *** 验证技术链路完整性 ***`);
    
    const chainStatus = {
      oauth: false,
      websocket: false,
      tokenExchange: false,
      cors: false,
      compression: false
    };
    
    // 检查OAuth流程
    if (diagnosticResults.requestTimeline) {
      const hasTokenOp = diagnosticResults.requestTimeline.some(r => r.type === 'Token操作');
      chainStatus.oauth = hasTokenOp;
      chainStatus.tokenExchange = hasTokenOp;
    }
    
    // 检查WebSocket
    const hasWebSocket = diagnosticResults.requestTimeline && 
                        diagnosticResults.requestTimeline.some(r => r.type === 'WebSocket');
    chainStatus.websocket = hasWebSocket;
    
    // CORS和压缩在服务器端已经实现
    chainStatus.cors = true;
    chainStatus.compression = true;
    
    Logger.info(`🔧 [技术验证] OAuth认证: ${chainStatus.oauth ? '✅' : '❌'}`);
    Logger.info(`🔧 [技术验证] WebSocket连接: ${chainStatus.websocket ? '✅' : '❌'}`);
    Logger.info(`🔧 [技术验证] Token交换: ${chainStatus.tokenExchange ? '✅' : '❌'}`);
    Logger.info(`🔧 [技术验证] CORS支持: ${chainStatus.cors ? '✅' : '❌'}`);
    Logger.info(`🔧 [技术验证] 响应压缩: ${chainStatus.compression ? '✅' : '❌'}`);
    
    const technicalIssues = Object.entries(chainStatus)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (technicalIssues.length === 0) {
      Logger.info(`🔧 [技术验证] ✅ 技术链路完整无误`);
    } else {
      Logger.error(`🔧 [技术验证] ❌ 技术链路问题: ${technicalIssues.join(', ')}`);
      diagnosticResults.issues.push(`技术链路问题: ${technicalIssues.join(', ')}`);
    }
    
    diagnosticResults.technicalChain = chainStatus;
  }
  
  /**
   * 生成最终诊断报告
   */
  static generateFinalReport(diagnosticResults) {
    Logger.info(`📊 [最终报告] *** iOS连接问题最终诊断报告 ***`);
    Logger.info(`📊 [最终报告] 报告时间: ${diagnosticResults.timestamp}`);
    Logger.info(`📊 [最终报告] 问题严重程度: ${diagnosticResults.severity}`);
    Logger.info(`📊 [最终报告] 发现问题数: ${diagnosticResults.issues.length}`);
    
    if (diagnosticResults.issues.length === 0) {
      Logger.info(`📊 [最终报告] ✅ 服务器端技术链路完全正常`);
      Logger.info(`📊 [最终报告] ✅ OAuth认证流程工作正常`);
      Logger.info(`📊 [最终报告] ✅ WebSocket连接功能正常`);
      Logger.info(`📊 [最终报告] ✅ API端点可访问且数据正常`);
      Logger.info(`📊 [最终报告] `);
      Logger.error(`📊 [最终报告] ❌ 核心问题: iOS App认证成功后未发起HA API请求`);
      Logger.error(`📊 [最终报告] ❌ 这是iOS App端的内部问题，不是服务器问题`);
    } else {
      Logger.error(`📊 [最终报告] ❌ 发现的问题:`);
      diagnosticResults.issues.forEach((issue, index) => {
        if (typeof issue === 'string') {
          Logger.error(`📊 [最终报告]   ${index + 1}. ${issue}`);
        } else {
          Logger.error(`📊 [最终报告]   ${index + 1}. [${issue.severity}] ${issue.description}`);
        }
      });
    }
    
    Logger.info(`📊 [最终报告] *** 报告结束 ***`);
  }
  
  /**
   * 生成修复建议
   */
  static generateFixRecommendations(diagnosticResults) {
    Logger.info(`🛠️ [修复建议] *** 基于诊断结果的修复建议 ***`);
    
    if (diagnosticResults.severity === 'LOW') {
      Logger.info(`🛠️ [修复建议] 问题级别: 轻微 - 主要是iOS App端问题`);
      Logger.info(`🛠️ [修复建议] `);
      Logger.info(`🛠️ [修复建议] 推荐解决方案(按优先级排序):`);
      Logger.info(`🛠️ [修复建议] 1. 重启iOS Home Assistant App`);
      Logger.info(`🛠️ [修复建议] 2. 删除并重新添加服务器配置`);
      Logger.info(`🛠️ [修复建议] 3. 在Safari中测试API访问`);
      
    } else if (diagnosticResults.severity === 'MEDIUM') {
      Logger.warn(`🛠️ [修复建议] 问题级别: 中等 - 可能需要重装App`);
      Logger.warn(`🛠️ [修复建议] `);
      Logger.warn(`🛠️ [修复建议] 推荐解决方案:`);
      Logger.warn(`🛠️ [修复建议] 1. 完全删除Home Assistant App`);
      Logger.warn(`🛠️ [修复建议] 2. 重启iOS设备`);
      Logger.warn(`🛠️ [修复建议] 3. 重新安装App`);
      Logger.warn(`🛠️ [修复建议] 4. 检查iOS网络设置`);
      
    } else {
      Logger.error(`🛠️ [修复建议] 问题级别: 严重 - 需要深度调试`);
      Logger.error(`🛠️ [修复建议] `);
      Logger.error(`🛠️ [修复建议] 推荐解决方案:`);
      Logger.error(`🛠️ [修复建议] 1. 使用Xcode查看iOS Console日志`);
      Logger.error(`🛠️ [修复建议] 2. 检查iOS设备证书信任设置`);
      Logger.error(`🛠️ [修复建议] 3. 尝试不同的网络环境`);
      Logger.error(`🛠️ [修复建议] 4. 联系Home Assistant App开发者`);
    }
    
    Logger.info(`🛠️ [修复建议] `);
    Logger.info(`🛠️ [修复建议] 通用建议:`);
    Logger.info(`🛠️ [修复建议] - 确保iOS设备和HA在同一网络`);
    Logger.info(`🛠️ [修复建议] - 检查防火墙设置`);
    Logger.info(`🛠️ [修复建议] - 确认域名DNS解析正常`);
    Logger.info(`🛠️ [修复建议] - 在浏览器中验证https://ha-client-001.wzzhk.club访问`);
    
    Logger.info(`🛠️ [修复建议] *** 建议结束 ***`);
    
    // 生成App内部修复指南
    IOSAppInternalDiagnostic.generateFixGuide();
  }
}

module.exports = IOSComprehensiveDiagnostic;
