/**
 * 调试隧道连接问题
 * 分析隧道代理连接失败的具体原因
 */

const WebSocket = require('ws');
const net = require('net');

class TunnelConnectionDebugger {
  constructor() {
    this.startTime = Date.now();
  }

  log(category, message, level = 'info') {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const levelIcons = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    };
    console.log(`${levelIcons[level]} [${timestamp}] [${category}] (+${elapsed}ms) ${message}`);
  }

  /**
   * 测试基础网络连接
   */
  async testBasicConnectivity() {
    this.log('NETWORK', '测试基础网络连接性...', 'info');

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        this.log('NETWORK', '连接超时 (10秒)', 'error');
        resolve(false);
      }, 10000);

      socket.connect(3081, '110.41.20.134', () => {
        clearTimeout(timeout);
        this.log('NETWORK', '基础TCP连接成功', 'success');
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        this.log('NETWORK', `连接失败: ${error.message}`, 'error');
        resolve(false);
      });
    });
  }

  /**
   * 测试HTTP连接
   */
  async testHttpConnection() {
    this.log('HTTP', '测试HTTP连接...', 'info');

    return new Promise((resolve) => {
      const http = require('http');

      const req = http.request({
        hostname: '110.41.20.134',
        port: 3081,
        path: '/',
        method: 'GET',
        timeout: 10000
      }, (res) => {
        this.log('HTTP', `HTTP响应: ${res.statusCode} ${res.statusMessage}`, 'success');
        res.on('data', () => { }); // 消费数据
        res.on('end', () => {
          resolve(true);
        });
      });

      req.on('error', (error) => {
        this.log('HTTP', `HTTP请求失败: ${error.message}`, 'error');
        resolve(false);
      });

      req.on('timeout', () => {
        this.log('HTTP', 'HTTP请求超时', 'error');
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * 测试WebSocket连接（详细版本）
   */
  async testWebSocketConnection() {
    this.log('WS', '测试WebSocket连接...', 'info');

    return new Promise((resolve) => {
      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket', {
        timeout: 15000,
        headers: {
          'User-Agent': 'Tunnel-Debug-Client/1.0'
        }
      });

      let connected = false;
      let messageCount = 0;
      const messages = [];

      const cleanup = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };

      // 15秒超时
      const timeout = setTimeout(() => {
        if (!connected) {
          this.log('WS', 'WebSocket连接超时 (15秒)', 'error');
        }
        cleanup();
        resolve({
          connected,
          messageCount,
          messages,
          error: connected ? null : 'Connection timeout'
        });
      }, 15000);

      ws.on('open', () => {
        connected = true;
        this.log('WS', 'WebSocket连接建立成功', 'success');
      });

      ws.on('message', (data) => {
        messageCount++;
        const elapsed = Date.now() - this.startTime;

        try {
          const message = JSON.parse(data.toString());
          messages.push(message);
          this.log('WS', `收到消息 #${messageCount} (+${elapsed}ms): ${message.type}`, 'info');

          if (message.type === 'auth_required') {
            // 立即发送认证
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "debug_test_token_12345"
              };

              this.log('WS', '发送认证消息...', 'info');
              ws.send(JSON.stringify(authMessage));
            }, 100);
          }
        } catch (e) {
          this.log('WS', `收到非JSON消息 #${messageCount}: ${data.toString()}`, 'warning');
          messages.push({ raw: data.toString() });
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        const elapsed = Date.now() - this.startTime;
        this.log('WS', `连接关闭 (+${elapsed}ms): 代码=${code}, 原因=${reason || '无'}`, code === 1000 ? 'info' : 'warning');

        resolve({
          connected,
          messageCount,
          messages,
          closeCode: code,
          closeReason: reason?.toString() || null,
          error: null
        });
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.log('WS', `连接错误: ${error.message}`, 'error');

        resolve({
          connected: false,
          messageCount,
          messages,
          error: error.message
        });
      });
    });
  }

  /**
   * 运行完整诊断
   */
  async runFullDiagnosis() {
    console.log('🔍 隧道连接诊断开始');
    console.log('='.repeat(60));

    // 1. 基础网络连接
    const networkOk = await this.testBasicConnectivity();

    if (!networkOk) {
      console.log('\n❌ 基础网络连接失败，无法继续测试');
      return;
    }

    // 2. HTTP连接
    this.log('TEST', '等待2秒后测试HTTP...', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const httpOk = await this.testHttpConnection();

    // 3. WebSocket连接
    this.log('TEST', '等待2秒后测试WebSocket...', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const wsResult = await this.testWebSocketConnection();

    // 结果汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 诊断结果汇总:');
    console.log('='.repeat(60));

    console.log(`基础网络连接: ${networkOk ? '✅ 成功' : '❌ 失败'}`);
    console.log(`HTTP连接: ${httpOk ? '✅ 成功' : '❌ 失败'}`);
    console.log(`WebSocket连接: ${wsResult.connected ? '✅ 成功' : '❌ 失败'}`);

    if (wsResult.error) {
      console.log(`WebSocket错误: ${wsResult.error}`);
    }

    if (wsResult.closeCode) {
      console.log(`WebSocket关闭代码: ${wsResult.closeCode}`);
    }

    console.log(`WebSocket消息数: ${wsResult.messageCount}`);

    if (wsResult.messages.length > 0) {
      console.log('\n📨 收到的消息:');
      wsResult.messages.forEach((msg, i) => {
        if (msg.type) {
          console.log(`  ${i + 1}. ${msg.type}`);
        } else {
          console.log(`  ${i + 1}. 原始: ${msg.raw}`);
        }
      });
    }

    // 问题分析
    console.log('\n🔧 问题分析:');
    if (!networkOk) {
      console.log('❌ 网络连接问题 - 检查网络配置或防火墙');
    } else if (!httpOk) {
      console.log('❌ HTTP服务问题 - 隧道服务器可能未运行');
    } else if (!wsResult.connected) {
      console.log('❌ WebSocket升级失败 - 检查隧道服务器WebSocket配置');
    } else if (wsResult.messageCount === 0) {
      console.log('⚠️  连接成功但无消息 - 可能隧道客户端未连接');
    } else if (wsResult.messageCount === 1) {
      console.log('⚠️  只收到auth_required，auth_invalid消息丢失');
    } else {
      console.log('✅ 连接和消息传输正常');
    }

    console.log('\n🎯 建议操作:');
    if (wsResult.messageCount <= 1) {
      console.log('1. 检查tunnel-proxy是否正在运行');
      console.log('2. 检查tunnel-proxy日志中的认证和连接状态');
      console.log('3. 验证tunnel-proxy到Home Assistant的连接');
      console.log('4. 检查修复代码是否正确部署');
    }
  }
}

// 运行诊断
const tunnelDebugger = new TunnelConnectionDebugger();
tunnelDebugger.runFullDiagnosis().catch(console.error);
