const WebSocket = require('ws')
const http = require('http')
const crypto = require('crypto')
const { isBinaryFile } = require('isbinaryfile')
const Logger = require('./logger')
const { getConfig, ConfigManager } = require('./config')
const TunnelClient = require('../tunnel-client')
const HANetworkDiscovery = require('./ha-network-discovery')

/**
 * 隧道连接管理类
 */
class TunnelManager {
  constructor() {
    // 确保配置已加载
    try {
      ConfigManager.loadConfig();
    } catch (error) {
      Logger.debug('配置可能已经加载或配置文件不存在，继续初始化');
    }

    this.lastSuccessfulHost = null
    this.wsConnections = new Map() // WebSocket连接存储
    this.tunnelClient = null
    this.connectionStatus = 'disconnected'
    this.lastHeartbeat = null
    this.haDiscovery = new HANetworkDiscovery() // 网络发现实例
    this.discoveredHosts = [] // 发现的主机列表
    this.lastDiscoveryTime = null // 上次发现时间
    this.discoveryCache = new Map() // 发现结果缓存
  }
  async connectToServer() {
    return new Promise((resolve, reject) => {
      try {
        const config = getConfig()
        const serverHost = ConfigManager.getServerHost()

        Logger.info(`正在连接到中转服务器: ${serverHost}:${config.server_port}`)
        Logger.info(`连接方式: ${ConfigManager.getConnectionInfo()}`)

        this.tunnelClient = new TunnelClient({
          host: serverHost,
          port: config.server_port,
          username: config.username,
          password: config.password,
          clientId: config.client_id,
        })

        this.tunnelClient.on('connected', () => {
          Logger.info('隧道连接建立成功')
          this.connectionStatus = 'connecting'
        })

        this.tunnelClient.on('authenticated', () => {
          Logger.info('服务器认证成功')
          this.connectionStatus = 'connected'
          this.lastHeartbeat = Date.now()
          resolve()
        })

        this.tunnelClient.on('auth_failed', (reason) => {
          Logger.error(`服务器认证失败: ${reason}`)
          this.connectionStatus = 'auth_failed'
          reject(new Error(`认证失败: ${reason}`))
        })

        this.tunnelClient.on('disconnected', () => {
          Logger.warn('隧道连接已断开')
          this.connectionStatus = 'disconnected'
        })

        this.tunnelClient.on('reconnecting', (attempt) => {
          Logger.info(`正在尝试重连 (${attempt}/10)`)
          this.connectionStatus = 'reconnecting'
        })

        this.tunnelClient.on('error', (error) => {
          Logger.error(`隧道连接错误: ${error.message}`)
          this.connectionStatus = 'error'
          reject(error)
        })

        this.tunnelClient.on('proxy_request', (message) => {
          this.handleProxyRequest(message)
        })

        this.tunnelClient.on('websocket_upgrade', (message) => {
          this.handleWebSocketUpgrade(message)
        })

        this.tunnelClient.on('websocket_data', (message) => {
          this.handleWebSocketData(message)
        })

        this.tunnelClient.on('websocket_close', (message) => {
          Logger.error(`websocket_close: ${JSON.stringify(message)}`)
          this.handleWebSocketClose(message)
        })

        this.tunnelClient.connect()
      } catch (error) {
        Logger.error(`隧道连接失败: ${error.message}`)
        reject(error)
      }
    })
  }

  handleProxyRequest(message) {
    this.smartConnectToHA(message)
  }
  handleWebSocketUpgrade(message) {
    Logger.info(
      `🔄 处理WebSocket升级请求: ${message.upgrade_id} ${message.url}`
    )
    this.smartConnectWebSocketToHA(message)
  }
  handleWebSocketData(message) {
    const { upgrade_id, data } = message
    const wsConnection = this.wsConnections.get(upgrade_id)
    if (!wsConnection || !wsConnection.socket) {
      Logger.warn(`未找到WebSocket连接: ${upgrade_id}`)
      return
    }

    try {
      // 将 base64 解码为 Buffer
      const binaryData = Buffer.from(data, 'base64')
      // 判断是否为二进制消息
      const isBinaryMessage = this.isBinaryWebSocketMessage(binaryData)
      if (isBinaryMessage) {
        // 二进制消息直接发送
        Logger.info(`📦 发送二进制WebSocket数据到HA: ${upgrade_id}, 大小: ${binaryData.length} bytes`)
        wsConnection.socket.send(binaryData)
      } else {
        // 文本消息，尝试解码为UTF-8字符串
        const stringData = binaryData.toString('utf8')

        // 验证是否为有效的UTF-8字符串
        if (this.isValidUTF8String(stringData)) {
          // 尝试解析JSON以获取更多信息
          try {
            const jsonMessage = JSON.parse(stringData)
            Logger.info(`✅ WebSocket JSON数据已发送到HA: ${upgrade_id}, 类型: ${jsonMessage.type}`)
          } catch (jsonError) {
            Logger.info(`📄 WebSocket文本数据已发送到HA: ${upgrade_id}, 长度: ${stringData.length}`)
          }

          // 发送文本数据
          wsConnection.socket.send(stringData)
        } else {
          // UTF-8解码失败，当作二进制数据处理
          Logger.warn(`⚠️ UTF-8解码失败，作为二进制数据发送: ${upgrade_id}`)
          wsConnection.socket.send(binaryData)
        }
      }
    } catch (error) {
      Logger.error(`WebSocket数据转发失败: ${error.message}`)
    }
  }
  /**
   * 检测Buffer是否包含二进制数据（同步版本）
   * @param {Buffer} buffer - 要检查的数据缓冲区
   * @returns {boolean} - true表示二进制数据，false表示文本数据
   */
  isBinaryWebSocketMessage(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      // 快速检查：空字节强烈表示二进制数据
      if (buffer.includes(0x00)) {
        return true;
      }

      // 检查常见的二进制文件头
      const binarySignatures = [
        [0x89, 0x50, 0x4E, 0x47], // PNG
        [0xFF, 0xD8, 0xFF],        // JPEG
        [0x47, 0x49, 0x46],        // GIF
        [0x52, 0x49, 0x46, 0x46], // RIFF (WAV, AVI等)
        [0x50, 0x4B, 0x03, 0x04], // ZIP
        [0x25, 0x50, 0x44, 0x46], // PDF
        [0x7F, 0x45, 0x4C, 0x46], // ELF
        [0x4D, 0x5A],              // PE/COFF (.exe, .dll)
      ];

      // 检查文件头
      for (const signature of binarySignatures) {
        if (buffer.length >= signature.length) {
          let matches = true;
          for (let i = 0; i < signature.length; i++) {
            if (buffer[i] !== signature[i]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            return true;
          }
        }
      }

      // 统计控制字符（优先检查，因为这是强指标）
      let controlCharCount = 0;
      const sampleSize = Math.min(buffer.length, 1024);

      for (let i = 0; i < sampleSize; i++) {
        const byte = buffer[i];

        // 允许的控制字符：换行、回车、制表符
        if (byte === 0x0A || byte === 0x0D || byte === 0x09) {
          continue;
        }

        // 其他控制字符
        if (byte < 32) {
          controlCharCount++;
        }
      }

      // 如果控制字符超过15%，认为是二进制数据
      const controlCharRatio = controlCharCount / sampleSize;
      if (controlCharRatio > 0.15) {
        return true;
      }

      // 检查是否为有效的UTF-8文本
      if (this.isValidUTF8String(buffer)) {
        return false; // 有效的UTF-8文本不是二进制数据
      }

      // 如果到这里还没确定，说明可能是编码有问题的数据，认为是二进制
      return true;

    } catch (error) {
      // 如果出错，回退到简单的空字节检查
      Logger.error(`二进制检测错误: ${error.message}`);
      return buffer.includes(0x00);
    }
  }

  /**
   * 异步检测Buffer是否包含二进制数据（使用 isbinaryfile 库）
   * @param {Buffer} buffer - 要检查的数据缓冲区
   * @returns {Promise<boolean>} - true表示二进制数据，false表示文本数据
   */
  async isBinaryWebSocketMessageAsync(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      return await isBinaryFile(buffer);
    } catch (error) {
      Logger.error(`异步二进制检测错误: ${error.message}`);
      return buffer.includes(0x00);
    }
  }
  /**
   * 验证是否为有效的UTF-8字符串或Buffer
   * @param {string|Buffer} input - 要验证的字符串或Buffer
   * @returns {boolean} - true表示有效的UTF-8
   */
  isValidUTF8String(input) {
    try {
      let text;
      let buffer;

      if (Buffer.isBuffer(input)) {
        buffer = input;
        text = buffer.toString('utf8');
      } else if (typeof input === 'string') {
        text = input;
        buffer = Buffer.from(text, 'utf8');
      } else {
        return false;
      }

      // 检查字符串是否包含替换字符（�），这通常表示UTF-8解码失败
      if (text.includes('\uFFFD')) {
        return false;
      }

      // 检查字符串长度
      if (text.length === 0) {
        return true;
      }

      // 尝试重新编码验证一致性
      if (Buffer.isBuffer(input)) {
        const reencoded = Buffer.from(text, 'utf8');
        return reencoded.equals(buffer);
      } else {
        const reencoded = Buffer.from(text, 'utf8').toString('utf8');
        return reencoded === text;
      }
    } catch (error) {
      return false;
    }
  }

  handleWebSocketClose(message) {
    const { upgrade_id } = message
    const wsConnection = this.wsConnections.get(upgrade_id)

    if (wsConnection) {
      if (wsConnection.socket) {
        wsConnection.socket.destroy()
      }
      this.wsConnections.delete(upgrade_id)
    }
  }
  async smartConnectToHA(message) {
    // 智能获取目标主机列表
    const discoveredHosts = await this.getTargetHosts();

    // 如果有上次成功的主机，优先尝试
    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...discoveredHosts.filter((h) => h !== this.lastSuccessfulHost),
      ]
      : discoveredHosts;

    // 只在实际发现新主机时显示日志，避免使用缓存时的重复日志
    const isRecentDiscovery = this.lastDiscoveryTime && 
      (Date.now() - this.lastDiscoveryTime) < 2000; // 发现后2秒内的连接尝试
    
    if (isRecentDiscovery) {
      Logger.debug(`🔍 尝试连接 ${targetHosts.length} 个潜在的 Home Assistant 主机...`);
    } else {
      Logger.info(`🔍 尝试连接 ${targetHosts.length} 个潜在的 Home Assistant 主机...`);
    }

    for (const hostname of targetHosts) {
      try {
        Logger.debug(`🔗 尝试连接: ${hostname}`);
        const success = await this.attemptHAConnection(message, hostname)
        if (success) {
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
            Logger.info(`✅ 成功连接到 Home Assistant: ${hostname}`);

            // 更新发现缓存中的成功信息
            const hostInfo = this.discoveredHosts.find(h => h.host === hostname);
            if (hostInfo) {
              hostInfo.lastSuccessfulConnection = Date.now();
              hostInfo.confidence = Math.min(hostInfo.confidence + 10, 100);
            }
          }
          return
        }
      } catch (error) {
        Logger.debug(`❌ 连接失败 ${hostname}: ${error.message}`);
        continue
      }
    }

    this.sendDetailedError(message, targetHosts)
  }
  /**
   * 获取目标主机列表 - 使用智能发现
   */
  async getTargetHosts() {
    // 检查是否需要重新发现（缓存5分钟）
    const cacheTimeout = 5 * 60 * 1000; // 5分钟
    const now = Date.now();

    if (this.lastDiscoveryTime &&
      (now - this.lastDiscoveryTime) < cacheTimeout &&
      this.discoveredHosts.length > 0) {
      Logger.debug('🔄 使用缓存的主机发现结果');
      return this.discoveredHosts.map(h => h.host);
    }

    try {
      Logger.info('🚀 开始智能发现 Home Assistant 实例...');
      const discoveryResults = await this.haDiscovery.discoverHomeAssistant();

      // 更新发现结果
      this.discoveredHosts = discoveryResults.discovered;
      this.lastDiscoveryTime = now;

      // 记录发现结果
      if (this.discoveredHosts.length > 0) {
        Logger.info(`✅ 发现 ${this.discoveredHosts.length} 个 Home Assistant 实例:`);
        this.discoveredHosts.forEach((host, index) => {
          Logger.info(`   ${index + 1}. ${host.host}:${host.port} (置信度: ${host.confidence}%, 方法: ${host.discoveryMethod})`);
        });

        if (discoveryResults.recommendedHost) {
          Logger.info(`🎯 推荐主机: ${discoveryResults.recommendedHost.host}:${discoveryResults.recommendedHost.port}`);
          // 更新最佳主机
          this.lastSuccessfulHost = discoveryResults.recommendedHost.host;
        }
      } else {
        Logger.warn('⚠️  未发现任何 Home Assistant 实例，使用默认主机列表');
      }

      // 生成主机列表（包含发现的和默认的）
      const discoveredHostList = this.discoveredHosts.map(h => h.host);
      const defaultHosts = this.getDefaultTargetHosts();

      // 合并并去重，优先使用发现的主机
      const allHosts = [...new Set([...discoveredHostList, ...defaultHosts])];

      return allHosts;

    } catch (error) {
      Logger.error(`智能发现失败: ${error.message}，使用默认主机列表`);
      return this.getDefaultTargetHosts();
    }
  }

  /**
   * 获取默认目标主机列表（作为后备）
   */
  getDefaultTargetHosts() {
    return [
      '127.0.0.1',
      'localhost',
      '192.168.6.170',  // 当前已知的工作地址
      'hassio.local',
      'homeassistant.local',
      '172.30.32.2',    // Docker 常见地址
      '192.168.6.1',
      '192.168.1.170',
      '192.168.1.100',
      '192.168.0.100',
      '10.0.0.170',
      '10.0.0.100'
    ];
  }

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

      options.headers['host'] = `${hostname}:${config.local_ha_port}`
      delete options.headers['connection']
      delete options.headers['content-length']
      delete options.headers['transfer-encoding']
      delete options.headers['accept-encoding']

      if (!options.headers['user-agent']) {
        options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.0.8'
      }

      const proxyReq = http.request(options, (proxyRes) => {
        let responseBody = Buffer.alloc(0)
        proxyRes.on('data', (chunk) => {
          responseBody = Buffer.concat([responseBody, chunk])
        })
        proxyRes.on('end', () => {
          const response = {
            type: 'proxy_response',
            request_id: message.request_id,
            status_code: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody.toString('base64'),
          }

          this.tunnelClient.send(response)
          resolve(true)
        })
      })

      proxyReq.on('error', (error) => {
        reject(error)
      })

      proxyReq.on('timeout', () => {
        proxyReq.destroy()
        reject(new Error('连接超时'))
      })

      if (message.body) {
        proxyReq.write(message.body)
      }

      proxyReq.end()
    })
  }

  sendDetailedError(message, attemptedHosts) {
    const config = getConfig()
    const errorResponse = {
      type: 'proxy_response',
      request_id: message.request_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `
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
          .map(
            (host) =>
              `<li><span class="code">${host}:${config.local_ha_port}</span></li>`
          )
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
                  <li><strong>插件版本:</strong> <span class="code">1.0.7</span></li>
                </ul>
              </div>
            </div>
          </body>
        </html>
      `,
    }

    this.tunnelClient.send(errorResponse)
    Logger.error(`发送详细错误页面: ${message.request_id}`)
  }
  async smartConnectWebSocketToHA(message) {
    // 智能获取目标主机列表
    const discoveredHosts = await this.getTargetHosts();

    const targetHosts = this.lastSuccessfulHost
      ? [
        this.lastSuccessfulHost,
        ...discoveredHosts.filter((h) => h !== this.lastSuccessfulHost),
      ]
      : discoveredHosts;

    // 只在实际发现新主机时显示日志，避免使用缓存时的重复日志
    const isRecentDiscovery = this.lastDiscoveryTime && 
      (Date.now() - this.lastDiscoveryTime) < 2000; // 发现后2秒内的连接尝试
    
    if (isRecentDiscovery) {
      Logger.debug(`🔍 尝试 WebSocket 连接 ${targetHosts.length} 个潜在的 Home Assistant 主机...`);
    } else {
      Logger.info(`🔍 尝试 WebSocket 连接 ${targetHosts.length} 个潜在的 Home Assistant 主机...`);
    }

    for (const hostname of targetHosts) {
      try {
        const success = await this.attemptWebSocketConnection(message, hostname)
        if (success) {
          Logger.info(
            `✅ WebSocket成功连接到Home Assistant: ${hostname}:${getConfig().local_ha_port}`
          )
          if (this.lastSuccessfulHost !== hostname) {
            this.lastSuccessfulHost = hostname
            Logger.info(`🎯 记住成功地址: ${hostname}`)

            // 更新发现缓存中的成功信息
            const hostInfo = this.discoveredHosts.find(h => h.host === hostname);
            if (hostInfo) {
              hostInfo.lastSuccessfulConnection = Date.now();
              hostInfo.confidence = Math.min(hostInfo.confidence + 10, 100);
            }
          }
          return
        }
      } catch (error) {
        Logger.debug(`❌ WebSocket 连接失败 ${hostname}: ${error.message}`);
        continue
      }
    }

    this.sendWebSocketUpgradeError(message, targetHosts)
  }

  attemptWebSocketConnection(message, hostname) {
    return new Promise((resolve, reject) => {
      const config = getConfig()
      const protocol = config.local_ha_port === 443 ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${hostname}:${config.local_ha_port}${message.url}`

      const headers = { ...message.headers }
      headers['host'] = `${hostname}:${config.local_ha_port}`
      delete headers['connection']
      delete headers['upgrade']

      const ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 5000,
      })

      let authenticationState = {
        required: false,
        response: null,
        successful: false
      }

      let resolved = false

      ws.on('open', () => {
        if (resolved) return
        resolved = true
        Logger.info(
          `✅ WebSocket连接建立成功: ${hostname}:${config.local_ha_port}`
        )

        this.wsConnections.set(message.upgrade_id, {
          socket: ws,
          hostname: hostname,
          timestamp: Date.now(),
        })

        const websocketKey = message.headers['sec-websocket-key']
        const websocketAccept = websocketKey
          ? crypto
            .createHash('sha1')
            .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64')
          : 'dummy-accept-key'

        const response = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 101,
          headers: {
            upgrade: 'websocket',
            connection: 'upgrade',
            'sec-websocket-accept': websocketAccept,
          },
        }
        this.tunnelClient.send(response)
        Logger.info(
          `📤 发送WebSocket升级响应: ${message.upgrade_id}, 状态: 101`
        )

        ws.on('message', (data) => {
          Logger.info(
            `📥 WebSocket收到HA消息: ${message.upgrade_id}, 长度: ${data.length}, 内容: ${data.toString()}`
          )

          let isAuthMessage = false
          let messageType = null
          try {
            const parsed = JSON.parse(data.toString())
            messageType = parsed.type
            if (parsed.type === 'auth_required') {
              Logger.info(`🔐 HA要求WebSocket认证: ${message.upgrade_id}`)
              authenticationState.required = true
              isAuthMessage = true
            } else if (parsed.type === 'auth_invalid') {
              Logger.warn(`❌ WebSocket认证失败: ${message.upgrade_id} - 请检查浏览器中的访问令牌是否有效`)
              Logger.info(`💡 提示：需要在HA中生成长期访问令牌，并在浏览器中正确配置`)
              authenticationState.response = 'invalid'
              authenticationState.successful = false
              isAuthMessage = true
            } else if (parsed.type === 'auth_ok') {
              Logger.info(`✅ WebSocket认证成功: ${message.upgrade_id}`)
              authenticationState.response = 'ok'
              authenticationState.successful = true
              isAuthMessage = true
            }
          } catch (e) {
            // 正常的非JSON消息
          }

          const response = {
            type: 'websocket_data',
            upgrade_id: message.upgrade_id,
            data: data.toString('base64'),
          }

          try {
            if (isAuthMessage) {
              // 认证消息使用同步发送，并添加多重保障
              Logger.info(`🔐 准备立即发送认证消息: ${messageType} - ${message.upgrade_id}`)

              // 1. 立即发送消息
              const sendSuccess = this.tunnelClient.send(response)
              if (!sendSuccess) {
                Logger.error(`❌ 认证消息发送失败: ${message.upgrade_id}`)
                return
              }

              // 2. 强制刷新网络缓冲区
              setImmediate(() => {
                if (this.tunnelClient.socket && typeof this.tunnelClient.socket._flush === 'function') {
                  this.tunnelClient.socket._flush()
                }

                // 3. 使用cork/uncork机制确保立即传输
                if (this.tunnelClient.socket && typeof this.tunnelClient.socket.uncork === 'function') {
                  this.tunnelClient.socket.cork()
                  process.nextTick(() => {
                    this.tunnelClient.socket.uncork()
                  })
                }
              })

              // 4. 对于auth_ok和auth_invalid消息，添加额外的确认机制
              if (messageType === 'auth_ok' || messageType === 'auth_invalid') {
                setTimeout(() => {
                  Logger.info(`🔄 再次确认${messageType}消息已发送: ${message.upgrade_id}`)
                  // 检查连接状态
                  if (this.tunnelClient && this.tunnelClient.isConnected) {
                    Logger.info(`✅ 隧道连接状态正常，${messageType}消息应已传输`)
                  } else {
                    Logger.warn(`⚠️  隧道连接异常，${messageType}消息可能未完全传输`)
                  }
                }, 50)
              }

              Logger.info(`📤 已立即转发WebSocket认证消息: ${message.upgrade_id}`)
            } else {
              this.tunnelClient.send(response)
              Logger.info(`📤 已转发WebSocket消息: ${message.upgrade_id}`)
            }
          } catch (error) {
            Logger.error(`❌ WebSocket消息转发失败: ${error.message}`)
            Logger.error(error.stack)
          }
        })

        resolve(true)
      })

      ws.on('error', (error) => {
        Logger.error(`🔴 ws error: ${error}`)
        if (resolved) return
        resolved = true

        const errorResponse = {
          type: 'websocket_upgrade_response',
          upgrade_id: message.upgrade_id,
          status_code: 502,
          headers: {},
        }
        this.tunnelClient.send(errorResponse)
        reject(error)
      })

      ws.on('close', (code, reason) => {
        Logger.info(
          `🔴 WebSocket连接关闭: ${hostname}, upgrade_id: ${message.upgrade_id}, 代码: ${code}, 原因: ${reason || '无'}`
        )

        let closeAnalysis = ''
        let delayMs = 1000
        let needsAuthInvalidCompensation = false

        if (authenticationState.required) {
          if (authenticationState.response === 'invalid') {
            closeAnalysis = 'HA在认证失败后正常关闭连接（安全机制）'
            delayMs = 1500
          } else if (authenticationState.response === 'ok') {
            closeAnalysis = '认证成功后的连接关闭（可能是客户端主动断开或其他原因）'
            delayMs = 2000
          } else if (authenticationState.response === null && code === 1000) {
            closeAnalysis = 'HA在认证过程中关闭连接（可能是auth_invalid消息丢失或网络问题）'
            needsAuthInvalidCompensation = true
            delayMs = 1500
          } else {
            closeAnalysis = '认证过程中的异常关闭'
            delayMs = 1000
          }
        } else {
          if (code === 1000) {
            closeAnalysis = '正常关闭（可能是客户端主动断开）'
          } else if (code === 1006) {
            closeAnalysis = '异常关闭（网络问题或服务器错误）'
          } else {
            closeAnalysis = `关闭代码: ${code}`
          }
        }
        Logger.info(`ℹ️  ${closeAnalysis}`)        // 特殊处理：当检测到可能的

        // 正常的关闭处理
        setTimeout(() => {
          this.sendCloseNotification(message.upgrade_id)
        }, delayMs)
      })

      // 设置连接超时
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          reject(new Error('WebSocket连接超时'))
        }
      }, 5000)
    })
  }

  sendCloseNotification(upgrade_id) {
    this.wsConnections.delete(upgrade_id)

    const response = {
      type: 'websocket_close',
      upgrade_id: upgrade_id,
    }

    try {
      this.tunnelClient.send(response)
      Logger.info(`📤 通知服务器WebSocket连接关闭: ${upgrade_id}`)
    } catch (error) {
      Logger.error(`❌ 发送关闭通知失败: ${error.message}`)
    }
  }

  sendWebSocketUpgradeError(message, attemptedHosts) {
    const errorResponse = {
      type: 'websocket_upgrade_response',
      upgrade_id: message.upgrade_id,
      status_code: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }

    this.tunnelClient.send(errorResponse)
    Logger.error(`WebSocket升级失败，尝试的主机: ${attemptedHosts.join(', ')}`)
  }
  async testLocalConnection() {
    Logger.info('🧪 测试本地 Home Assistant 连接...');

    try {
      const targetHosts = await this.getTargetHosts();

      for (const hostname of targetHosts) {
        try {
          const success = await this.testSingleHost(hostname)
          if (success) {
            this.lastSuccessfulHost = hostname
            Logger.info(`✅ 测试连接成功: ${hostname}`);
            return true
          }
        } catch (error) {
          Logger.debug(`❌ 测试连接失败: ${hostname} - ${error.message}`);
        }
      }

      Logger.warn('⚠️  所有主机测试连接失败');
      return false;

    } catch (error) {
      Logger.error(`测试连接过程出错: ${error.message}`);
      return false;
    }
  }

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
          'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8',
        },
      }

      const req = http.request(options, (res) => {
        // 收集响应数据以验证是否为HA
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
          // 限制数据大小以避免内存问题
          if (data.length > 5120) { // 5KB足够检测HA特征
            req.destroy();
          }
        });

        res.on('end', () => {
          // 验证响应是否真的是Home Assistant
          if (this.isHomeAssistantResponse(res, data)) {
            resolve(true);
          } else {
            reject(new Error(`非Home Assistant服务 (状态码: ${res.statusCode})`));
          }
        });
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
   * 简化的HA响应验证（复用发现模块的逻辑）
   */
  isHomeAssistantResponse(response, body) {
    if (!response || response.statusCode < 200 || response.statusCode >= 500) {
      return false;
    }

    const content = (body || '').toLowerCase();

    // 检查关键的HA标识
    return content.includes('home assistant') ||
      content.includes('homeassistant') ||
      content.includes('hass-frontend') ||
      content.includes('home-assistant-main') ||
      content.includes('frontend_latest');
  }

  getStatus() {
    if (this.tunnelClient) {
      const status = this.tunnelClient.getStatus()
      return {
        connected: status.connected,
        authenticated: status.authenticated,
        last_heartbeat: status.last_heartbeat,
        connection_attempts: status.connection_attempts,
        status: this.connectionStatus,
        last_successful_host: this.lastSuccessfulHost,
      }
    }
    return {
      connected: false,
      authenticated: false,
      last_heartbeat: null,
      connection_attempts: 0,
      status: this.connectionStatus,
      last_successful_host: this.lastSuccessfulHost,
    }
  }
  disconnect() {
    if (this.tunnelClient) {
      this.tunnelClient.disconnect()
      this.tunnelClient = null
    }
    this.connectionStatus = 'disconnected'
  }

  /**
   * 手动触发网络发现
   */
  async triggerNetworkDiscovery() {
    Logger.info('🔍 手动触发网络发现...');
    this.lastDiscoveryTime = null; // 强制重新发现
    this.haDiscovery.clearCache();
    return await this.getTargetHosts();
  }

  /**
   * 获取发现的主机信息
   */
  getDiscoveredHosts() {
    return {
      hosts: this.discoveredHosts,
      lastDiscovery: this.lastDiscoveryTime,
      cacheAge: this.lastDiscoveryTime ? Date.now() - this.lastDiscoveryTime : null,
      recommendedHost: this.lastSuccessfulHost
    };
  }

  /**
   * 设置自定义主机
   */
  addCustomHost(host, port = 8123) {
    const customHost = {
      host: host,
      port: port,
      protocol: 'http',
      confidence: 90,
      discoveryMethod: 'manual',
      lastChecked: Date.now(),
      isCustom: true
    };

    // 添加到发现列表的开头（优先级最高）
    this.discoveredHosts.unshift(customHost);
    Logger.info(`➕ 添加自定义主机: ${host}:${port}`);
  }

  /**
   * 移除自定义主机
   */
  removeCustomHost(host) {
    const originalLength = this.discoveredHosts.length;
    this.discoveredHosts = this.discoveredHosts.filter(h => !(h.host === host && h.isCustom));

    if (this.discoveredHosts.length < originalLength) {
      Logger.info(`➖ 移除自定义主机: ${host}`);
      return true;
    }
    return false;
  }

  /**
   * 获取网络发现统计信息
   */
  getDiscoveryStats() {
    const stats = {
      totalDiscovered: this.discoveredHosts.length,
      byMethod: {},
      avgConfidence: 0,
      lastSuccessfulHost: this.lastSuccessfulHost,
      cacheAge: this.lastDiscoveryTime ? Date.now() - this.lastDiscoveryTime : null
    };

    // 按发现方法分组统计
    for (const host of this.discoveredHosts) {
      const method = host.discoveryMethod || 'unknown';
      stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
    }

    // 计算平均置信度
    if (this.discoveredHosts.length > 0) {
      const totalConfidence = this.discoveredHosts.reduce((sum, host) => sum + (host.confidence || 0), 0);
      stats.avgConfidence = Math.round(totalConfidence / this.discoveredHosts.length);
    }

    return stats;
  }
}

module.exports = TunnelManager
