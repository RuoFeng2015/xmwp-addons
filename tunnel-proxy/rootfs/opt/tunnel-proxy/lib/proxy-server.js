const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const cors = require('@koa/cors')
const koaStatic = require('koa-static')
const http = require('http')
const httpProxy = require('http-proxy')
const path = require('path')
const Logger = require('./logger')
const AuthManager = require('./auth')
const { getConfig } = require('./config')
const HealthChecker = require('./health-checker')

/**
 * 代理服务器类
 */
class ProxyServer {
  constructor(tunnelManager) {
    this.tunnelManager = tunnelManager
    this.proxy = null
    this.activeConnections = new Map()
    this.healthChecker = new HealthChecker(tunnelManager)
  }

  createKoaApp() {
    const app = new Koa()
    const router = new Router()

    app.use(cors())
    app.use(bodyParser())
    app.use(koaStatic(path.join(__dirname, '..', 'public')))

    // 错误处理中间件
    app.use(async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        Logger.error(`请求处理错误: ${err.message}`)
        ctx.status = err.status || 500
        ctx.body = { error: err.message }
      }
    })

    // 认证中间件
    const authMiddleware = AuthManager.createAuthMiddleware()

    // 路由定义
    router.get('/', async (ctx) => {
      ctx.redirect('/index.html')
    })

    router.post('/api/auth/login', async (ctx) => {
      const { username, password } = ctx.request.body

      if (!username || !password) {
        ctx.status = 400
        ctx.body = { error: '用户名和密码不能为空' }
        return
      }

      if (!AuthManager.authenticate(username, password)) {
        ctx.status = 401
        ctx.body = { error: '用户名或密码错误' }
        return
      } const token = AuthManager.generateToken(username)
      ctx.body = {
        token,
        user: { username },
        expires_in: 86400,
      }
    })

    router.get('/api/status', authMiddleware, async (ctx) => {
      const healthStatus = this.healthChecker.getHealthStatus()
      ctx.body = {
        ...healthStatus,
        active_connections: this.activeConnections.size,
      }
    })

    router.get('/api/health', async (ctx) => {
      const healthStatus = this.healthChecker.getHealthStatus()
      ctx.body = {
        status: healthStatus.status,
        timestamp: healthStatus.timestamp,
        version: healthStatus.version,
        uptime: healthStatus.uptime,
      }
    })

    router.get('/api/config', authMiddleware, async (ctx) => {
      const config = getConfig()
      ctx.body = {
        server_host: config.server_host,
        server_port: config.server_port,
        local_ha_port: config.local_ha_port,
        proxy_port: config.proxy_port,
        client_id: config.client_id,
        log_level: config.log_level,
      }
    })

    app.use(router.routes())
    app.use(router.allowedMethods())

    return app
  }

  createHttpProxy() {
    const config = getConfig()
    this.proxy = httpProxy.createProxyServer({
      target: `http://127.0.0.1:${config.local_ha_port}`,
      changeOrigin: true,
      ws: true,
      timeout: 30000,
    })

    this.proxy.on('error', (err, req, res) => {
      Logger.error(`代理错误: ${err.message}`)
      if (res && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('代理服务器错误')
      }
    })

    this.proxy.on('proxyReq', (proxyReq, req, res) => {
      Logger.debug(`代理请求: ${req.method} ${req.url}`)

      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`
      this.activeConnections.set(connectionId, {
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
      })
    })

    this.proxy.on('proxyRes', (proxyRes, req, res) => {
      Logger.debug(`代理响应: ${proxyRes.statusCode} ${req.url}`)

      const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`
      this.activeConnections.delete(connectionId)
    })

    return this.proxy
  }

  createServer() {
    const app = this.createKoaApp()
    const httpProxy = this.createHttpProxy()

    const server = http.createServer(app.callback())

    server.on('request', (req, res) => {
      httpProxy.web(req, res)
    })

    server.on('upgrade', (req, socket, head) => {
      httpProxy.ws(req, socket, head)
    })

    return server
  }
  startConnectionCleanup() {
    // 启动健康检查
    this.healthChecker.startHealthCheck()

    // 定期清理过期连接
    setInterval(() => {
      const now = Date.now()
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        if (now - connection.timestamp > 300000) { // 5分钟超时
          this.activeConnections.delete(connectionId)
        }
      }
    }, 60000) // 每分钟检查一次
  }

  close() {
    if (this.proxy) {
      this.proxy.close()
      this.proxy = null
    }

    if (this.healthChecker) {
      this.healthChecker.stopHealthCheck()
    }
  }
}

module.exports = ProxyServer
