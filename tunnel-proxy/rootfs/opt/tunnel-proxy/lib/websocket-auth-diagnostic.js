/**
 * WebSocket认证诊断工具
 * 专门用于调试iOS Home Assistant应用的WebSocket认证问题
 */

const Logger = require('./logger')

class WebSocketAuthDiagnostic {
  constructor() {
    this.authSessions = new Map()
    this.authPatterns = new Map()
  }

  /**
   * 开始认证会话监控
   */
  startAuthSession(upgradeId, userAgent, origin) {
    const session = {
      upgradeId,
      userAgent,
      origin,
      startTime: Date.now(),
      authRequired: false,
      authSent: false,
      authResponse: null,
      messagesReceived: [],
      messagesSent: [],
      isIOSClient: this.detectiOSClient(userAgent)
    }

    this.authSessions.set(upgradeId, session)
    
    Logger.info(`🔐 [认证诊断] 开始监控认证会话: ${upgradeId}`)
    Logger.info(`   客户端: ${session.isIOSClient ? 'iOS' : '其他'}`)
    Logger.info(`   User-Agent: ${userAgent}`)
    Logger.info(`   Origin: ${origin}`)

    // 设置30秒超时监控
    setTimeout(() => {
      this.analyzeAuthSession(upgradeId)
    }, 30000)

    return session
  }

  /**
   * 记录收到auth_required消息
   */
  recordAuthRequired(upgradeId, message) {
    const session = this.authSessions.get(upgradeId)
    if (!session) return

    session.authRequired = true
    session.authRequiredTime = Date.now()
    session.messagesReceived.push({
      type: 'auth_required',
      time: Date.now(),
      content: message
    })

    Logger.info(`🔐 [认证诊断] auth_required已发送到客户端: ${upgradeId}`)
    Logger.info(`   HA版本: ${message.ha_version || '未知'}`)
  }

  /**
   * 记录从客户端收到的认证消息
   */
  recordAuthMessage(upgradeId, messageType, messageContent) {
    const session = this.authSessions.get(upgradeId)
    if (!session) return

    if (messageType === 'auth') {
      session.authSent = true
      session.authSentTime = Date.now()
    }

    session.messagesSent.push({
      type: messageType,
      time: Date.now(),
      content: messageContent
    })

    Logger.info(`🔐 [认证诊断] 收到客户端认证消息: ${upgradeId}`)
    Logger.info(`   消息类型: ${messageType}`)
    Logger.info(`   内容: ${JSON.stringify(messageContent)}`)
  }

  /**
   * 记录认证响应
   */
  recordAuthResponse(upgradeId, responseType, responseContent) {
    const session = this.authSessions.get(upgradeId)
    if (!session) return

    session.authResponse = responseType
    session.authResponseTime = Date.now()
    session.messagesReceived.push({
      type: responseType,
      time: Date.now(),
      content: responseContent
    })

    Logger.info(`🔐 [认证诊断] 收到认证响应: ${upgradeId}`)
    Logger.info(`   响应类型: ${responseType}`)
  }

  /**
   * 记录任何WebSocket消息
   */
  recordMessage(upgradeId, direction, messageType, messageContent) {
    const session = this.authSessions.get(upgradeId)
    if (!session) return

    const messageLog = {
      type: messageType,
      time: Date.now(),
      content: messageContent,
      direction: direction // 'sent' or 'received'
    }

    if (direction === 'sent') {
      session.messagesSent.push(messageLog)
    } else {
      session.messagesReceived.push(messageLog)
    }

    Logger.info(`🔐 [认证诊断] WebSocket消息: ${upgradeId}`)
    Logger.info(`   方向: ${direction === 'sent' ? '客户端->服务器' : '服务器->客户端'}`)
    Logger.info(`   类型: ${messageType}`)
  }

  /**
   * 分析认证会话
   */
  analyzeAuthSession(upgradeId) {
    const session = this.authSessions.get(upgradeId)
    if (!session) return

    const duration = Date.now() - session.startTime
    
    Logger.info(`📊 [认证诊断] 会话分析报告: ${upgradeId}`)
    Logger.info(`   持续时间: ${duration}ms`)
    Logger.info(`   客户端类型: ${session.isIOSClient ? 'iOS' : '其他'}`)
    Logger.info(`   auth_required已发送: ${session.authRequired ? '是' : '否'}`)
    Logger.info(`   客户端已发送认证: ${session.authSent ? '是' : '否'}`)
    Logger.info(`   认证响应: ${session.authResponse || '无'}`)
    Logger.info(`   收到消息数: ${session.messagesReceived.length}`)
    Logger.info(`   发送消息数: ${session.messagesSent.length}`)

    // 分析可能的问题
    this.diagnoseIssues(session)

    // 记录到模式分析中
    this.recordAuthPattern(session)
  }

  /**
   * 诊断可能的问题
   */
  diagnoseIssues(session) {
    const issues = []

    if (session.authRequired && !session.authSent) {
      issues.push('客户端收到auth_required但没有发送认证令牌')
      if (session.isIOSClient) {
        issues.push('iOS客户端可能无法发送WebSocket消息')
      }
    }

    if (session.authSent && !session.authResponse) {
      issues.push('客户端发送了认证但没有收到响应')
    }

    if (session.authSent && session.authResponse === 'auth_invalid') {
      issues.push('认证令牌无效或过期')
    }

    if (session.messagesSent.length === 0) {
      issues.push('客户端没有发送任何WebSocket消息')
      if (session.isIOSClient) {
        issues.push('iOS WebSocket发送功能可能存在问题')
      }
    }

    if (issues.length > 0) {
      Logger.warn(`⚠️ [认证诊断] 发现问题:`)
      issues.forEach((issue, index) => {
        Logger.warn(`   ${index + 1}. ${issue}`)
      })

      // 提供解决建议
      this.provideSolutions(session, issues)
    } else {
      Logger.info(`✅ [认证诊断] 没有发现明显问题`)
    }
  }

  /**
   * 提供解决建议
   */
  provideSolutions(session, issues) {
    const solutions = []

    if (issues.some(issue => issue.includes('没有发送认证令牌'))) {
      solutions.push('检查iOS应用是否能正确发送WebSocket消息')
      solutions.push('验证长期访问令牌是否正确配置')
      solutions.push('检查iOS应用的WebSocket实现')
    }

    if (issues.some(issue => issue.includes('认证令牌无效'))) {
      solutions.push('在Home Assistant中生成新的长期访问令牌')
      solutions.push('确认令牌在iOS应用中正确配置')
    }

    if (issues.some(issue => issue.includes('WebSocket消息'))) {
      solutions.push('检查代理服务器的WebSocket帧解析')
      solutions.push('验证iOS客户端的WebSocket协议实现')
    }

    if (solutions.length > 0) {
      Logger.info(`💡 [认证诊断] 建议的解决方案:`)
      solutions.forEach((solution, index) => {
        Logger.info(`   ${index + 1}. ${solution}`)
      })
    }
  }

  /**
   * 记录认证模式
   */
  recordAuthPattern(session) {
    const patternKey = `${session.isIOSClient ? 'iOS' : 'Other'}_${session.authRequired ? 'AuthReq' : 'NoAuthReq'}_${session.authSent ? 'AuthSent' : 'NoAuthSent'}_${session.authResponse || 'NoResp'}`
    
    if (!this.authPatterns.has(patternKey)) {
      this.authPatterns.set(patternKey, {
        count: 0,
        firstSeen: Date.now(),
        examples: []
      })
    }

    const pattern = this.authPatterns.get(patternKey)
    pattern.count++
    pattern.lastSeen = Date.now()

    if (pattern.examples.length < 3) {
      pattern.examples.push({
        upgradeId: session.upgradeId,
        userAgent: session.userAgent,
        timestamp: session.startTime
      })
    }

    Logger.info(`📈 [认证诊断] 模式统计: ${patternKey} (${pattern.count}次)`)
  }

  /**
   * 检测iOS客户端
   */
  detectiOSClient(userAgent) {
    if (!userAgent) return false
    
    const userAgentLower = userAgent.toLowerCase()
    return userAgentLower.includes('ios') ||
           userAgentLower.includes('iphone') ||
           userAgentLower.includes('ipad') ||
           userAgentLower.includes('home assistant') && userAgentLower.includes('ios')
  }

  /**
   * 生成认证统计报告
   */
  generateAuthReport() {
    Logger.info(`📊 [认证诊断] 整体统计报告:`)
    Logger.info(`   总会话数: ${this.authSessions.size}`)
    Logger.info(`   认证模式 (${this.authPatterns.size}种):`)

    Array.from(this.authPatterns.entries()).forEach(([pattern, data]) => {
      Logger.info(`     ${pattern}: ${data.count}次`)
    })
  }

  /**
   * 清理过期会话
   */
  cleanup() {
    const now = Date.now()
    const maxAge = 300000 // 5分钟

    for (const [upgradeId, session] of this.authSessions.entries()) {
      if (now - session.startTime > maxAge) {
        this.authSessions.delete(upgradeId)
      }
    }
  }
}

// 创建全局实例
const authDiagnostic = new WebSocketAuthDiagnostic()

// 定期清理和生成报告
setInterval(() => {
  authDiagnostic.cleanup()
  if (authDiagnostic.authSessions.size > 0) {
    authDiagnostic.generateAuthReport()
  }
}, 300000) // 每5分钟

module.exports = authDiagnostic
