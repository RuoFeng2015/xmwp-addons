const WebSocket = require('ws');

/**
 * WebSocket消息丢失修复验证测试
 * 验证auth_ok消息是否能正确传输到浏览器
 */
class WebSocketMessageFixTest {
  constructor() {
    this.results = [];
    this.testStartTime = Date.now();
  }

  log(message, success = true) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.testStartTime;
    const status = success ? '✅' : '❌';
    const logMessage = `[${elapsed}ms] ${status} ${message}`;
    console.log(logMessage);
    this.results.push({ message, success, timestamp, elapsed });
  }

  async testDirectHA() {
    return new Promise((resolve) => {
      console.log('\n=== 测试直连HA WebSocket（参考基准） ===');

      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
      const messages = [];
      let authRequired = false;
      let authResponse = false;

      const startTime = Date.now();

      ws.on('open', () => {
        this.log('直连HA: WebSocket连接建立');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);

        this.log(`直连HA: 收到消息 ${message.type}`);

        if (message.type === 'auth_required') {
          authRequired = true;

          // 发送无效token测试
          setTimeout(() => {
            const authMessage = {
              "type": "auth",
              "access_token": "invalid_token_for_testing_direct"
            };
            ws.send(JSON.stringify(authMessage));
            this.log('直连HA: 发送无效认证');
          }, 50);

        } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
          authResponse = true;
          this.log(`直连HA: 收到认证响应 ${message.type}`);
        }
      });

      ws.on('close', (code, reason) => {
        const duration = Date.now() - startTime;
        this.log(`直连HA: 连接关闭 code=${code}, 耗时=${duration}ms`);

        resolve({
          messageCount: messages.length,
          authRequired,
          authResponse,
          messages,
          duration
        });
      });

      ws.on('error', (error) => {
        this.log(`直连HA: 连接错误 ${error.message}`, false);
        resolve({
          messageCount: 0,
          authRequired: false,
          authResponse: false,
          messages: [],
          duration: 0,
          error: error.message
        });
      });

      // 5秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 5000);
    });
  }

  async testTunnelProxy() {
    return new Promise((resolve) => {
      console.log('\n=== 测试内网穿透WebSocket ===');

      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');
      const messages = [];
      let authRequired = false;
      let authResponse = false;

      const startTime = Date.now();

      ws.on('open', () => {
        this.log('隧道代理: WebSocket连接建立');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);

        this.log(`隧道代理: 收到消息 ${message.type}`);

        if (message.type === 'auth_required') {
          authRequired = true;

          // 发送无效token测试
          setTimeout(() => {
            const authMessage = {
              "type": "auth",
              "access_token": "invalid_token_for_testing_proxy"
            };
            ws.send(JSON.stringify(authMessage));
            this.log('隧道代理: 发送无效认证');
          }, 50);

        } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
          authResponse = true;
          this.log(`隧道代理: 收到认证响应 ${message.type} ⭐`);
        }
      });

      ws.on('close', (code, reason) => {
        const duration = Date.now() - startTime;
        this.log(`隧道代理: 连接关闭 code=${code}, 耗时=${duration}ms`);

        resolve({
          messageCount: messages.length,
          authRequired,
          authResponse,
          messages,
          duration
        });
      });

      ws.on('error', (error) => {
        this.log(`隧道代理: 连接错误 ${error.message}`, false);
        resolve({
          messageCount: 0,
          authRequired: false,
          authResponse: false,
          messages: [],
          duration: 0,
          error: error.message
        });
      });

      // 10秒超时（给隧道代理更多时间）
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 10000);
    });
  }

  async runTests() {
    console.log('🧪 WebSocket消息丢失修复验证测试');
    console.log('='.repeat(60));
    console.log('🎯 目标：验证auth_ok/auth_invalid消息是否能正确传输');
    console.log('📋 测试步骤：');
    console.log('  1. 直连HA WebSocket作为参考基准');
    console.log('  2. 通过隧道代理连接WebSocket');
    console.log('  3. 对比两种方式的消息接收情况');
    console.log('');

    try {
      // 测试直连HA
      const directResult = await this.testDirectHA();

      // 等待一段时间确保连接完全关闭
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 测试隧道代理
      const proxyResult = await this.testTunnelProxy();

      // 分析结果
      this.analyzeResults(directResult, proxyResult);

    } catch (error) {
      console.error('测试过程中发生错误:', error);
    }
  }

  analyzeResults(directResult, proxyResult) {
    console.log('\n=== 测试结果分析 ===');
    console.log('');

    // 基本连接状态
    console.log('📊 连接状态对比:');
    console.log(`  直连HA    : ${directResult.error ? '❌ 失败' : '✅ 成功'} (消息数: ${directResult.messageCount})`);
    console.log(`  隧道代理  : ${proxyResult.error ? '❌ 失败' : '✅ 成功'} (消息数: ${proxyResult.messageCount})`);
    console.log('');

    // 认证流程对比
    console.log('🔐 认证流程对比:');
    console.log(`  直连HA    : auth_required=${directResult.authRequired ? '✅' : '❌'}, auth_response=${directResult.authResponse ? '✅' : '❌'}`);
    console.log(`  隧道代理  : auth_required=${proxyResult.authRequired ? '✅' : '❌'}, auth_response=${proxyResult.authResponse ? '✅' : '❌'}`);
    console.log('');

    // 关键修复验证
    const isFixed = proxyResult.authResponse && proxyResult.authRequired;
    console.log('🎯 修复验证结果:');
    if (isFixed) {
      console.log('  ✅ 修复成功！隧道代理现在能正确接收认证响应消息');
      console.log('  ✅ auth_ok/auth_invalid消息传输正常');
    } else {
      console.log('  ❌ 修复未完全生效');
      if (!proxyResult.authRequired) {
        console.log('  ❌ 未收到auth_required消息');
      }
      if (!proxyResult.authResponse) {
        console.log('  ❌ 未收到auth_ok/auth_invalid消息（关键问题）');
      }
    }
    console.log('');

    // 消息详情
    if (proxyResult.messages.length > 0) {
      console.log('📝 隧道代理收到的消息:');
      proxyResult.messages.forEach((msg, i) => {
        const isAuthMsg = ['auth_required', 'auth_ok', 'auth_invalid'].includes(msg.type);
        const prefix = isAuthMsg ? '🔐' : '📄';
        console.log(`  ${i + 1}. ${prefix} ${msg.type}${msg.ha_version ? ` (${msg.ha_version})` : ''}`);
      });
    }

    // 性能对比
    console.log('');
    console.log('⏱️  性能对比:');
    console.log(`  直连HA    : ${directResult.duration}ms`);
    console.log(`  隧道代理  : ${proxyResult.duration}ms`);

    if (proxyResult.duration > directResult.duration * 2) {
      console.log('  ⚠️  隧道代理延迟较高，但这是正常的');
    }

    // 总结
    console.log('');
    console.log('📋 修复总结:');
    if (isFixed) {
      console.log('  🎉 WebSocket消息丢失问题已解决');
      console.log('  ✅ 用户现在能够看到明确的认证错误提示');
      console.log('  ✅ Home Assistant登录体验得到改善');
    } else {
      console.log('  🔧 需要进一步调试和修复');
      console.log('  📞 建议检查tunnel-server和tunnel-proxy的日志');
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new WebSocketMessageFixTest();
  test.runTests().catch(console.error);
}

module.exports = WebSocketMessageFixTest;
