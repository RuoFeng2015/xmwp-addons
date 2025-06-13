const WebSocket = require('ws');

/**
 * 专门调试WebSocket认证流程问题
 * 重点分析有效token情况下的消息传输问题
 */
class WebSocketAuthFlowDebugger {
  constructor() {
    this.testResults = {
      direct: null,
      proxy: null
    };
  }

  async runCompleteAnalysis() {
    console.log('🔍 WebSocket认证流程深度调试');
    console.log('============================================================');
    console.log('🎯 场景：网页登录成功后，WebSocket使用相同的有效token');
    console.log('💡 重点：分析有效token下的消息传输问题');
    console.log('');

    try {
      // 步骤1: 测试直连HA - 使用有效token场景
      console.log('🔗 步骤1: 测试直连HA（模拟网页场景）');
      this.testResults.direct = await this.testDirectWithValidScenario();

      console.log('\n⏱️  等待3秒后测试隧道代理...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 步骤2: 测试隧道代理 - 使用相同逻辑
      console.log('🌐 步骤2: 测试隧道代理（相同token场景）');
      this.testResults.proxy = await this.testProxyWithValidScenario();

      // 步骤3: 对比分析
      this.analyzeAuthFlow();

    } catch (error) {
      console.log(`❌ 测试过程出错: ${error.message}`);
    }
  }

  async testDirectWithValidScenario() {
    return new Promise((resolve) => {
      console.log('  📡 连接直连HA WebSocket...');

      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
      const result = {
        connected: false,
        messages: [],
        authFlow: {
          required: false,
          sent: false,
          response: null,
          responseTime: null
        },
        closeInfo: null,
        timeline: []
      };

      const startTime = Date.now();

      function addTimeline(event, details = '') {
        const elapsed = Date.now() - startTime;
        result.timeline.push({ elapsed, event, details });
        console.log(`    [${elapsed}ms] ${event}${details ? ': ' + details : ''}`);
      }

      ws.on('open', () => {
        result.connected = true;
        addTimeline('WebSocket连接建立');
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          result.messages.push(message);
          addTimeline(`收到消息`, message.type);

          if (message.type === 'auth_required') {
            result.authFlow.required = true;

            // 模拟网页场景：使用"看起来有效"的token格式
            // 但实际上我们知道它会失败，来观察完整流程
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYWtlX3VzZXJfaWQiLCJpYXQiOjE3MzM5NzYxNTUsImV4cCI6MjA0OTMzNjE1NX0.fake_signature_for_testing"
              };

              addTimeline('发送认证消息', '模拟网页token格式');
              ws.send(JSON.stringify(authMessage));
              result.authFlow.sent = true;
            }, 100);

          } else if (message.type === 'auth_ok') {
            result.authFlow.response = 'ok';
            result.authFlow.responseTime = Date.now() - startTime;
            addTimeline('认证成功', 'auth_ok');

          } else if (message.type === 'auth_invalid') {
            result.authFlow.response = 'invalid';
            result.authFlow.responseTime = Date.now() - startTime;
            addTimeline('认证失败', 'auth_invalid');
          }
        } catch (e) {
          addTimeline('收到非JSON消息', data.toString().substring(0, 50));
        }
      });

      ws.on('close', (code, reason) => {
        result.closeInfo = { code, reason: reason?.toString() || '无' };
        addTimeline('连接关闭', `代码=${code}, 原因=${result.closeInfo.reason}`);

        console.log('  📊 直连结果:');
        console.log(`    - 消息总数: ${result.messages.length}`);
        console.log(`    - 认证流程: 要求=${result.authFlow.required}, 发送=${result.authFlow.sent}, 响应=${result.authFlow.response}`);
        console.log(`    - 关闭信息: ${code} (${result.closeInfo.reason})`);

        resolve(result);
      });

      ws.on('error', (error) => {
        addTimeline('连接错误', error.message);
        resolve(result);
      });

      // 15秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          addTimeline('测试超时，主动关闭');
          ws.close();
        }
      }, 15000);
    });
  }

  async testProxyWithValidScenario() {
    return new Promise((resolve) => {
      console.log('  📡 连接隧道代理WebSocket...');

      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');
      const result = {
        connected: false,
        messages: [],
        authFlow: {
          required: false,
          sent: false,
          response: null,
          responseTime: null
        },
        closeInfo: null,
        timeline: []
      };

      const startTime = Date.now();

      function addTimeline(event, details = '') {
        const elapsed = Date.now() - startTime;
        result.timeline.push({ elapsed, event, details });
        console.log(`    [${elapsed}ms] ${event}${details ? ': ' + details : ''}`);
      }

      ws.on('open', () => {
        result.connected = true;
        addTimeline('隧道代理WebSocket连接建立');
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          result.messages.push(message);
          addTimeline(`收到消息`, message.type);

          if (message.type === 'auth_required') {
            result.authFlow.required = true;

            // 使用完全相同的认证消息
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYWtlX3VzZXJfaWQiLCJpYXQiOjE3MzM5NzYxNTUsImV4cCI6MjA0OTMzNjE1NX0.fake_signature_for_testing"
              };

              addTimeline('发送认证消息', '与直连相同的token');
              ws.send(JSON.stringify(authMessage));
              result.authFlow.sent = true;
            }, 100);

          } else if (message.type === 'auth_ok') {
            result.authFlow.response = 'ok';
            result.authFlow.responseTime = Date.now() - startTime;
            addTimeline('认证成功', 'auth_ok');

          } else if (message.type === 'auth_invalid') {
            result.authFlow.response = 'invalid';
            result.authFlow.responseTime = Date.now() - startTime;
            addTimeline('认证失败', 'auth_invalid');
          }
        } catch (e) {
          addTimeline('收到非JSON消息', data.toString().substring(0, 50));
        }
      });

      ws.on('close', (code, reason) => {
        result.closeInfo = { code, reason: reason?.toString() || '无' };
        addTimeline('连接关闭', `代码=${code}, 原因=${result.closeInfo.reason}`);

        console.log('  📊 隧道代理结果:');
        console.log(`    - 消息总数: ${result.messages.length}`);
        console.log(`    - 认证流程: 要求=${result.authFlow.required}, 发送=${result.authFlow.sent}, 响应=${result.authFlow.response}`);
        console.log(`    - 关闭信息: ${code} (${result.closeInfo.reason})`);

        resolve(result);
      });

      ws.on('error', (error) => {
        addTimeline('连接错误', error.message);
        resolve(result);
      });

      // 45秒超时（隧道代理可能需要更长时间）
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          addTimeline('测试超时，主动关闭');
          ws.close();
        }
      }, 45000);
    });
  }

  analyzeAuthFlow() {
    console.log('\n============================================================');
    console.log('📊 WebSocket认证流程对比分析');
    console.log('============================================================');

    const direct = this.testResults.direct;
    const proxy = this.testResults.proxy;

    console.log('\n🔗 直连HA结果:');
    if (direct) {
      console.log(`  连接: ${direct.connected ? '✅ 成功' : '❌ 失败'}`);
      console.log(`  消息数: ${direct.messages.length}`);
      console.log(`  认证响应: ${direct.authFlow.response || '无'}`);
      console.log(`  关闭代码: ${direct.closeInfo?.code || '未知'}`);
    }

    console.log('\n🌐 隧道代理结果:');
    if (proxy) {
      console.log(`  连接: ${proxy.connected ? '✅ 成功' : '❌ 失败'}`);
      console.log(`  消息数: ${proxy.messages.length}`);
      console.log(`  认证响应: ${proxy.authFlow.response || '无'}`);
      console.log(`  关闭代码: ${proxy.closeInfo?.code || '未知'}`);
    }

    console.log('\n🎯 关键发现:');

    if (direct && proxy) {
      // 消息数量对比
      if (direct.messages.length > proxy.messages.length) {
        const missingCount = direct.messages.length - proxy.messages.length;
        console.log(`❌ 隧道代理丢失了 ${missingCount} 条消息`);

        // 找出丢失的消息类型
        const directTypes = direct.messages.map(m => m.type);
        const proxyTypes = proxy.messages.map(m => m.type);
        const missing = directTypes.filter(type => !proxyTypes.includes(type));
        if (missing.length > 0) {
          console.log(`   丢失的消息类型: ${missing.join(', ')}`);
        }
      } else if (direct.messages.length === proxy.messages.length) {
        console.log(`✅ 消息数量一致: ${direct.messages.length}`);
      }

      // 认证响应对比
      if (direct.authFlow.response && !proxy.authFlow.response) {
        console.log(`❌ 隧道代理丢失了认证响应: ${direct.authFlow.response}`);
      } else if (direct.authFlow.response === proxy.authFlow.response) {
        console.log(`✅ 认证响应一致: ${direct.authFlow.response}`);
      }

      // 关闭代码对比
      if (direct.closeInfo?.code !== proxy.closeInfo?.code) {
        console.log(`⚠️  关闭代码不同: 直连=${direct.closeInfo?.code}, 代理=${proxy.closeInfo?.code}`);

        if (proxy.closeInfo?.code === 1006) {
          console.log('   🔍 代码1006表示异常关闭，可能是网络连接问题');
        }
      }
    }

    console.log('\n🔧 问题定位:');
    console.log('');

    if (proxy && proxy.closeInfo?.code === 1006) {
      console.log('主要问题：隧道代理连接异常关闭（1006）');
      console.log('');
      console.log('可能原因：');
      console.log('1. 🔄 tunnel-proxy服务不稳定，在认证过程中断开');
      console.log('2. 🌐 tunnel-proxy到HA的内部连接有问题');
      console.log('3. 🔧 tunnel-proxy的WebSocket转发逻辑有bug');
      console.log('4. ⏱️  tunnel-proxy在认证响应传输时出现时序问题');
      console.log('');
      console.log('建议检查：');
      console.log('• tunnel-proxy的运行日志');
      console.log('• tunnel-proxy到192.168.6.170:8123的连接状态');
      console.log('• tunnel-proxy的错误处理逻辑');
    } else if (proxy && proxy.authFlow.required && !proxy.authFlow.response) {
      console.log('主要问题：认证响应消息在隧道中丢失');
      console.log('');
      console.log('这确认了原始问题：auth_ok/auth_invalid消息确实在传输过程中丢失');
      console.log('');
      console.log('建议：');
      console.log('• 检查tunnel-proxy的消息转发缓冲机制');
      console.log('• 验证修复代码是否正确部署和生效');
      console.log('• 考虑在tunnel-server端增加消息完整性检查');
    }
  }
}

// 运行调试
const debugger = new WebSocketAuthFlowDebugger();
debugger.runCompleteAnalysis().catch(console.error);
