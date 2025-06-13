const WebSocket = require('ws');

/**
 * 针对具体问题的深度分析：
 * 有效access_token通过隧道代理发送，但收不到auth_ok响应
 */
class AuthMessageLossAnalyzer {
  constructor() {
    this.testResults = {
      direct: null,
      proxy: null
    };
  }

  async runAnalysis() {
    console.log('🔍 WebSocket认证消息丢失深度分析');
    console.log('============================================================');
    console.log('🎯 问题描述：有效access_token发送后，应收到auth_ok但实际没有收到');
    console.log('');

    // 使用有效的access_token进行测试
    const validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWEyNTc1MDUyNzg0ZDliYTIxNjUwZjIzY2NiZjc0MSIsImlhdCI6MTc0OTgwOTU4MCwiZXhwIjoxNzQ5ODExMzgwfQ.BW8RNFaWhK3FGSOArbtTXBk8YJ6efKFvOcaBvG-g704";

    try {
      // 步骤1: 测试直连HA验证token是否真的有效
      console.log('📋 步骤1: 验证access_token的有效性');
      this.testResults.direct = await this.testDirectConnection(validToken);

      // 等待3秒
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 步骤2: 测试隧道代理连接
      console.log('📋 步骤2: 测试隧道代理连接');
      this.testResults.proxy = await this.testProxyConnection(validToken);

      // 分析结果
      this.analyzeResults();

    } catch (error) {
      console.log(`❌ 分析过程发生错误: ${error.message}`);
    }
  }

  async testDirectConnection(token) {
    console.log('\n🔗 直连Home Assistant测试');
    console.log(`📡 连接: ws://192.168.6.170:8123/api/websocket`);
    console.log(`🔑 使用Token: ${token.substring(0, 50)}...`);

    return new Promise((resolve) => {
      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
      const result = {
        connected: false,
        authRequired: false,
        authResponse: null,
        messageCount: 0,
        timeline: [],
        error: null
      };

      const startTime = Date.now();

      const log = (event, details = '') => {
        const elapsed = Date.now() - startTime;
        result.timeline.push({ elapsed, event, details });
        console.log(`  [${elapsed}ms] ${event}${details ? ': ' + details : ''}`);
      };

      ws.on('open', () => {
        result.connected = true;
        log('WebSocket连接建立');
      });

      ws.on('message', (data) => {
        console.log("%c Line:74 🥔 message", "color:#33a5ff", data.toString());
        result.messageCount++;
        try {
          const message = JSON.parse(data.toString());
          log(`收到消息 #${result.messageCount}`, `${message.type}`);

          if (message.type === 'auth_required') {
            result.authRequired = true;
            // 立即发送认证消息
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": token
              };
              log('发送有效access_token');
              ws.send(JSON.stringify(authMessage));
            }, 50);

          } else if (message.type === 'auth_ok') {
            result.authResponse = 'ok';
            log('✅ 收到auth_ok - 认证成功！');

          } else if (message.type === 'auth_invalid') {
            result.authResponse = 'invalid';
            log('❌ 收到auth_invalid - 认证失败！');
          }

        } catch (e) {
          log('消息解析失败', e.message);
        }
      });

      ws.on('close', (code, reason) => {
        log('连接关闭', `code=${code}, reason=${reason || '无'}`);
        resolve(result);
      });

      ws.on('error', (error) => {
        result.error = error.message;
        log('连接错误', error.message);
        resolve(result);
      });

      // 10秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          log('测试超时，主动关闭');
          ws.close();
        }
      }, 10000);
    });
  }

  async testProxyConnection(token) {
    console.log('\n🌐 隧道代理测试');
    console.log(`📡 连接: ws://110.41.20.134:3081/api/websocket`);
    console.log(`🔑 使用相同Token: ${token.substring(0, 50)}...`);

    return new Promise((resolve) => {
      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');
      const result = {
        connected: false,
        authRequired: false,
        authResponse: null,
        messageCount: 0,
        timeline: [],
        error: null
      };

      const startTime = Date.now();

      const log = (event, details = '') => {
        const elapsed = Date.now() - startTime;
        result.timeline.push({ elapsed, event, details });
        console.log(`  [${elapsed}ms] ${event}${details ? ': ' + details : ''}`);
      };

      ws.on('open', () => {
        result.connected = true;
        log('隧道代理WebSocket连接建立');
      });

      ws.on('message', (data) => {
        result.messageCount++;
        try {
          const message = JSON.parse(data.toString());
          log(`收到消息 #${result.messageCount}`, `${message.type}`);

          if (message.type === 'auth_required') {
            result.authRequired = true;
            // 立即发送相同的认证消息
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": token
              };
              log('发送有效access_token（相同token）');
              ws.send(JSON.stringify(authMessage));
            }, 50);

          } else if (message.type === 'auth_ok') {
            result.authResponse = 'ok';
            log('✅ 收到auth_ok - 隧道认证成功！');

          } else if (message.type === 'auth_invalid') {
            result.authResponse = 'invalid';
            log('❌ 收到auth_invalid - 隧道认证失败！');
          }

        } catch (e) {
          log('消息解析失败', e.message);
        }
      });

      ws.on('close', (code, reason) => {
        log('连接关闭', `code=${code}, reason=${reason || '无'}`);
        resolve(result);
      });

      ws.on('error', (error) => {
        result.error = error.message;
        log('连接错误', error.message);
        resolve(result);
      });

      // 45秒超时（隧道代理可能需要更长时间）
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          log('测试超时，主动关闭');
          ws.close();
        }
      }, 45000);
    });
  }

  analyzeResults() {
    console.log('\n============================================================');
    console.log('📊 深度分析结果');
    console.log('============================================================');

    const { direct, proxy } = this.testResults;

    console.log('\n🔗 直连Home Assistant结果:');
    console.log(`  连接状态: ${direct.connected ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  收到消息数: ${direct.messageCount}`);
    console.log(`  认证要求: ${direct.authRequired ? '✅ 是' : '❌ 否'}`);
    console.log(`  认证响应: ${direct.authResponse || '❌ 无'}`);
    if (direct.error) console.log(`  错误: ${direct.error}`);

    console.log('\n🌐 隧道代理结果:');
    console.log(`  连接状态: ${proxy.connected ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  收到消息数: ${proxy.messageCount}`);
    console.log(`  认证要求: ${proxy.authRequired ? '✅ 是' : '❌ 否'}`);
    console.log(`  认证响应: ${proxy.authResponse || '❌ 无'}`);
    if (proxy.error) console.log(`  错误: ${proxy.error}`);

    console.log('\n🎯 关键发现:');

    // Token有效性验证
    if (direct.authResponse === 'ok') {
      console.log('✅ access_token确实有效（直连收到auth_ok）');
    } else if (direct.authResponse === 'invalid') {
      console.log('❌ access_token无效（直连收到auth_invalid）');
      console.log('   问题可能在token本身，不是隧道代理问题');
      return;
    } else {
      console.log('⚠️  直连测试异常，无法验证token有效性');
      return;
    }

    // 隧道代理问题分析
    if (!proxy.connected) {
      console.log('❌ 隧道代理连接失败，这是主要问题');
      console.log('   建议检查：tunnel-proxy服务状态、网络连接');
    } else if (proxy.authResponse === 'ok') {
      console.log('✅ 隧道代理工作正常，收到了auth_ok');
      console.log('🎉 问题已解决！');
    } else if (proxy.authResponse === 'invalid') {
      console.log('❌ 隧道代理收到auth_invalid，可能的原因：');
      console.log('   1. 隧道传输过程中token被损坏');
      console.log('   2. HA实例通过隧道代理时行为不同');
      console.log('   3. 时序问题导致token失效');
    } else if (proxy.authRequired && !proxy.authResponse) {
      console.log('🚨 发现关键问题：隧道代理丢失了认证响应消息！');
      console.log('   - 收到了auth_required但没有收到认证响应');
      console.log('   - 这证实了您描述的问题');
      console.log('');
      console.log('🔧 可能的解决方案：');
      console.log('   1. 检查tunnel-proxy的消息转发逻辑');
      console.log('   2. 验证tunnel-server的消息处理');
      console.log('   3. 实施消息补偿机制');
      console.log('   4. 增加消息传输的可靠性保障');
    }

    console.log('\n📋 建议下一步操作:');
    if (proxy.connected && proxy.authRequired && !proxy.authResponse) {
      console.log('1. 检查tunnel-proxy日志，查看是否收到了来自HA的auth_ok消息');
      console.log('2. 检查tunnel-server日志，查看消息转发情况');
      console.log('3. 实施我们之前开发的消息补偿机制');
      console.log('4. 考虑增加消息传输确认机制');
    } else {
      console.log('1. 确保tunnel-proxy服务正常运行');
      console.log('2. 检查网络连接稳定性');
      console.log('3. 验证服务配置正确性');
    }
  }
}

// 运行分析
const analyzer = new AuthMessageLossAnalyzer();
analyzer.runAnalysis().catch(console.error);
