const WebSocket = require('ws');

/**
 * 调试WebSocket过早关闭问题
 */
async function debugWebSocketEarlyClose() {
  console.log('🔍 调试WebSocket过早关闭问题...');

  const url = 'ws://110.41.20.134:3081/api/websocket';

  console.log(`🔗 连接到: ${url}`);

  const ws = new WebSocket(url);
  let authSent = false;
  let authSentTime = 0;
  const startTime = Date.now();

  ws.on('open', () => {
    const elapsed = Date.now() - startTime;
    console.log(`✅ WebSocket连接建立 (${elapsed}ms)`);
    console.log(`📋 准备等待auth_required消息...`);
  });

  ws.on('message', (data) => {
    const elapsed = Date.now() - startTime;
    console.log(`📥 收到消息 (${elapsed}ms): ${data.toString()}`);

    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'auth_required' && !authSent) {
        authSent = true;
        authSentTime = Date.now();

        console.log(`🔐 收到auth_required，立即发送认证...`);

        const authMessage = {
          "type": "auth",
          "access_token": "invalid_token_test_123"
        };

        ws.send(JSON.stringify(authMessage));
        console.log(`📤 认证消息已发送 (${Date.now() - startTime}ms)`);
        console.log(`⏱️  开始等待认证响应...`);
      } else if (message.type === 'auth_invalid') {
        const responseTime = Date.now() - authSentTime;
        console.log(`✅ 收到auth_invalid响应！响应时间: ${responseTime}ms`);
      } else if (message.type === 'auth_ok') {
        const responseTime = Date.now() - authSentTime;
        console.log(`✅ 收到auth_ok响应！响应时间: ${responseTime}ms`);
      }
    } catch (e) {
      console.log(`❌ JSON解析失败: ${e.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    const elapsed = Date.now() - startTime;
    const authElapsed = authSent ? Date.now() - authSentTime : 0;

    console.log(`\n❌ WebSocket连接关闭:`);
    console.log(`   总持续时间: ${elapsed}ms`);
    console.log(`   认证后持续时间: ${authElapsed}ms`);
    console.log(`   关闭代码: ${code}`);
    console.log(`   关闭原因: ${reason || '无原因'}`);

    // 分析关闭代码
    switch (code) {
      case 1000:
        console.log(`   分析: 正常关闭`);
        break;
      case 1006:
        console.log(`   分析: 异常关闭，可能是网络问题或服务器主动断开`);
        break;
      case 1011:
        console.log(`   分析: 服务器遇到意外情况`);
        break;
      default:
        console.log(`   分析: 未知关闭代码`);
    }

    if (authElapsed < 500 && authSent) {
      console.log(`⚠️  警告: 认证后连接过快关闭，可能存在时序问题！`);
    }
  });

  ws.on('error', (error) => {
    const elapsed = Date.now() - startTime;
    console.log(`❌ WebSocket错误 (${elapsed}ms): ${error.message}`);
  });

  // 20秒后自动关闭测试
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('\n⏰ 测试超时，主动关闭连接');
      ws.close();
    }
  }, 20000);
}

debugWebSocketEarlyClose().catch(console.error);
