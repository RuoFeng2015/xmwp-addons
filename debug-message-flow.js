const WebSocket = require('ws');

/**
 * 深度调试WebSocket消息流
 * 追踪消息在整个隧道代理系统中的传输过程
 */
class MessageFlowDebugger {
  constructor() {
    this.messageLog = [];
    this.startTime = Date.now();
  }

  log(source, event, details = '') {
    const elapsed = Date.now() - this.startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      elapsed,
      source,
      event,
      details
    };
    this.messageLog.push(logEntry);
    
    const status = event.includes('成功') || event.includes('收到') ? '✅' : 
                   event.includes('失败') || event.includes('错误') ? '❌' : 
                   event.includes('警告') ? '⚠️' : 'ℹ️';
    
    console.log(`${status} [${elapsed}ms] [${source}] ${event}${details ? ': ' + details : ''}`);
  }

  async testCompleteMessageFlow() {
    console.log('🔍 深度WebSocket消息流调试');
    console.log('============================================================');
    
    try {
      // 步骤1: 测试tunnel-proxy的响应
      await this.testTunnelProxyResponse();
      
      // 等待一下
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 步骤2: 测试直接连接作为对照
      await this.testDirectConnection();
      
      // 分析结果
      this.analyzeResults();
      
    } catch (error) {
      this.log('ERROR', `测试失败: ${error.message}`);
    }
  }

  async testTunnelProxyResponse() {
    return new Promise((resolve) => {
      this.log('PROXY', '开始测试隧道代理连接');
      
      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket', {
        timeout: 10000,
        headers: {
          'User-Agent': 'MessageFlow-Debugger/1.0'
        }
      });

      let messageCount = 0;
      let authResponseReceived = false;
      
      const testTimeout = setTimeout(() => {
        this.log('PROXY', '测试超时，强制关闭连接');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve();
      }, 45000); // 45秒超时

      ws.on('open', () => {
        this.log('PROXY', 'WebSocket连接建立成功');
      });

      ws.on('message', (data) => {
        messageCount++;
        try {
          const message = JSON.parse(data.toString());
          this.log('PROXY', `收到消息 #${messageCount}`, message.type);

          if (message.type === 'auth_required') {
            // 发送认证消息
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "debug_invalid_token_for_flow_test"
              };
              this.log('PROXY', '发送认证消息', 'invalid token for testing');
              ws.send(JSON.stringify(authMessage));
            }, 100);
          } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
            authResponseReceived = true;
            this.log('PROXY', `收到认证响应`, message.type);
          }
        } catch (e) {
          this.log('PROXY', '收到非JSON消息', data.toString().substring(0, 100));
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(testTimeout);
        this.log('PROXY', '连接关闭', `代码=${code}, 原因=${reason || '无'}, 消息数=${messageCount}, 认证响应=${authResponseReceived}`);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(testTimeout);
        this.log('PROXY', '连接错误', error.message);
        resolve();
      });
    });
  }

  async testDirectConnection() {
    return new Promise((resolve) => {
      this.log('DIRECT', '开始测试直接连接对照');
      
      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

      let messageCount = 0;
      let authResponseReceived = false;
      
      const testTimeout = setTimeout(() => {
        this.log('DIRECT', '测试超时，强制关闭连接');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve();
      }, 10000);

      ws.on('open', () => {
        this.log('DIRECT', 'WebSocket连接建立成功');
      });

      ws.on('message', (data) => {
        messageCount++;
        try {
          const message = JSON.parse(data.toString());
          this.log('DIRECT', `收到消息 #${messageCount}`, message.type);

          if (message.type === 'auth_required') {
            // 发送相同的认证消息
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "debug_invalid_token_for_flow_test"
              };
              this.log('DIRECT', '发送认证消息', 'invalid token for testing');
              ws.send(JSON.stringify(authMessage));
            }, 100);
          } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
            authResponseReceived = true;
            this.log('DIRECT', `收到认证响应`, message.type);
          }
        } catch (e) {
          this.log('DIRECT', '收到非JSON消息', data.toString().substring(0, 100));
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(testTimeout);
        this.log('DIRECT', '连接关闭', `代码=${code}, 原因=${reason || '无'}, 消息数=${messageCount}, 认证响应=${authResponseReceived}`);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(testTimeout);
        this.log('DIRECT', '连接错误', error.message);
        resolve();
      });
    });
  }

  analyzeResults() {
    console.log('\n============================================================');
    console.log('📊 消息流分析结果');
    console.log('============================================================');

    const proxyMessages = this.messageLog.filter(entry => entry.source === 'PROXY');
    const directMessages = this.messageLog.filter(entry => entry.source === 'DIRECT');

    console.log('\n🌐 隧道代理消息流:');
    proxyMessages.forEach(entry => {
      console.log(`  [${entry.elapsed}ms] ${entry.event}${entry.details ? ': ' + entry.details : ''}`);
    });

    console.log('\n🔗 直接连接消息流:');
    directMessages.forEach(entry => {
      console.log(`  [${entry.elapsed}ms] ${entry.event}${entry.details ? ': ' + entry.details : ''}`);
    });

    // 分析差异
    const proxyAuthResponses = proxyMessages.filter(entry => 
      entry.event.includes('收到认证响应') || entry.details === 'auth_invalid' || entry.details === 'auth_ok'
    );
    const directAuthResponses = directMessages.filter(entry => 
      entry.event.includes('收到认证响应') || entry.details === 'auth_invalid' || entry.details === 'auth_ok'
    );

    console.log('\n🎯 关键发现:');
    if (proxyAuthResponses.length === 0 && directAuthResponses.length > 0) {
      console.log('❌ 隧道代理确实丢失了认证响应消息');
      console.log('🔧 修复机制可能没有生效，需要进一步检查');
    } else if (proxyAuthResponses.length > 0) {
      console.log('✅ 隧道代理收到了认证响应消息');
      console.log('🎉 修复机制可能已经生效');
    } else {
      console.log('⚠️  两个连接都没有收到认证响应，可能是测试环境问题');
    }

    console.log('\n📋 建议下一步操作:');
    console.log('1. 检查tunnel-proxy服务是否已重启加载修复代码');
    console.log('2. 检查tunnel-proxy日志中的详细认证处理过程');
    console.log('3. 验证tunnel-server是否正确转发了补偿消息');
    console.log('4. 确认网络连接稳定性');
  }
}

// 运行调试
const debugger = new MessageFlowDebugger();
debugger.testCompleteMessageFlow().catch(console.error);
