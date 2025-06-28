/**
 * iOS WebSocket 调试日志记录器
 * 专门用于记录和分析iOS WebSocket连接问题
 */

const Logger = require('./logger')

class iOSWebSocketDebugLogger {
  constructor() {
    this.connectionAttempts = new Map()
    this.errorPatterns = new Map()
  }

  /**
   * 记录iOS WebSocket连接尝试
   */
  logConnectionAttempt(upgradeId, hostname, headers, userAgent) {
    const attempt = {
      upgradeId,
      hostname,
      timestamp: Date.now(),
      userAgent: userAgent || headers['user-agent'] || 'Unknown',
      isIOSClient: this.detectiOSClient(userAgent || headers['user-agent']),
      headers: { ...headers }
    }

    this.connectionAttempts.set(upgradeId, attempt)

    Logger.info(`🔍 [iOS Debug] WebSocket连接尝试:`)
    Logger.info(`   ID: ${upgradeId}`)
    Logger.info(`   Host: ${hostname}`)
    Logger.info(`   User-Agent: ${attempt.userAgent}`)
    Logger.info(`   iOS客户端: ${attempt.isIOSClient ? '是' : '否'}`)
    Logger.info(`   关键头信息:`)
    Logger.info(`     Sec-WebSocket-Key: ${headers['sec-websocket-key'] || '缺失'}`)
    Logger.info(`     Sec-WebSocket-Version: ${headers['sec-websocket-version'] || '缺失'}`)
    Logger.info(`     Origin: ${headers['origin'] || '缺失'}`)
    Logger.info(`     Connection: ${headers['connection'] || '缺失'}`)
    Logger.info(`     Upgrade: ${headers['upgrade'] || '缺失'}`)

    return attempt
  }

  /**
   * 记录WebSocket连接结果
   */
  logConnectionResult(upgradeId, success, error, statusCode) {
    const attempt = this.connectionAttempts.get(upgradeId)
    if (!attempt) {
      Logger.warn(`[iOS Debug] 未找到连接尝试记录: ${upgradeId}`)
      return
    }

    attempt.success = success
    attempt.error = error
    attempt.statusCode = statusCode
    attempt.duration = Date.now() - attempt.timestamp

    if (success) {
      Logger.info(`✅ [iOS Debug] WebSocket连接成功: ${upgradeId}`)
      Logger.info(`   耗时: ${attempt.duration}ms`)
    } else {
      Logger.error(`❌ [iOS Debug] WebSocket连接失败: ${upgradeId}`)
      Logger.error(`   耗时: ${attempt.duration}ms`)
      Logger.error(`   状态码: ${statusCode || '无'}`)
      Logger.error(`   错误: ${error || '未知错误'}`)

      // 分析错误模式
      this.analyzeErrorPattern(attempt, error)
    }
  }

  /**
   * 检测是否为iOS客户端
   */
  detectiOSClient(userAgent) {
    if (!userAgent) return false
    
    const userAgentLower = userAgent.toLowerCase()
    return userAgentLower.includes('ios') ||
           userAgentLower.includes('iphone') ||
           userAgentLower.includes('ipad') ||
           userAgentLower.includes('safari') ||
           userAgentLower.includes('starscream') ||
           userAgentLower.includes('mobile/')
  }

  /**
   * 分析错误模式
   */
  analyzeErrorPattern(attempt, error) {
    const errorKey = this.categorizeError(error)
    
    if (!this.errorPatterns.has(errorKey)) {
      this.errorPatterns.set(errorKey, {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        examples: []
      })
    }

    const pattern = this.errorPatterns.get(errorKey)
    pattern.count++
    pattern.lastSeen = Date.now()
    
    if (pattern.examples.length < 3) {
      pattern.examples.push({
        upgradeId: attempt.upgradeId,
        userAgent: attempt.userAgent,
        timestamp: attempt.timestamp,
        error: error
      })
    }

    Logger.warn(`📊 [iOS Debug] 错误模式统计: ${errorKey} (出现 ${pattern.count} 次)`)

    // 提供针对性建议
    this.provideTroubleshootingSuggestion(errorKey, attempt)
  }

  /**
   * 错误分类
   */
  categorizeError(error) {
    if (!error) return 'UNKNOWN_ERROR'
    
    const errorMsg = error.toLowerCase()
    
    if (errorMsg.includes('timeout')) return 'TIMEOUT_ERROR'
    if (errorMsg.includes('econnrefused')) return 'CONNECTION_REFUSED'
    if (errorMsg.includes('ehostunreach')) return 'HOST_UNREACHABLE'
    if (errorMsg.includes('enotfound')) return 'DNS_ERROR'
    if (errorMsg.includes('certificate') || errorMsg.includes('ssl')) return 'SSL_ERROR'
    if (errorMsg.includes('starscream')) return 'STARSCREAM_ERROR'
    if (errorMsg.includes('sec-websocket-extensions') || errorMsg.includes('extension')) return 'WEBSOCKET_EXTENSION_ERROR'
    if (errorMsg.includes('websocket')) return 'WEBSOCKET_PROTOCOL_ERROR'
    
    return 'GENERAL_ERROR'
  }

  /**
   * 提供故障排除建议
   */
  provideTroubleshootingSuggestion(errorKey, attempt) {
    const suggestions = {
      'TIMEOUT_ERROR': [
        '检查网络连接稳定性',
        '增加WebSocket连接超时时间',
        '确认Home Assistant服务运行正常'
      ],
      'CONNECTION_REFUSED': [
        '检查Home Assistant是否在指定端口运行',
        '确认防火墙设置允许WebSocket连接',
        '验证代理配置是否正确'
      ],
      'STARSCREAM_ERROR': [
        '使用iOS兼容的WebSocket头信息',
        '确保Sec-WebSocket-Version为13',
        '检查Origin头是否正确设置'
      ],
      'SSL_ERROR': [
        '检查SSL证书配置',
        '确认HTTPS/WSS协议设置正确',
        '验证证书链完整性'
      ],
      'WEBSOCKET_EXTENSION_ERROR': [
        '禁用WebSocket扩展协商（permessage-deflate等）',
        '确保客户端和服务器扩展协商一致',
        '移除Sec-WebSocket-Extensions头以使用基本WebSocket'
      ],
      'WEBSOCKET_PROTOCOL_ERROR': [
        '检查WebSocket协议版本兼容性',
        '确认Upgrade和Connection头正确设置',
        '验证Sec-WebSocket-Accept计算是否正确'
      ]
    }

    const suggestionList = suggestions[errorKey] || ['联系技术支持获取帮助']
    
    Logger.info(`💡 [iOS Debug] 故障排除建议 (${errorKey}):`)
    suggestionList.forEach((suggestion, index) => {
      Logger.info(`   ${index + 1}. ${suggestion}`)
    })
  }

  /**
   * 生成连接统计报告
   */
  generateConnectionReport() {
    const totalAttempts = this.connectionAttempts.size
    const successfulConnections = Array.from(this.connectionAttempts.values())
      .filter(attempt => attempt.success).length
    const iOSAttempts = Array.from(this.connectionAttempts.values())
      .filter(attempt => attempt.isIOSClient).length

    Logger.info(`📊 [iOS Debug] WebSocket连接统计报告:`)
    Logger.info(`   总连接尝试: ${totalAttempts}`)
    Logger.info(`   成功连接: ${successfulConnections}`)
    Logger.info(`   iOS客户端: ${iOSAttempts}`)
    Logger.info(`   成功率: ${totalAttempts > 0 ? ((successfulConnections / totalAttempts) * 100).toFixed(1) : 0}%`)

    if (this.errorPatterns.size > 0) {
      Logger.info(`   错误模式 (${this.errorPatterns.size} 种):`)
      Array.from(this.errorPatterns.entries()).forEach(([errorKey, pattern]) => {
        Logger.info(`     ${errorKey}: ${pattern.count} 次`)
      })
    }
  }

  /**
   * 清理旧的连接记录
   */
  cleanup(maxAge = 300000) { // 5分钟
    const now = Date.now()
    
    for (const [upgradeId, attempt] of this.connectionAttempts.entries()) {
      if (now - attempt.timestamp > maxAge) {
        this.connectionAttempts.delete(upgradeId)
      }
    }
  }
}

// 创建全局实例
const iOSDebugLogger = new iOSWebSocketDebugLogger()

// 定期清理和生成报告
setInterval(() => {
  iOSDebugLogger.cleanup()
  if (iOSDebugLogger.connectionAttempts.size > 0) {
    iOSDebugLogger.generateConnectionReport()
  }
}, 300000) // 每5分钟

module.exports = iOSDebugLogger
