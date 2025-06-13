const jwt = require('jsonwebtoken')
const Logger = require('./logger')
const { getConfig } = require('./config')

const JWT_SECRET = 'ha-tunnel-proxy-secret-key-2023'

/**
 * 身份验证类
 */
class AuthManager {
  static generateToken(username) {
    const payload = {
      username: username,
      client_id: getConfig().client_id,
      timestamp: Date.now(),
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      Logger.warn(`Token验证失败: ${error.message}`)
      return null
    }
  }

  static authenticate(username, password) {
    const config = getConfig()
    return username === config.username && password === config.password
  }

  static createAuthMiddleware() {
    return async (ctx, next) => {
      const token = ctx.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        ctx.status = 401
        ctx.body = { error: '缺少认证令牌' }
        return
      }

      const decoded = this.verifyToken(token)
      if (!decoded) {
        ctx.status = 401
        ctx.body = { error: '无效的认证令牌' }
        return
      }

      ctx.user = decoded
      await next()
    }
  }
}

module.exports = AuthManager
