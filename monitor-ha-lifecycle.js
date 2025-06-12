const WebSocket = require('ws');

/**
 * 监控HA WebSocket连接的完整生命周期
 */
async function monitorHAWebSocketLifecycle() {
  console.log('🔍 监控HA WebSocket连接生命周期...');

  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjNGExN2ZiOTRmNmM0MGY4YTVlZTkzYWZlNmMyMmI5NyIsImlhdCI6MTc0OTcxNjg3OCwiZXhwIjoxNzQ5NzE4Njc4fQ.1zK9K3uadhz4gSDfuTPOpwR1P8O8_Cltv0qVTttX8LQ";

  console.log('🔗 连接到HA WebSocket...');

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  let authSent = false;
  let authSentTime = 0;
  const startTime = Date.now();

  ws.on('open', () => {
    const elapsed = Date.now() - startTime;
    console.log(`✅ 连接建立 (${elapsed}ms)`);
  });

  ws.on('message', (data) => {
    messageCount++;
    const elapsed = Date.now() - startTime;
    const message = JSON.parse(data.toString());

    console.log(`📥 消息 #${messageCount} (${elapsed}ms): ${JSON.stringify(message)}`);

    if (message.type === 'auth_required' && !authSent) {
      authSent = true;
      authSentTime = Date.now();

      console.log(`🔐 发送认证 (${elapsed}ms)...`);

      const authMessage = {
        type: 'auth',
        access_token: token
      };

      ws.send(JSON.stringify(authMessage));
      console.log(`📤 认证已发送 (${Date.now() - startTime}ms)`);

    } else if (message.type === 'auth_ok') {
      const authResponseTime = Date.now() - authSentTime;
      console.log(`✅ 认证成功！响应时间: ${authResponseTime}ms`);

      // 认证成功后，测试是否会立即关闭
      console.log(`⏱️  等待观察连接是否保持...`);

    } else if (message.type === 'auth_invalid') {
      const authResponseTime = Date.now() - authSentTime;
      console.log(`❌ 认证失败！响应时间: ${authResponseTime}ms`);
    }
  });

  ws.on('close', (code, reason) => {
    const elapsed = Date.now() - startTime;
    const authElapsed = authSent ? Date.now() - authSentTime : 0;

    console.log(`\n🔴 WebSocket连接关闭:`);
    console.log(`   总持续时间: ${elapsed}ms`);
    console.log(`   认证后持续时间: ${authElapsed}ms`);
    console.log(`   关闭代码: ${code}`);
    console.log(`   关闭原因: ${reason || '无'}`);
    console.log(`   总消息数: ${messageCount}`);

    // 分析关闭时机
    if (authElapsed > 0 && authElapsed < 100) {
      console.log(`⚠️  关键发现：HA在认证响应后立即关闭连接！`);
      console.log(`   这可能是HA在认证成功后的正常行为`);
    }

    if (code === 1000) {
      console.log(`✅ 正常关闭`);
    } else if (code === 1006) {
      console.log(`❌ 异常关闭`);
    }
  });

  ws.on('error', (error) => {
    const elapsed = Date.now() - startTime;
    console.log(`❌ WebSocket错误 (${elapsed}ms): ${error.message}`);
  });

  // 20秒后自动关闭
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('\n⏰ 测试超时，主动关闭连接');
      ws.close();
    }
  }, 20000);
}

monitorHAWebSocketLifecycle().catch(console.error);
