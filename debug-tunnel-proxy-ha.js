const WebSocket = require('ws');

/**
 * 直接测试tunnel-proxy到Home Assistant的WebSocket连接
 * 模拟tunnel-proxy的连接逻辑
 */
async function testTunnelProxyToHA() {
  console.log('🔍 测试tunnel-proxy到Home Assistant的WebSocket连接');
  console.log('='.repeat(60));

  const hostname = '192.168.6.170';
  const port = 8123;
  const url = '/api/websocket';

  // 模拟tunnel-proxy的WebSocket连接选项
  const wsUrl = `ws://${hostname}:${port}${url}`;

  console.log(`🔗 连接URL: ${wsUrl}`);
  console.log(`⏱️  超时设置: 5秒`);
  console.log(`📋 连接选项: 和tunnel-proxy相同`);

  const headers = {
    'host': `${hostname}:${port}`,
    'user-agent': 'HomeAssistant-Tunnel-Proxy/1.0.8'
  };

  console.log(`📤 使用头信息:`, headers);

  const ws = new WebSocket(wsUrl, {
    headers: headers,
    timeout: 5000  // 和tunnel-proxy相同的超时设置
  });

  let messageCount = 0;
  let resolved = false;
  const startTime = Date.now();

  // 连接建立
  ws.on('open', () => {
    if (resolved) return;
    resolved = true;

    const elapsed = Date.now() - startTime;
    console.log(`✅ WebSocket连接建立 (${elapsed}ms)`);
    console.log(`📊 连接状态: readyState=${ws.readyState}`);

    // 发送认证消息 (模拟浏览器行为)
    const authMessage = {
      "type": "auth",
      "access_token": "invalid_test_token_12345"
    };

    console.log(`📤 发送认证消息: ${JSON.stringify(authMessage)}`);
    ws.send(JSON.stringify(authMessage));

    console.log(`⏳ 等待Home Assistant响应...`);
  });

  // 消息接收
  ws.on('message', (data) => {
    messageCount++;
    const elapsed = Date.now() - startTime;
    const message = data.toString();

    console.log(`📥 收到消息 #${messageCount} (${elapsed}ms):`);
    console.log(`   内容: ${message}`);

    try {
      const parsed = JSON.parse(message);
      console.log(`   类型: ${parsed.type}`);

      if (parsed.type === 'auth_required') {
        console.log(`   ✅ 认证请求消息正常`);
      } else if (parsed.type === 'auth_invalid') {
        console.log(`   ✅ 认证失败消息正常 - 这表明HA处理了我们的请求`);
        console.log(`   🎉 完整的认证流程工作正常！`);
      } else if (parsed.type === 'auth_ok') {
        console.log(`   ✅ 认证成功消息`);
      }
    } catch (e) {
      console.log(`   ❌ JSON解析失败: ${e.message}`);
    }
  });

  // 连接关闭
  ws.on('close', (code, reason) => {
    const elapsed = Date.now() - startTime;
    console.log(`\n🔴 WebSocket连接关闭 (${elapsed}ms):`);
    console.log(`   关闭代码: ${code}`);
    console.log(`   关闭原因: ${reason || '无原因'}`);
    console.log(`   消息计数: ${messageCount}`);

    // 分析关闭原因
    if (code === 1000) {
      console.log(`   ✅ 正常关闭`);
    } else if (code === 1006) {
      console.log(`   ⚠️  异常关闭 - 可能的网络问题`);
    } else {
      console.log(`   ❓ 其他关闭原因`);
    }

    if (messageCount >= 2) {
      console.log(`   ✅ 接收到完整消息流，连接本身是正常的`);
    } else if (messageCount === 1) {
      console.log(`   ⚠️  只收到1条消息，第二条消息丢失`);
    } else {
      console.log(`   ❌ 没有收到任何消息`);
    }

    console.log(`\n📊 总结:`);
    if (messageCount >= 2 && elapsed > 1000) {
      console.log(`   ✅ 连接稳定，消息完整，tunnel-proxy应该可以正常工作`);
    } else if (messageCount >= 2 && elapsed <= 1000) {
      console.log(`   ⚠️  连接过快关闭，可能存在时序问题`);
    } else {
      console.log(`   ❌ 存在问题，需要进一步调试`);
    }
  });

  // 连接错误
  ws.on('error', (error) => {
    if (resolved) return;
    resolved = true;

    const elapsed = Date.now() - startTime;
    console.log(`❌ WebSocket连接错误 (${elapsed}ms): ${error.message}`);
    console.log(`   错误类型: ${error.code}`);
    console.log(`   这可能是tunnel-proxy连接失败的原因`);
  });

  // 模拟tunnel-proxy的超时处理
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      console.log(`⏰ 连接超时 (5秒) - 模拟tunnel-proxy超时`);
      ws.close();
    } else {
      console.log(`ℹ️  连接已建立，不会触发超时处理`);
    }
  }, 5000);

  // 防止测试无限运行
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`\n⏰ 测试结束，主动关闭连接`);
      ws.close();
    }
  }, 20000);
}

testTunnelProxyToHA().catch(console.error);
