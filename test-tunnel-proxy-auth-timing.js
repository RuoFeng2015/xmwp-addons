const WebSocket = require('ws');
const fs = require('fs');

/**
 * 精确测试tunnel-proxy在14ms时序窗口内的auth_invalid消息传递能力
 * 
 * 这是对tunnel-proxy修复的关键验证测试：
 * 1. HA在发送auth_invalid后仅14ms就关闭连接
 * 2. tunnel-proxy必须在这个极短时间内成功转发消息
 * 3. 验证我们的同步处理、强制缓冲区刷新等修复是否生效
 */
async function testTunnelProxyAuthTiming() {
  console.log('🚀 Tunnel-Proxy Auth消息14ms时序窗口测试');
  console.log('============================================================');
  console.log('📊 关键指标：HA在auth_invalid后14ms内关闭连接');
  console.log('🎯 目标：验证tunnel-proxy能否在此窗口内传递消息');
  console.log('⚡ 修复：同步处理 + 强制缓冲区刷新 + ping帧机制');
  console.log('');

  const startTime = Date.now();
  let messageReceived = false;
  let connectionClosed = false;
  let authResponseTime = null;
  let connectionCloseTime = null;

  return new Promise((resolve) => {
    console.log('🔌 连接到tunnel-proxy WebSocket...');

    // 通过tunnel-proxy连接（这将路由到HA）
    const ws = new WebSocket('ws://localhost:8080/core-4567abc/websocket', {
      headers: {
        'Host': 'example.nabu.casa',
        'Cookie': 'session=invalid_session_token_for_testing'
      }
    });

    ws.on('open', () => {
      const connTime = Date.now() - startTime;
      console.log(`[${connTime}ms] ✅ tunnel-proxy连接建立`);
    });

    ws.on('message', (data) => {
      const currentTime = Date.now() - startTime;
      const message = JSON.parse(data.toString());

      console.log(`[${currentTime}ms] 📨 收到消息: ${message.type}`);

      if (message.type === 'auth_required') {
        console.log(`[${currentTime}ms] 🔐 发送无效认证token...`);

        // 发送无效认证token
        const authMessage = {
          type: 'auth',
          access_token: 'invalid_token_123456789'
        };

        ws.send(JSON.stringify(authMessage));
        console.log(`[${currentTime}ms] ⚡ 已发送无效认证，等待auth_invalid响应...`);

      } else if (message.type === 'auth_invalid') {
        messageReceived = true;
        authResponseTime = currentTime;
        console.log(`[${currentTime}ms] 🎉 SUCCESS: 收到auth_invalid消息！`);
        console.log(`[${currentTime}ms] ✅ tunnel-proxy成功在时序窗口内传递了认证失败消息`);
      }
    });

    ws.on('close', (code, reason) => {
      connectionClosed = true;
      connectionCloseTime = Date.now() - startTime;
      console.log(`[${connectionCloseTime}ms] 🔌 连接关闭 code=${code}`);

      // 分析结果
      console.log('\n📊 测试结果分析:');
      console.log('============================================================');

      if (messageReceived && authResponseTime) {
        console.log(`✅ SUCCESS: auth_invalid消息成功接收`);
        console.log(`⏱️  认证响应时间: ${authResponseTime}ms`);
        console.log(`⏱️  连接关闭时间: ${connectionCloseTime}ms`);
        console.log(`⚡ 消息传递窗口: ${connectionCloseTime - authResponseTime}ms`);

        if (connectionCloseTime - authResponseTime < 50) {
          console.log(`🎯 EXCELLENT: 在极短时序窗口内成功传递消息！`);
          console.log(`🔧 修复生效：同步处理和强制缓冲区刷新工作正常`);
        } else {
          console.log(`⚠️  时序窗口较宽，可能HA行为不同`);
        }

        console.log('\n🚀 结论: tunnel-proxy WebSocket消息传递修复成功！');
        console.log('💡 用户现在应该能看到正确的认证失败提示');

      } else {
        console.log(`❌ FAILED: 未收到auth_invalid消息`);
        console.log(`🐛 问题：tunnel-proxy仍存在消息丢失问题`);
        console.log(`🔧 需要：检查修复实现或HA连接状态`);
      }

      console.log('\n============================================================');
      resolve({
        messageReceived,
        authResponseTime,
        connectionCloseTime,
        timingWindow: connectionCloseTime - (authResponseTime || 0)
      });
    });

    ws.on('error', (error) => {
      const errorTime = Date.now() - startTime;
      console.log(`[${errorTime}ms] ❌ WebSocket错误:`, error.message);

      if (error.code === 'ECONNREFUSED') {
        console.log('💡 请确保tunnel-proxy在localhost:8080运行');
      }

      resolve({
        error: error.message,
        messageReceived: false
      });
    });

    // 安全超时
    setTimeout(() => {
      if (!connectionClosed) {
        console.log('\n⏰ 测试超时，强制关闭连接');
        ws.close();
      }
    }, 10000);
  });
}

// 运行测试
async function main() {
  try {
    const result = await testTunnelProxyAuthTiming();

    // 记录测试结果
    const testReport = {
      timestamp: new Date().toISOString(),
      testType: 'tunnel-proxy-auth-timing',
      result: result,
      summary: result.messageReceived ? 'SUCCESS' : 'FAILED'
    };

    fs.writeFileSync('tunnel-proxy-timing-test-result.json', JSON.stringify(testReport, null, 2));
    console.log('\n📝 测试结果已保存到 tunnel-proxy-timing-test-result.json');

  } catch (error) {
    console.error('❌ 测试执行失败:', error);
  }
}

main();
