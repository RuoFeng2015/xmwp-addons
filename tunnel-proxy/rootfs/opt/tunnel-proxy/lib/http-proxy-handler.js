const http = require('http')
const Logger = require('./logger')
const { getConfig } = require('./config')

/**
 * HTTP 代理处理器
 */
class HttpProxyHandler {
  constructor(tunnelClient) {
    this.tunnelClient = tunnelClient
    this.lastSuccessLogTime = new Map() // 记录每个主机上次成功连接日志的时间
    this.logCooldownPeriod = 30000 // 30秒内不重复输出相同主机的成功连接日志
  }

  /**
   * 智能连接到HA
   */
  async handleProxyRequest(message, getTargetHosts, lastSuccessfulHost) {
    // 详细记录HTTP请求信息
    Logger.info(`🔄 [HTTP代理] 开始处理请求: ${message.method} ${message.url}`);
    Logger.info(`🔄 [HTTP代理] 请求ID: ${message.request_id}`);
    
    // 特别标识OAuth认证请求
    if (message.url && (message.url.includes('/auth/token') || message.url.includes('/auth/'))) {
      Logger.info(`🔐 [OAuth认证] *** 检测到OAuth认证请求! ***`);
      Logger.info(`🔐 [OAuth认证] 路径: ${message.url}`);
      Logger.info(`🔐 [OAuth认证] 这是iOS应用认证的关键请求`);
    }

    // 智能获取目标主机列表
    const discoveredHosts = await getTargetHosts()

    // 如果有上次成功的主机，优先尝试
    const targetHosts = lastSuccessfulHost
      ? [lastSuccessfulHost, ...discoveredHosts.filter((h) => h !== lastSuccessfulHost)]
      : discoveredHosts

    Logger.info(`🔍 [HTTP代理] 尝试连接 ${targetHosts.length} 个HA主机: ${targetHosts.join(', ')}`);

    for (const hostname of targetHosts) {
      try {
        Logger.info(`🔗 [HTTP代理] 尝试连接: ${hostname}`);
        const success = await this.attemptHAConnection(message, hostname)
        if (success) {
          // 使用日志去重机制，避免短时间内重复输出相同主机的连接成功日志
          this.logConnectionSuccess(hostname)
          Logger.info(`✅ [HTTP代理] 请求成功转发到: ${hostname}`);
          return hostname
        }
      } catch (error) {
        Logger.error(`❌ [HTTP代理] 连接失败 ${hostname}: ${error.message}`)
        continue
      }
    }

    Logger.error(`❌ [HTTP代理] 所有主机连接失败，发送错误响应`);
    this.sendDetailedError(message, targetHosts)
    return null
  }

  /**
   * 尝试HA连接 - 确保100%还原原始HTTP请求
   */
  attemptHAConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: message.url,
        method: message.method,
        headers: { ...message.headers },
        family: 4,
        timeout: 5000,
      }

      // 重要：保持原始Host头，确保虚拟主机正确路由
      if (message.headers.host) {
        options.headers['host'] = message.headers.host
      } else {
        options.headers['host'] = `${hostname}:${config.local_ha_port}`
      }

      // 不删除这些重要的头信息，它们对OAuth认证至关重要
      // delete options.headers['connection']
      // delete options.headers['content-length'] 
      // delete options.headers['transfer-encoding']
      // delete options.headers['accept-encoding']

      if (!options.headers['user-agent']) {
        options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.6.9'
      }

      const proxyReq = http.request(options, (proxyRes) => {
        Logger.info(`📥 [HTTP响应] 收到HA响应: ${proxyRes.statusCode} ${message.method} ${message.url}`);
        
        // 特别记录OAuth认证响应
        if (message.url && message.url.includes('/auth/')) {
          Logger.info(`🔐 [OAuth响应] OAuth认证响应状态: ${proxyRes.statusCode}`);
          Logger.info(`🔐 [OAuth响应] 响应头: ${JSON.stringify(proxyRes.headers)}`);
        }

        let responseBody = Buffer.alloc(0)
        proxyRes.on('data', (chunk) => {
          responseBody = Buffer.concat([responseBody, chunk])
        })
        proxyRes.on('end', () => {
          Logger.info(`📤 [HTTP响应] 响应完成: ${responseBody.length} bytes, 状态: ${proxyRes.statusCode}`);
          
          // OAuth响应内容预览
          if (message.url && message.url.includes('/auth/') && responseBody.length < 500) {
            Logger.info(`🔐 [OAuth响应] 内容预览: ${responseBody.toString()}`);
          }

          const response = {
            type: 'proxy_response',
            request_id: message.request_id,
            status_code: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody.toString('base64'),
          }

          this.tunnelClient.send(response)
          Logger.info(`📤 [HTTP响应] 响应已发送给服务器，请求ID: ${message.request_id}`);
          resolve(true)
        })
      })

      proxyReq.on('error', (error) => {
        Logger.error(`❌ [HTTP错误] 连接HA失败: ${error.message}`);
        Logger.error(`❌ [HTTP错误] 目标: ${hostname}:${config.local_ha_port}${message.url}`);
        
        // OAuth请求失败的特殊处理
        if (message.url && message.url.includes('/auth/')) {
          Logger.error(`🔐 [OAuth错误] OAuth认证请求失败!`);
          Logger.error(`🔐 [OAuth错误] 这会导致iOS应用OnboardingAuthError`);
        }
        
        reject(error)
      })

      proxyReq.on('timeout', () => {
        Logger.error(`⏰ [HTTP超时] 连接HA超时: ${hostname}:${config.local_ha_port}${message.url}`);
        
        if (message.url && message.url.includes('/auth/')) {
          Logger.error(`🔐 [OAuth超时] OAuth认证请求超时!`);
        }
        
        proxyReq.destroy()
        reject(new Error('连接超时'))
      })

      // 处理请求体 - 支持base64编码的原始数据
      if (message.body) {
        try {
          // 如果是base64编码的数据，先解码
          let bodyData
          if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
            // 看起来像base64，尝试解码
            try {
              bodyData = Buffer.from(message.body, 'base64')
            } catch (e) {
              // 解码失败，当作普通字符串处理
              bodyData = message.body
            }
          } else {
            bodyData = message.body
          }
          
          proxyReq.write(bodyData)
        } catch (error) {
          Logger.debug(`写入请求体失败: ${error.message}`)
          // 如果写入失败，尝试直接写入原始数据
          proxyReq.write(message.body)
        }
      }

      proxyReq.end()
    })
  }

  /**
   * 发送详细错误信息
   */
  sendDetailedError(message, attemptedHosts) {
    const config = getConfig()
    const errorResponse = {
      type: 'proxy_response',
      request_id: message.request_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: this.generateErrorPage(message, attemptedHosts, config),
    }

    this.tunnelClient.send(errorResponse)
    Logger.error(`发送详细错误页面: ${message.request_id}`)
  }

  /**
   * 生成错误页面
   */
  generateErrorPage(message, attemptedHosts, config) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Home Assistant 连接错误</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #d73527; margin-top: 0; }
            .info-box { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 15px 0; }
            .error-box { background: #ffebee; padding: 15px; border-radius: 4px; margin: 15px 0; }
            .success-box { background: #e8f5e8; padding: 15px; border-radius: 4px; margin: 15px 0; }
            ul { margin: 10px 0; padding-left: 20px; }
            .highlight { background: #fff3cd; padding: 2px 4px; border-radius: 2px; }
            .code { font-family: monospace; background: #f8f9fa; padding: 2px 4px; border-radius: 2px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚫 Home Assistant 连接失败</h1>
            
            <div class="error-box">
              <h3>❌ 问题描述</h3>
              <p>无法连接到本地的Home Assistant实例。代理服务器尝试了多个地址但都失败了。</p>
            </div>

            <div class="info-box">
              <h3>🔍 尝试的地址</h3>
              <ul>
                ${attemptedHosts
        .map(host => `<li><span class="code">${host}:${config.local_ha_port}</span></li>`)
        .join('')}
              </ul>
            </div>

            <div class="info-box">
              <h3>📋 当前配置</h3>
              <ul>
                <li><strong>local_ha_port:</strong> <span class="code">${config.local_ha_port}</span></li>
                <li><strong>已知HA地址:</strong> <span class="highlight">192.168.6.170:8123</span></li>
                <li><strong>client_id:</strong> <span class="code">${config.client_id}</span></li>
              </ul>
            </div>

            <div class="success-box">
              <h3>🔧 解决方案</h3>
              <ol>
                <li><strong>检查 Home Assistant 状态：</strong> 确认 HA 正在运行: <span class="code">http://192.168.6.170:8123</span></li>
                <li><strong>检查网络配置：</strong> 编辑 <span class="code">configuration.yaml</span>: <span class="code">http: server_host: 0.0.0.0</span></li>
                <li><strong>验证连接：</strong> 在 HA 设备上测试: <span class="code">curl http://127.0.0.1:8123</span></li>
              </ol>
            </div>

            <div class="info-box">
              <h3>🐛 调试信息</h3>
              <ul>
                <li><strong>请求URL:</strong> <span class="code">${message.url}</span></li>
                <li><strong>请求方法:</strong> <span class="code">${message.method}</span></li>
                <li><strong>时间戳:</strong> <span class="code">${new Date().toISOString()}</span></li>
                <li><strong>插件版本:</strong> <span class="code">1.6.9</span></li>
              </ul>
            </div>
          </div>
        </body>
      </html>
    `
    return Buffer.from(errorHtml).toString('base64')
  }

  /**
   * 测试单个主机连接
   */
  testSingleHost(hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const options = {
        hostname: hostname,
        port: config.local_ha_port,
        path: '/',
        method: 'GET',
        timeout: 3000,
        family: 4,
        headers: {
          host: `${hostname}:${config.local_ha_port}`,
          'user-agent': 'HomeAssistant-Tunnel-Proxy/1.6.9',
        },
      }

      const req = http.request(options, (res) => {
        // 收集响应数据以验证是否为HA
        let data = ''

        res.on('data', (chunk) => {
          data += chunk.toString()
          // 限制数据大小以避免内存问题
          if (data.length > 5120) { // 5KB足够检测HA特征
            req.destroy()
          }
        })

        res.on('end', () => {
          // 验证响应是否真的是Home Assistant
          if (this.isHomeAssistantResponse(res, data)) {
            resolve(true)
          } else {
            reject(new Error(`非Home Assistant服务 (状态码: ${res.statusCode})`))
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('连接超时'))
      })

      req.end()
    })
  }

  /**
   * 简化的HA响应验证
   */
  isHomeAssistantResponse(response, body) {
    if (!response || response.statusCode < 200 || response.statusCode >= 500) {
      return false
    }

    const content = (body || '').toLowerCase()

    // 检查关键的HA标识
    return content.includes('home assistant') ||
      content.includes('homeassistant') ||
      content.includes('hass-frontend') ||
      content.includes('home-assistant-main') ||
      content.includes('frontend_latest')
  }

  /**
   * 记录连接成功日志（带去重功能）
   */
  logConnectionSuccess(hostname) {
    const now = Date.now()
    const lastLogTime = this.lastSuccessLogTime.get(hostname)
    
    // 如果距离上次记录日志超过冷却期，或者是第一次连接此主机，则输出日志
    if (!lastLogTime || (now - lastLogTime) > this.logCooldownPeriod) {
      Logger.info(`✅ 成功连接到 Home Assistant: ${hostname}`)
      this.lastSuccessLogTime.set(hostname, now)
    } else {
      // 在冷却期内，使用debug级别避免刷屏
      Logger.debug(`✅ 连接成功 (已去重): ${hostname}`)
    }
  }
}

module.exports = HttpProxyHandler
