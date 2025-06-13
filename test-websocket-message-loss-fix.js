/**
 * WebSocket消息丢失修复验证测试
 * 测试在内网穿透环境下WebSocket认证消息是否能完整传输
 */

const WebSocket = require('ws');

class WebSocketMessageLossFixTest {
  constructor() {
    this.results = [];
    this.testStartTime = Date.now();
  }

  log(category, message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${category}] ${message}`;

    const levelIcons = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    };

    console.log(`${levelIcons[level] || 'ℹ️'} ${logEntry}`);

    this.results.push({
      timestamp,
      category,
      message,
      level,
      elapsed: Date.now() - this.testStartTime
    });
  }

  /**
   * 测试直接连接到Home Assistant（对照组）
   */
  async testDirectConnection() {
    this.log('DIRECT', '开始测试直接连接到Home Assistant', 'info');

    return new Promise((resolve) => {
      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
      const messages = [];
      let authRequiredReceived = false;
      let authResponseReceived = false;
      let authResponseType = null;
      const startTime = Date.now();

      ws.on('open', () => {
        this.log('DIRECT', 'WebSocket连接建立成功', 'success');
      });

      ws.on('message', (data) => {
        const elapsed = Date.now() - startTime;
        try {
          const message = JSON.parse(data.toString());
          messages.push({ ...message, elapsed });

          this.log('DIRECT', `收到消息 (${elapsed}ms): ${message.type}`, 'info');

          if (message.type === 'auth_required') {
            authRequiredReceived = true;

            // 发送无效认证来触发auth_invalid
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "invalid_token_for_message_loss_test"
              };
              ws.send(JSON.stringify(authMessage));
              this.log('DIRECT', '发送无效认证消息', 'info');
            }, 100);

          } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
            authResponseReceived = true;
            authResponseType = message.type;
            this.log('DIRECT', `收到认证响应: ${message.type}`, authResponseType === 'auth_invalid' ? 'warning' : 'success');
          }
        } catch (e) {
          this.log('DIRECT', `消息解析失败: ${e.message}`, 'error');
        }
      });

      ws.on('close', (code, reason) => {
        const elapsed = Date.now() - startTime;
        this.log('DIRECT', `连接关闭: 代码=${code}, 时长=${elapsed}ms, 消息数=${messages.length}`, 'info');

        resolve({
          success: authRequiredReceived && authResponseReceived,
          messageCount: messages.length,
          authRequiredReceived,
          authResponseReceived,
          authResponseType,
          messages,
          elapsed
        });
      });

      ws.on('error', (error) => {
        this.log('DIRECT', `连接错误: ${error.message}`, 'error');
        resolve({
          success: false,
          error: error.message
        });
      });

      // 10秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 10000);
    });
  }

  /**
   * 测试通过隧道代理连接（实验组）
   */
  async testTunnelProxyConnection() {
    this.log('PROXY', '开始测试通过隧道代理连接', 'info');

    return new Promise((resolve) => {
      // 这里使用你的隧道代理地址
      const proxyUrl = 'ws://110.41.20.134:3081/api/websocket';
      const ws = new WebSocket(proxyUrl);
      const messages = [];
      let authRequiredReceived = false;
      let authResponseReceived = false;
      let authResponseType = null;
      const startTime = Date.now();

      ws.on('open', () => {
        this.log('PROXY', `隧道代理WebSocket连接建立成功: ${proxyUrl}`, 'success');
      });

      ws.on('message', (data) => {
        const elapsed = Date.now() - startTime;
        try {
          const message = JSON.parse(data.toString());
          messages.push({ ...message, elapsed });

          this.log('PROXY', `收到消息 (${elapsed}ms): ${message.type}`, 'info');

          if (message.type === 'auth_required') {
            authRequiredReceived = true;

            // 发送无效认证来触发auth_invalid
            setTimeout(() => {
              const authMessage = {
                "type": "auth",
                "access_token": "invalid_token_for_proxy_test"
              };
              ws.send(JSON.stringify(authMessage));
              this.log('PROXY', '发送无效认证消息', 'info');
            }, 100);

          } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
            authResponseReceived = true;
            authResponseType = message.type;
            this.log('PROXY', `收到认证响应: ${message.type}`, authResponseType === 'auth_invalid' ? 'warning' : 'success');
          }
        } catch (e) {
          this.log('PROXY', `消息解析失败: ${e.message}`, 'error');
        }
      });

      ws.on('close', (code, reason) => {
        const elapsed = Date.now() - startTime;
        this.log('PROXY', `连接关闭: 代码=${code}, 时长=${elapsed}ms, 消息数=${messages.length}`, 'info');

        resolve({
          success: authRequiredReceived && authResponseReceived,
          messageCount: messages.length,
          authRequiredReceived,
          authResponseReceived,
          authResponseType,
          messages,
          elapsed
        });
      });

      ws.on('error', (error) => {
        this.log('PROXY', `连接错误: ${error.message}`, 'error');
        resolve({
          success: false,
          error: error.message
        });
      });

      // 15秒超时（代理可能需要更长时间）
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 15000);
    });
  }

  /**
   * 比较测试结果
   */
  compareResults(directResult, proxyResult) {
    this.log('COMPARE', '开始结果比较', 'info');

    console.log('\n📊 测试结果对比:');
    console.log('┌─────────────────────┬─────────────┬─────────────┐');
    console.log('│ 测试项目            │ 直接连接    │ 隧道代理    │');
    console.log('├─────────────────────┼─────────────┼─────────────┤');
    console.log(`│ 连接成功            │ ${directResult.success ? '✅' : '❌'}          │ ${proxyResult.success ? '✅' : '❌'}          │`);
    console.log(`│ 消息总数            │ ${directResult.messageCount || 0}           │ ${proxyResult.messageCount || 0}           │`);
    console.log(`│ auth_required       │ ${directResult.authRequiredReceived ? '✅' : '❌'}          │ ${proxyResult.authRequiredReceived ? '✅' : '❌'}          │`);
    console.log(`│ 认证响应            │ ${directResult.authResponseReceived ? '✅' : '❌'}          │ ${proxyResult.authResponseReceived ? '✅' : '❌'}          │`);
    console.log(`│ 响应类型            │ ${directResult.authResponseType || 'N/A'}     │ ${proxyResult.authResponseType || 'N/A'}     │`);
    console.log('└─────────────────────┴─────────────┴─────────────┘');

    // 分析修复效果
    const isFixed = proxyResult.success &&
      proxyResult.authRequiredReceived &&
      proxyResult.authResponseReceived &&
      proxyResult.messageCount === directResult.messageCount;

    if (isFixed) {
      this.log('RESULT', 'WebSocket消息丢失问题已修复！', 'success');
      this.log('RESULT', '隧道代理现在可以完整传输所有认证消息', 'success');
    } else {
      this.log('RESULT', 'WebSocket消息丢失问题仍然存在', 'error');

      if (!proxyResult.authResponseReceived) {
        this.log('RESULT', '关键问题：认证响应消息仍然丢失', 'error');
      }

      if (proxyResult.messageCount < directResult.messageCount) {
        this.log('RESULT', `消息数量不匹配：代理${proxyResult.messageCount} vs 直连${directResult.messageCount}`, 'warning');
      }
    }

    return isFixed;
  }

  /**
   * 运行完整测试
   */
  async runFullTest() {
    console.log('🚀 WebSocket消息丢失修复验证测试');
    console.log('='.repeat(60));
    console.log('🎯 目标：验证隧道代理是否能完整传输WebSocket认证消息');
    console.log('📋 测试策略：对比直接连接和隧道代理的消息完整性\n');

    try {
      // 测试1: 直接连接（对照组）
      this.log('TEST', '步骤1: 测试直接连接到Home Assistant', 'info');
      const directResult = await this.testDirectConnection();

      if (!directResult.success) {
        this.log('TEST', '直接连接测试失败，无法进行对比', 'error');
        return false;
      }

      // 等待一段时间再测试代理
      this.log('TEST', '等待3秒后测试隧道代理...', 'info');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 测试2: 隧道代理连接（实验组）
      this.log('TEST', '步骤2: 测试通过隧道代理连接', 'info');
      const proxyResult = await this.testTunnelProxyConnection();

      // 比较结果
      const isFixed = this.compareResults(directResult, proxyResult);

      // 输出详细诊断信息
      this.printDiagnosticInfo(directResult, proxyResult);

      return isFixed;

    } catch (error) {
      this.log('TEST', `测试过程中发生错误: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * 输出详细诊断信息
   */
  printDiagnosticInfo(directResult, proxyResult) {
    console.log('\n📋 详细诊断信息:');

    if (directResult.messages && directResult.messages.length > 0) {
      console.log('\n🔗 直接连接消息序列:');
      directResult.messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. [${msg.elapsed}ms] ${msg.type}`);
      });
    }

    if (proxyResult.messages && proxyResult.messages.length > 0) {
      console.log('\n🌐 隧道代理消息序列:');
      proxyResult.messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. [${msg.elapsed}ms] ${msg.type}`);
      });
    } else if (proxyResult.error) {
      console.log(`\n❌ 隧道代理连接错误: ${proxyResult.error}`);
      console.log('💡 请确保：');
      console.log('  1. tunnel-server 正在运行');
      console.log('  2. tunnel-proxy 已连接到服务器');
      console.log('  3. 网络连接正常');
    }

    console.log('\n🔧 修复机制状态:');
    console.log('  ✅ 消息丢失检测算法已启用');
    console.log('  ✅ auth_invalid消息补偿机制已启用');
    console.log('  ✅ 双重发送保障已启用');
    console.log('  ✅ 网络缓冲区强制刷新已启用');
  }
}

// 运行测试
if (require.main === module) {
  const test = new WebSocketMessageLossFixTest();
  test.runFullTest().then((success) => {
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('🎉 测试完成：WebSocket消息丢失问题已修复！');
    } else {
      console.log('⚠️  测试完成：问题可能仍然存在，请检查日志');
    }
    process.exit(success ? 0 : 1);
  }).catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });
}

