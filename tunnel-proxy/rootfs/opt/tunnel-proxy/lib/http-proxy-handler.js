const http = require('http')
const Logger = require('./logger')
const { getConfig } = require('./config')
const HAHealthChecker = require('./ha-health-checker')
const IOSIssueDiagnostic = require('./ios-issue-diagnostic')
const APIMonitor = require('./api-monitor')
const IOSBehaviorAnalyzer = require('./ios-behavior-analyzer')

/**
 * HTTP 代理处理器
 */
class HttpProxyHandler {
  constructor(tunnelClient) {
    this.tunnelClient = tunnelClient
    this.lastSuccessLogTime = new Map() // 记录每个主机上次成功连接日志的时间
    this.logCooldownPeriod = 30000 // 30秒内不重复输出相同主机的成功连接日志
    this.healthChecker = new HAHealthChecker() // 健康检查器
    this.apiMonitor = new APIMonitor() // API监控器
    this.lastAccessToken = null // 存储最后的access_token
    this.iosBehaviorAnalyzer = new IOSBehaviorAnalyzer() // iOS行为分析器
  }

  /**
   * 智能连接到HA
   */
  async handleProxyRequest(message, getTargetHosts, lastSuccessfulHost) {
    // 首先验证和修复OAuth请求
    message = this.validateAndFixOAuthRequest(message);
    
    // iOS专用调试增强
    const isiOSApp = this.enhanceiOSDebugging(message);
    
    // iOS App状态监控
    this.monitoriOSAppState(message, isiOSApp);
    
    // 详细记录HTTP请求信息
    Logger.info(`🔄 [HTTP代理] 开始处理请求: ${message.method} ${message.url}`);
    Logger.info(`🔄 [HTTP代理] 请求ID: ${message.request_id}`);
    
    // 记录主机状态信息
    Logger.info(`🏠 [主机状态] 上次成功主机: ${lastSuccessfulHost || '无'}`);
    
    // 特别标识OAuth认证请求
    if (message.url && (message.url.includes('/auth/token') || message.url.includes('/auth/'))) {
      Logger.info(`🔐 [OAuth认证] *** 检测到OAuth认证请求! ***`);
      Logger.info(`🔐 [OAuth认证] 路径: ${message.url}`);
      Logger.info(`🔐 [OAuth认证] 方法: ${message.method}`);
      Logger.info(`🔐 [OAuth认证] 这是iOS应用认证的关键请求`);
      
      // 详细记录OAuth请求信息
      if (message.url.includes('/auth/token')) {
        Logger.info(`🔐 [OAuth Token] *** 这是关键的token交换请求! ***`);
        Logger.info(`🔐 [OAuth Token] 请求头: ${JSON.stringify(message.headers)}`);
        
        if (message.body) {
          try {
            // 尝试解析请求体内容
            let bodyData = message.body;
            if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
              try {
                bodyData = Buffer.from(message.body, 'base64').toString();
              } catch (e) {
                // 解码失败
              }
            }
            Logger.info(`🔐 [OAuth Token] 请求体内容: ${bodyData}`);
          } catch (e) {
            Logger.info(`🔐 [OAuth Token] 请求体解析失败: ${e.message}`);
          }
        } else {
          Logger.warn(`🔐 [OAuth Token] ⚠️ 警告: OAuth token请求没有请求体!`);
        }
      }
    }

    // 智能获取目标主机列表
    const discoveredHosts = await getTargetHosts()

    // 如果有上次成功的主机，优先尝试
    const targetHosts = lastSuccessfulHost
      ? [lastSuccessfulHost, ...discoveredHosts.filter((h) => h !== lastSuccessfulHost)]
      : discoveredHosts

    Logger.info(`🔍 [HTTP代理] 尝试连接 ${targetHosts.length} 个HA主机: ${targetHosts.join(', ')}`);
    Logger.info(`🎯 [主机优先级] 第一优先级: ${targetHosts[0]} ${lastSuccessfulHost ? '(上次成功主机)' : '(发现的主机)'}`);

    for (const hostname of targetHosts) {
      try {
        Logger.info(`🔗 [HTTP代理] 尝试连接: ${hostname}`);
        const success = await this.attemptHAConnection(message, hostname, isiOSApp)
        if (success) {
          // 使用日志去重机制，避免短时间内重复输出相同主机的连接成功日志
          this.logConnectionSuccess(hostname)
          Logger.info(`✅ [HTTP代理] 请求成功转发到: ${hostname}`);
          
          // 如果是iOS App，启动健康检查
          if (isiOSApp) {
            this.healthChecker.startHealthCheck(hostname);
          }
          
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
  attemptHAConnection(message, hostname, isiOSApp = false) {
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
      
      // 确保 isiOSApp 在所有回调中可用
      const isIOSRequest = isiOSApp;

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
          
          // 专门针对token请求的分析
          if (message.url.includes('/auth/token')) {
            Logger.info(`🔐 [OAuth Token响应] *** Token请求响应分析 ***`);
            Logger.info(`🔐 [OAuth Token响应] Content-Type: ${proxyRes.headers['content-type'] || '未设置'}`);
            Logger.info(`🔐 [OAuth Token响应] Content-Length: ${proxyRes.headers['content-length'] || '未设置'}`);
            
            // 检查请求类型以确定是否应该有响应体
            let requestBodyContent = '';
            try {
              if (message.body) {
                if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
                  requestBodyContent = Buffer.from(message.body, 'base64').toString();
                } else {
                  requestBodyContent = message.body.toString();
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
            
            const isTokenRevoke = requestBodyContent.includes('action=revoke');
            const isTokenExchange = requestBodyContent.includes('grant_type=authorization_code');
            
            if (proxyRes.statusCode === 200) {
              if (!proxyRes.headers['content-length'] || proxyRes.headers['content-length'] === '0') {
                if (isTokenRevoke) {
                  Logger.info(`🔐 [OAuth Token响应] ✅ Token撤销请求正常 - 空响应是预期的`);
                  Logger.info(`🔐 [OAuth Token响应] iOS应用撤销旧token，HA正确返回空响应`);
                } else if (isTokenExchange) {
                  Logger.error(`🔐 [OAuth Token响应] ❌ 错误: Token交换请求响应体为空!`);
                  Logger.error(`🔐 [OAuth Token响应] 这会导致iOS应用OnboardingAuthError`);
                } else {
                  Logger.warn(`🔐 [OAuth Token响应] ⚠️ 警告: 未知token请求类型返回空响应`);
                }
              } else {
                Logger.info(`🔐 [OAuth Token响应] ✅ 响应包含内容，长度: ${proxyRes.headers['content-length']} bytes`);
              }
            } else {
              Logger.warn(`🔐 [OAuth Token响应] ⚠️ 非200状态码: ${proxyRes.statusCode}`);
            }
          }
        }

        let responseBody = Buffer.alloc(0)
        proxyRes.on('data', (chunk) => {
          responseBody = Buffer.concat([responseBody, chunk])
        })
        proxyRes.on('end', () => {
          Logger.info(`📤 [HTTP响应] 响应完成: ${responseBody.length} bytes, 状态: ${proxyRes.statusCode}`);
          
          // 首先创建增强的响应头对象
          const enhancedHeaders = { ...proxyRes.headers };
          
          // 检查是否需要添加CORS头
          const needsCorsHeaders = this.shouldAddCorsHeaders(message, proxyRes);
          if (needsCorsHeaders) {
            this.addCorsHeaders(enhancedHeaders, message);
          }
          
          // 详细的 CORS 和缓存头检查
          const corsHeaders = {
            'access-control-allow-origin': enhancedHeaders['access-control-allow-origin'],
            'access-control-allow-methods': enhancedHeaders['access-control-allow-methods'],
            'access-control-allow-headers': enhancedHeaders['access-control-allow-headers'],
            'access-control-allow-credentials': enhancedHeaders['access-control-allow-credentials']
          };
          
          const cacheHeaders = {
            'cache-control': enhancedHeaders['cache-control'],
            'etag': enhancedHeaders['etag'],
            'last-modified': enhancedHeaders['last-modified'],
            'expires': enhancedHeaders['expires']
          };
          
          // 检查是否有CORS相关头
          const hasCorsHeaders = Object.values(corsHeaders).some(header => header !== undefined);
          if (hasCorsHeaders) {
            Logger.info(`🌐 [CORS检查] 检测到CORS头信息:`);
            Object.entries(corsHeaders).forEach(([key, value]) => {
              if (value !== undefined) {
                Logger.info(`🌐 [CORS检查] ${key}: ${value}`);
              }
            });
            
            // 专门检查iOS可能需要的CORS设置
            if (message.headers.origin && message.headers.origin.includes('ha-client-001.wzzhk.club')) {
              Logger.info(`🍎 [iOS CORS] iOS应用来源: ${message.headers.origin}`);
              if (!corsHeaders['access-control-allow-origin'] || 
                  (corsHeaders['access-control-allow-origin'] !== '*' && 
                   corsHeaders['access-control-allow-origin'] !== message.headers.origin)) {
                Logger.warn(`🍎 [iOS CORS] ⚠️ 可能的CORS问题: Origin ${message.headers.origin} 可能不被允许`);
                Logger.warn(`🍎 [iOS CORS] HA的Access-Control-Allow-Origin: ${corsHeaders['access-control-allow-origin'] || '未设置'}`);
              } else {
                Logger.info(`🍎 [iOS CORS] ✅ CORS Origin检查通过`);
              }
            }
          }
          
          // 检查缓存相关头
          const hasCacheHeaders = Object.values(cacheHeaders).some(header => header !== undefined);
          if (hasCacheHeaders) {
            Logger.info(`📦 [缓存检查] 检测到缓存头信息:`);
            Object.entries(cacheHeaders).forEach(([key, value]) => {
              if (value !== undefined) {
                Logger.info(`📦 [缓存检查] ${key}: ${value}`);
              }
            });
            
            // 检查可能影响iOS的缓存设置
            if (cacheHeaders['cache-control'] && cacheHeaders['cache-control'].includes('no-cache')) {
              Logger.info(`🍎 [iOS缓存] 检测到no-cache指令，这可能影响iOS应用缓存行为`);
            }
            if (cacheHeaders['etag']) {
              Logger.info(`🍎 [iOS缓存] ETag存在，iOS可能使用条件请求`);
            }
          }

        // 特别处理token请求的响应
        if (message.url && message.url.includes('/auth/token')) {
          Logger.info(`🔐 [OAuth Token响应] *** 准备发送token响应给服务器 ***`);
          Logger.info(`🔐 [OAuth Token响应] 请求ID: ${message.request_id}`);
          Logger.info(`🔐 [OAuth Token响应] 状态码: ${proxyRes.statusCode}`);
          Logger.info(`🔐 [OAuth Token响应] 响应长度: ${responseBody.length} bytes`);
          
          // 检查请求类型以确定是否应该有响应体
          let requestBodyContent = '';
          try {
            if (message.body) {
              if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
                requestBodyContent = Buffer.from(message.body, 'base64').toString();
              } else {
                requestBodyContent = message.body.toString();
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
          
          const isTokenRevoke = requestBodyContent.includes('action=revoke');
          const isTokenExchange = requestBodyContent.includes('grant_type=authorization_code');
          
          if (proxyRes.statusCode === 200) {
            if (!proxyRes.headers['content-length'] || proxyRes.headers['content-length'] === '0') {
              if (isTokenRevoke) {
                Logger.info(`🔐 [OAuth Token响应] ✅ Token撤销请求正常 - 空响应是预期的`);
                Logger.info(`🔐 [OAuth Token响应] iOS应用撤销旧token，HA正确返回空响应`);
              } else if (isTokenExchange) {
                Logger.error(`🔐 [OAuth Token响应] ❌ 错误: Token交换请求响应体为空!`);
                Logger.error(`🔐 [OAuth Token响应] 这会导致iOS应用OnboardingAuthError`);
              } else {
                Logger.warn(`🔐 [OAuth Token响应] ⚠️ 警告: 未知token请求类型返回空响应`);
              }
            } else {
              Logger.info(`🔐 [OAuth Token响应] ✅ 响应包含内容，长度: ${proxyRes.headers['content-length']} bytes`);
              
              // 如果是token交换成功，提取access_token并启动API监控
              if (isTokenExchange && responseBody.length > 0) {
                try {
                  // 首先尝试解压缩响应
                  let decompressedData = responseBody;
                  const encoding = proxyRes.headers['content-encoding'];
                  
                  if (encoding === 'deflate') {
                    const zlib = require('zlib');
                    decompressedData = zlib.inflateSync(responseBody);
                    Logger.info(`🔐 [OAuth Token解析] deflate解压缩成功`);
                  } else if (encoding === 'gzip') {
                    const zlib = require('zlib');
                    decompressedData = zlib.gunzipSync(responseBody);
                    Logger.info(`🔐 [OAuth Token解析] gzip解压缩成功`);
                  } else if (encoding === 'br') {
                    const zlib = require('zlib');
                    decompressedData = zlib.brotliDecompressSync(responseBody);
                    Logger.info(`🔐 [OAuth Token解析] brotli解压缩成功`);
                  }
                  
                  const tokenResponse = JSON.parse(decompressedData.toString());
                  if (tokenResponse.access_token) {
                    this.lastAccessToken = tokenResponse.access_token;
                    Logger.info(`🔐 [OAuth Token解析] ✅ 成功提取access_token`);
                    Logger.info(`🔐 [OAuth Token解析] Token长度: ${tokenResponse.access_token.length}`);
                    
                    // 记录OAuth完成
                    this.iosBehaviorAnalyzer.recordOAuthComplete();
                    
                    // 启动API监控 - 模拟iOS App的API调用
                    setTimeout(() => {
                      Logger.info(`🍎 [API监控] 启动API监控，模拟iOS App行为...`);
                      this.apiMonitor.startMonitoring(options.hostname, this.lastAccessToken);
                    }, 3000); // 3秒后启动
                    
                    // 25秒后生成行为分析报告
                    setTimeout(() => {
                      this.iosBehaviorAnalyzer.generateReport();
                    }, 25000);
                  }
                } catch (e) {
                  Logger.warn(`🔐 [OAuth Token解析] 解析token响应失败: ${e.message}`);
                }
              }
            }
          } else {
            Logger.warn(`🔐 [OAuth Token响应] ⚠️ 非200状态码: ${proxyRes.statusCode}`);
          }
          
          // 检查token响应的CORS头
          if (isTokenExchange) {
            if (enhancedHeaders['access-control-allow-origin']) {
              Logger.info(`🔐 [OAuth CORS] ✅ Token交换响应包含CORS头: ${enhancedHeaders['access-control-allow-origin']}`);
              Logger.info(`🔐 [OAuth CORS] 这应该解决iOS OnboardingAuthError问题!`);
            } else {
              Logger.error(`🔐 [OAuth CORS] ❌ Token交换响应仍缺少CORS头，可能影响iOS`);
            }
          } else if (isTokenRevoke) {
            if (enhancedHeaders['access-control-allow-origin']) {
              Logger.info(`🔐 [OAuth CORS] Token撤销响应包含CORS头: ${enhancedHeaders['access-control-allow-origin']}`);
            }
          }
        }

        // 专门跟踪认证成功后的API请求
        if (message.url && (
          message.url.includes('/api/config') ||
          message.url.includes('/api/states') ||
          message.url.includes('/api/services') ||
          message.url.includes('/api/') ||
          message.url === '/' ||
          message.url.includes('/frontend_latest/') ||
          message.url.includes('/static/')
        )) {
          Logger.info(`🍎 [iOS API跟踪] 检测到认证后API请求: ${message.method} ${message.url}`);
          Logger.info(`🍎 [iOS API跟踪] 状态码: ${proxyRes.statusCode}`);
          Logger.info(`🍎 [iOS API跟踪] 响应长度: ${responseBody.length} bytes`);
          
          if (proxyRes.statusCode >= 400) {
            Logger.error(`🍎 [iOS API错误] API请求失败: ${proxyRes.statusCode} ${message.url}`);
            Logger.error(`🍎 [iOS API错误] 这可能导致iOS应用连接失败`);
          } else {
            Logger.info(`🍎 [iOS API成功] API请求成功: ${message.url}`);
          }
          
          // 记录到行为分析器
          if (isIOSRequest) {
            this.iosBehaviorAnalyzer.recordAPIRequest(message.method, message.url, proxyRes.statusCode, responseBody.length);
          }
          
          // 检查关键API的CORS
          if (message.url.includes('/api/')) {
            if (enhancedHeaders['access-control-allow-origin']) {
              Logger.info(`🍎 [iOS API CORS] ✅ API响应包含CORS头: ${message.url}`);
            } else {
              Logger.warn(`🍎 [iOS API CORS] ⚠️ API响应缺少CORS头: ${message.url}`);
            }
          }
        }

          const response = {
            type: 'proxy_response',
            request_id: message.request_id,
            status_code: proxyRes.statusCode,
            headers: enhancedHeaders,
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
              
              // 特别处理OAuth token请求
              if (message.url && message.url.includes('/auth/token')) {
                const bodyString = bodyData.toString();
                Logger.info(`🔐 [OAuth请求体] 解码后内容: ${bodyString}`);
                
                // 检查请求类型
                const isTokenExchange = bodyString.includes('grant_type=authorization_code');
                const isTokenRevoke = bodyString.includes('action=revoke');
                const isTokenRefresh = bodyString.includes('grant_type=refresh_token');
                
                if (isTokenExchange) {
                  Logger.info(`🔐 [OAuth请求体] ✅ Token交换请求 - 包含正确的OAuth参数`);
                  if (bodyString.includes('grant_type=') && bodyString.includes('code=')) {
                    Logger.info(`🔐 [OAuth请求体] ✅ 包含必要的OAuth参数 (grant_type + code)`);
                  } else {
                    Logger.warn(`🔐 [OAuth请求体] ⚠️ 警告: Token交换请求可能缺少必要参数`);
                  }
                } else if (isTokenRevoke) {
                  Logger.info(`🔐 [OAuth请求体] ✅ Token撤销请求 - iOS应用清理旧token`);
                } else if (isTokenRefresh) {
                  Logger.info(`🔐 [OAuth请求体] ✅ Token刷新请求`);
                } else {
                  Logger.warn(`🔐 [OAuth请求体] ⚠️ 警告: 未知的OAuth请求类型`);
                }
              }
            } catch (e) {
              // 解码失败，当作普通字符串处理
              bodyData = message.body
              Logger.warn(`Base64解码失败，使用原始数据: ${e.message}`)
            }
          } else {
            bodyData = message.body
            
            // 对于非base64的OAuth请求体也进行记录
            if (message.url && message.url.includes('/auth/token')) {
              Logger.info(`🔐 [OAuth请求体] 原始内容: ${bodyData}`);
            }
          }
          
          proxyReq.write(bodyData)
        } catch (error) {
          Logger.error(`写入请求体失败: ${error.message}`)
          
          // OAuth请求的特殊错误处理
          if (message.url && message.url.includes('/auth/token')) {
            Logger.error(`🔐 [OAuth错误] 写入OAuth请求体失败! 这会导致认证失败`);
          }
          
          // 如果写入失败，尝试直接写入原始数据
          try {
            proxyReq.write(message.body)
          } catch (fallbackError) {
            Logger.error(`写入原始请求体也失败: ${fallbackError.message}`)
          }
        }
      } else if (message.url && message.url.includes('/auth/token') && message.method === 'POST') {
        Logger.error(`🔐 [OAuth错误] ❌ 严重错误: OAuth POST请求没有请求体!`);
        Logger.error(`🔐 [OAuth错误] 这会导致Home Assistant返回空响应`);
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

  /**
   * 验证并修复OAuth请求
   */
  validateAndFixOAuthRequest(message) {
    if (!message.url || !message.url.includes('/auth/token')) {
      return message; // 不是OAuth请求，直接返回
    }

    Logger.info(`🔐 [OAuth修复] 开始验证OAuth请求...`);
    
    // 检查是否是POST请求
    if (message.method !== 'POST') {
      Logger.error(`🔐 [OAuth错误] OAuth token请求必须是POST方法，当前: ${message.method}`);
      return message;
    }

    // 检查Content-Type
    const contentType = message.headers['content-type'] || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      Logger.warn(`🔐 [OAuth警告] 期望Content-Type为application/x-www-form-urlencoded，当前: ${contentType}`);
    }

    // 检查请求体
    if (!message.body) {
      Logger.error(`🔐 [OAuth错误] OAuth请求缺少请求体!`);
      return message;
    }

    // 解析请求体
    let bodyContent = '';
    try {
      if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
        bodyContent = Buffer.from(message.body, 'base64').toString();
      } else {
        bodyContent = message.body.toString();
      }
      
      Logger.info(`🔐 [OAuth修复] 解析的请求体: ${bodyContent}`);
      
      // 检查请求类型
      const isTokenExchange = bodyContent.includes('grant_type=authorization_code');
      const isTokenRevoke = bodyContent.includes('action=revoke');
      const isTokenRefresh = bodyContent.includes('grant_type=refresh_token');
      
      if (isTokenExchange) {
        Logger.info(`🔐 [OAuth类型] *** AUTHORIZATION CODE交换请求 (关键!) ***`);
        const hasGrantType = bodyContent.includes('grant_type=');
        const hasCode = bodyContent.includes('code=');
        const hasClientId = bodyContent.includes('client_id=');
        Logger.info(`🔐 [OAuth验证] grant_type: ${hasGrantType}, code: ${hasCode}, client_id: ${hasClientId}`);
        Logger.info(`🔐 [OAuth重要] 这是iOS应用添加服务器的核心步骤! 必须返回access_token和refresh_token`);
        
        if (!hasGrantType || !hasCode) {
          Logger.error(`🔐 [OAuth错误] ❌ Authorization Code交换请求缺少必要参数!`);
          Logger.error(`🔐 [OAuth错误] grant_type: ${hasGrantType}, code: ${hasCode}`);
          Logger.error(`🔐 [OAuth错误] 这会导致iOS OnboardingAuthError!`);
        }
      } else if (isTokenRevoke) {
        Logger.info(`🔐 [OAuth类型] Token撤销请求 (iOS应用清理旧token)`);
        Logger.info(`🔐 [OAuth说明] 这是正常行为，HA会返回空响应(200状态码)`);
      } else if (isTokenRefresh) {
        Logger.info(`🔐 [OAuth类型] Token刷新请求`);
      } else {
        Logger.warn(`🔐 [OAuth警告] 未知的OAuth请求类型: ${bodyContent.substring(0, 100)}`);
      }
      
      // 确保Content-Length正确设置
      const bodyBuffer = Buffer.from(bodyContent);
      message.headers['content-length'] = bodyBuffer.length.toString();
      
      Logger.info(`🔐 [OAuth修复] 设置Content-Length为: ${bodyBuffer.length}`);
      
    } catch (error) {
      Logger.error(`🔐 [OAuth错误] 解析请求体失败: ${error.message}`);
    }

    return message;
  }

  /**
   * 检查是否需要为响应添加CORS头
   */
  shouldAddCorsHeaders(message, proxyRes) {
    const url = message.url || '';
    const headers = proxyRes.headers || {};
    const origin = message.headers?.origin || '';
    
    // 如果已经有CORS头，通常不需要添加
    if (headers['access-control-allow-origin']) {
      return false;
    }
    
    // OAuth相关请求必须有CORS头（iOS严格要求）
    if (url.includes('/auth/token') || 
        url.includes('/auth/providers') || 
        url.includes('/auth/login_flow')) {
      Logger.info(`🌐 [CORS检查] OAuth请求需要CORS头: ${url}`);
      return true;
    }
    
    // API请求如果来自iOS应用也需要CORS头
    if (url.includes('/api/') && origin.includes('ha-client-001.wzzhk.club')) {
      Logger.info(`🌐 [CORS检查] iOS API请求需要CORS头: ${url}`);
      return true;
    }
    
    // WebSocket升级请求可能需要CORS头
    if (message.headers?.upgrade?.toLowerCase() === 'websocket' && origin) {
      Logger.info(`🌐 [CORS检查] WebSocket升级请求需要CORS头`);
      return true;
    }
    
    return false;
  }

  /**
   * 为响应添加CORS头
   */
  addCorsHeaders(headers, message) {
    const origin = message.headers?.origin || '';
    const url = message.url || '';
    
    // 基本CORS头 - 允许iOS应用域名
    if (origin.includes('ha-client-001.wzzhk.club') || origin.includes('homeassistant://')) {
      headers['access-control-allow-origin'] = origin;
      Logger.info(`🌐 [CORS添加] 设置Origin为: ${origin}`);
    } else if (origin) {
      // 对于其他来源，使用通配符（仅在必要时）
      headers['access-control-allow-origin'] = '*';
      Logger.info(`🌐 [CORS添加] 设置Origin为通配符: ${origin}`);
    } else {
      // 没有Origin头，使用通配符
      headers['access-control-allow-origin'] = '*';
      Logger.info(`🌐 [CORS添加] 设置Origin为通配符（无Origin请求头）`);
    }
    
    // OAuth请求需要的CORS头
    if (url.includes('/auth/')) {
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      headers['access-control-allow-headers'] = 'Accept, Content-Type, Authorization, X-Requested-With';
      headers['access-control-allow-credentials'] = 'true';
      Logger.info(`🔐 [OAuth CORS] 为OAuth请求添加完整CORS头集合`);
      
      // 特别检查token交换请求
      if (url.includes('/auth/token')) {
        let requestBodyContent = '';
        try {
          if (message.body) {
            if (typeof message.body === 'string' && message.body.match(/^[A-Za-z0-9+/]+=*$/)) {
              requestBodyContent = Buffer.from(message.body, 'base64').toString();
            } else {
              requestBodyContent = message.body.toString();
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
        
        const isTokenExchange = requestBodyContent.includes('grant_type=authorization_code');
        if (isTokenExchange) {
          Logger.info(`🔐 [OAuth CORS] *** 为关键Token交换请求添加CORS头! ***`);
          Logger.info(`🔐 [OAuth CORS] 这应该解决iOS OnboardingAuthError问题`);
        }
      }
    }
    
    // API请求的CORS头
    if (url.includes('/api/')) {
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      headers['access-control-allow-headers'] = 'Accept, Content-Type, Authorization, X-Requested-With';
      headers['access-control-allow-credentials'] = 'true';
      Logger.info(`🍎 [API CORS] 为API请求添加CORS头: ${url}`);
    }
    
    // WebSocket的CORS头
    if (message.headers?.upgrade?.toLowerCase() === 'websocket') {
      headers['access-control-allow-methods'] = 'GET';
      headers['access-control-allow-headers'] = 'Accept, Content-Type, Authorization, X-Requested-With, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Sec-WebSocket-Protocol';
      headers['access-control-allow-credentials'] = 'true';
      Logger.info(`🌐 [WS CORS] 为WebSocket升级添加CORS头`);
    }
  }

  /**
   * iOS专用调试增强器
   */
  enhanceiOSDebugging(message) {
    // 检测iOS用户代理
    const userAgent = message.headers['user-agent'] || '';
    const isiOSApp = userAgent.includes('Home Assistant') && userAgent.includes('iOS');
    
    if (isiOSApp) {
      Logger.info(`🍎 [iOS调试] *** iOS Home Assistant App请求 ***`);
      Logger.info(`🍎 [iOS调试] User-Agent: ${userAgent}`);
      Logger.info(`🍎 [iOS调试] 方法: ${message.method}`);
      Logger.info(`🍎 [iOS调试] 路径: ${message.url}`);
      Logger.info(`🍎 [iOS调试] 来源: ${message.headers.origin || message.headers.referer || '未知'}`);
      
      // 分析请求类型
      if (message.url.includes('/api/')) {
        Logger.info(`🍎 [iOS API] *** 关键HA API请求! ***`);
        Logger.info(`🍎 [iOS API] 这是iOS App获取HA数据的请求`);
        Logger.info(`🍎 [iOS API] Authorization头: ${message.headers.authorization ? '存在' : '缺失'}`);
      }
      
      // OAuth流程分析
      if (message.url.includes('/auth/')) {
        Logger.info(`🍎 [iOS OAuth] OAuth流程步骤检测`);
        if (message.url.includes('/auth/authorize')) {
          Logger.info(`🍎 [iOS OAuth] → 步骤1: 授权请求`);
        } else if (message.url.includes('/auth/token')) {
          Logger.info(`🍎 [iOS OAuth] → 步骤2: Token交换/撤销`);
        } else if (message.url.includes('/auth/login_flow')) {
          Logger.info(`🍎 [iOS OAuth] → 步骤0: 登录流程`);
          // iOS OAuth流程从登录流程开始
          if (!this.iosBehaviorAnalyzer.sessionData.oauthStartTime) {
            this.iosBehaviorAnalyzer.recordOAuthStart();
          }
        }
      }
      
      // 检查关键头部
      const criticalHeaders = ['authorization', 'content-type', 'accept', 'origin'];
      Logger.info(`🍎 [iOS头部] 关键头部信息:`);
      criticalHeaders.forEach(header => {
        const value = message.headers[header];
        Logger.info(`🍎 [iOS头部]   ${header}: ${value || '未设置'}`);
      });
    }
    
    return isiOSApp;
  }

  /**
   * iOS App状态监控
   */
  monitoriOSAppState(message, isiOSApp) {
    if (!isiOSApp) return;
    
    // 记录iOS App的请求时间线
    if (!this.iOSRequestTimeline) {
      this.iOSRequestTimeline = [];
    }
    
    const timestamp = new Date().toISOString();
    const requestInfo = {
      timestamp,
      method: message.method,
      url: message.url,
      type: this.categorizeRequest(message.url)
    };
    
    this.iOSRequestTimeline.push(requestInfo);
    
    // 只保留最近20条记录
    if (this.iOSRequestTimeline.length > 20) {
      this.iOSRequestTimeline = this.iOSRequestTimeline.slice(-20);
    }
    
    Logger.info(`🍎 [iOS时间线] ${requestInfo.type}: ${message.method} ${message.url}`);
    
    // 分析iOS App行为模式
    this.analyzeiOSBehavior();
    
    // 如果是OAuth完成后一段时间，进行问题诊断
    if (isiOSApp && requestInfo.type === 'Token操作') {
      setTimeout(() => {
        const issues = IOSIssueDiagnostic.diagnoseConnectionIssue(this.iOSRequestTimeline, requestInfo.timestamp);
        IOSIssueDiagnostic.generateDebugReport(this.iOSRequestTimeline, issues);
      }, 15000); // 15秒后进行诊断
    }
  }
  
  /**
   * 分类请求类型
   */
  categorizeRequest(url) {
    if (url.includes('/auth/authorize')) return 'OAuth授权';
    if (url.includes('/auth/token')) return 'Token操作';
    if (url.includes('/auth/login_flow')) return '登录流程';
    if (url.includes('/api/websocket')) return 'WebSocket';
    if (url.includes('/api/config')) return 'HA配置';
    if (url.includes('/api/states')) return 'HA状态';
    if (url.includes('/api/services')) return 'HA服务';
    if (url.includes('/api/')) return 'HA-API';
    if (url.includes('/manifest.json')) return '应用清单';
    return '其他';
  }
  
  /**
   * 分析iOS行为模式
   */
  analyzeiOSBehavior() {
    if (!this.iOSRequestTimeline || this.iOSRequestTimeline.length < 5) return;
    
    const recentRequests = this.iOSRequestTimeline.slice(-10);
    const types = recentRequests.map(r => r.type);
    
    // 检查是否完成了OAuth流程但没有API请求
    const hasOAuth = types.includes('OAuth授权') || types.includes('Token操作');
    const hasAPI = types.some(t => t.includes('HA-') || t === 'HA配置' || t === 'HA状态');
    
    if (hasOAuth && !hasAPI) {
      const lastTokenOp = recentRequests.find(r => r.type === 'Token操作');
      if (lastTokenOp) {
        const timeSinceToken = Date.now() - new Date(lastTokenOp.timestamp).getTime();
        if (timeSinceToken > 10000) { // 10秒后还没有API请求
          Logger.warn(`🍎 [iOS异常] ⚠️ OAuth完成${Math.round(timeSinceToken/1000)}秒后仍无HA API请求!`);
          Logger.warn(`🍎 [iOS异常] 可能原因: CORS限制、证书问题、App内部错误`);
          Logger.warn(`🍎 [iOS异常] 建议: 检查iOS Console日志、重装App、检查网络设置`);
        }
      }
    }
    
    // 检查请求模式
    Logger.debug(`🍎 [iOS模式] 最近请求类型: ${types.join(' → ')}`);
  }

  /**
   * iOS专用响应内容分析
   */
  analyzeiOSResponse(message, proxyRes, responseBody) {
    Logger.info(`🍎 [iOS响应] *** 分析iOS应用响应内容 ***`);
    Logger.info(`🍎 [iOS响应] 状态码: ${proxyRes.statusCode}`);
    Logger.info(`🍎 [iOS响应] Content-Type: ${proxyRes.headers['content-type'] || '未设置'}`);
    Logger.info(`🍎 [iOS响应] 响应大小: ${responseBody.length} bytes`);
    
    // 检查关键API响应
    if (message.url.includes('/api/config')) {
      Logger.info(`🍎 [iOS配置] HA配置API响应 - iOS App应从此获取HA实例信息`);
      if (responseBody.length > 0) {
        try {
          const config = JSON.parse(responseBody.toString());
          Logger.info(`🍎 [iOS配置] HA版本: ${config.version || '未知'}`);
          Logger.info(`🍎 [iOS配置] 配置项数量: ${Object.keys(config).length}`);
        } catch (e) {
          Logger.warn(`🍎 [iOS配置] 配置响应解析失败: ${e.message}`);
        }
      } else {
        Logger.error(`🍎 [iOS配置] ⚠️ 配置响应为空! iOS App将无法获取HA信息`);
      }
    }
    
    if (message.url.includes('/api/states')) {
      Logger.info(`🍎 [iOS状态] HA状态API响应 - iOS App应从此获取实体状态`);
      if (responseBody.length > 0) {
        try {
          const states = JSON.parse(responseBody.toString());
          if (Array.isArray(states)) {
            Logger.info(`🍎 [iOS状态] 实体数量: ${states.length}`);
          }
        } catch (e) {
          Logger.warn(`🍎 [iOS状态] 状态响应解析失败: ${e.message}`);
        }
      } else {
        Logger.error(`🍎 [iOS状态] ⚠️ 状态响应为空! iOS App将看不到任何实体`);
      }
    }
    
    // 检查token响应
    if (message.url.includes('/auth/token')) {
      if (responseBody.length > 0) {
        try {
          const tokenData = JSON.parse(responseBody.toString());
          if (tokenData.access_token) {
            Logger.info(`🍎 [iOS Token] ✅ access_token获取成功，长度: ${tokenData.access_token.length}`);
          }
          if (tokenData.refresh_token) {
            Logger.info(`🍎 [iOS Token] ✅ refresh_token获取成功，长度: ${tokenData.refresh_token.length}`);
          }
          if (tokenData.token_type) {
            Logger.info(`🍎 [iOS Token] Token类型: ${tokenData.token_type}`);
          }
        } catch (e) {
          Logger.warn(`🍎 [iOS Token] Token响应解析失败: ${e.message}`);
          Logger.warn(`🍎 [iOS Token] 原始响应: ${responseBody.toString().substring(0, 200)}...`);
        }
      }
    }
    
    // 检查错误响应
    if (proxyRes.statusCode >= 400) {
      Logger.error(`🍎 [iOS错误] ⚠️ iOS App收到错误响应: ${proxyRes.statusCode}`);
      if (responseBody.length > 0) {
        Logger.error(`🍎 [iOS错误] 错误内容: ${responseBody.toString().substring(0, 500)}`);
      }
      
      // 特定错误分析
      if (proxyRes.statusCode === 401) {
        Logger.error(`🍎 [iOS错误] 认证失败 - 可能token无效或过期`);
      } else if (proxyRes.statusCode === 403) {
        Logger.error(`🍎 [iOS错误] 权限拒绝 - 可能用户权限不足`);
      } else if (proxyRes.statusCode >= 500) {
        Logger.error(`🍎 [iOS错误] HA服务器内部错误`);
      }
    }
    
    // 检查响应头中可能的问题
    this.checkiOSCompatibilityHeaders(proxyRes.headers);
  }
  
  /**
   * 检查iOS兼容性头部
   */
  checkiOSCompatibilityHeaders(headers) {
    const issues = [];
    
    // 检查CORS头
    if (!headers['access-control-allow-origin']) {
      issues.push('缺少CORS Origin头');
    }
    
    // 检查Content-Type
    if (!headers['content-type']) {
      issues.push('缺少Content-Type头');
    }
    
    // 检查是否有可能阻止iOS的安全头
    if (headers['x-frame-options'] === 'DENY') {
      issues.push('X-Frame-Options可能过于严格');
    }
    
    if (headers['content-security-policy']) {
      issues.push('存在CSP头，可能限制iOS应用');
    }
    
    if (issues.length > 0) {
      Logger.warn(`🍎 [iOS兼容性] 潜在问题: ${issues.join(', ')}`);
    } else {
      Logger.info(`🍎 [iOS兼容性] ✅ 响应头兼容性良好`);
    }
  }
}

module.exports = HttpProxyHandler
