const WebSocket = require('ws');

/**
 * 测试WebSocket认证流程 - 使用有效token
 */
async function testWebSocketWithValidAuth() {
  console.log('🔍 测试WebSocket认证流程');
  console.log('='.repeat(60));

  // 注意：这里需要一个有效的长期访问令牌
  // 您需要从Home Assistant的用户配置页面生成一个
  const VALID_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmZjQyM2YxMGUyNDI0YjkzYjkzNjM0MjNhNDdlODBiMSIsImlhdCI6MTczMzk3NjE1NSwiZXhwIjoyMDQ5MzM2MTU1fQ.Hzw5qjpgzrAm7D1oCE7J_XyCUqGSCwJBvJeHQKP_9eA';

  const wsUrl = 'ws://192.168.6.170:8123/api/websocket';

  console.log(`🔗 连接到: ${wsUrl}`);
  console.log(`🔑 使用有效的access_token`);

  const ws = new WebSocket(wsUrl);

  let messageCount = 0;
  let authSent = false;

  ws.on('open', () => {
    console.log(`✅ WebSocket连接建立`);
    console.log(`⏳ 等待auth_required消息...`);
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = data.toString();
    console.log(`\n📥 收到消息 #${messageCount}:`);
    console.log(`   ${message}`);

    try {
      const parsed = JSON.parse(message);

      if (parsed.type === 'auth_required' && !authSent) {
        authSent = true;
        console.log(`\n🔐 收到auth_required，发送有效认证...`);

        const authMessage = {
          "type": "auth",
          "access_token": VALID_ACCESS_TOKEN
        };

        ws.send(JSON.stringify(authMessage));
        console.log(`📤 已发送有效认证消息`);
        console.log(`⏳ 等待认证结果...`);

      } else if (parsed.type === 'auth_ok') {
        console.log(`\n✅ 认证成功！`);
        console.log(`🎉 WebSocket连接将保持活跃`);
        console.log(`📊 这证明了连接"过早关闭"实际上是认证失败导致的`);

        // 发送一个测试命令来验证连接是否真正活跃
        setTimeout(() => {
          const testCommand = {
            "id": 1,
            "type": "ping"
          };
          ws.send(JSON.stringify(testCommand));
          console.log(`📤 发送ping命令测试连接`);
        }, 1000);

      } else if (parsed.type === 'auth_invalid') {
        console.log(`\n❌ 认证失败！`);
        console.log(`💡 这解释了为什么连接会被关闭`);
        console.log(`🔧 需要检查access_token是否有效`);

      } else if (parsed.type === 'pong') {
        console.log(`\n🏓 收到pong响应 - 连接活跃！`);

      } else {
        console.log(`\n📄 其他消息类型: ${parsed.type}`);
      }
    } catch (e) {
      console.log(`   ❌ JSON解析失败: ${e.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`\n🔴 WebSocket连接关闭:`);
    console.log(`   关闭代码: ${code}`);
    console.log(`   关闭原因: ${reason || '无原因'}`);
    console.log(`   总消息数: ${messageCount}`);

    if (messageCount >= 3) {
      console.log(`\n✅ 连接成功并保持活跃，证明了问题在于认证`);
    } else if (messageCount === 2) {
      console.log(`\n⚠️  收到认证失败，这是正常的安全行为`);
    } else {
      console.log(`\n❌ 连接异常`);
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });

  // 30秒后关闭测试
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`\n⏰ 测试完成，主动关闭连接`);
      ws.close();
    }
  }, 30000);
}

/**
 * 测试无效token的情况（确认关闭行为）
 */
async function testWebSocketWithInvalidAuth() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 测试WebSocket无效认证（确认关闭行为）');
  console.log('='.repeat(60));

  const wsUrl = 'ws://192.168.6.170:8123/api/websocket';

  console.log(`🔗 连接到: ${wsUrl}`);
  console.log(`❌ 使用无效的access_token`);

  const ws = new WebSocket(wsUrl);

  let messageCount = 0;
  let authSent = false;
  const startTime = Date.now();

  ws.on('open', () => {
    console.log(`✅ WebSocket连接建立`);
  });

  ws.on('message', (data) => {
    messageCount++;
    const elapsed = Date.now() - startTime;
    const message = data.toString();
    console.log(`\n📥 收到消息 #${messageCount} (${elapsed}ms):`);
    console.log(`   ${message}`);

    try {
      const parsed = JSON.parse(message);

      if (parsed.type === 'auth_required' && !authSent) {
        authSent = true;
        console.log(`\n🔐 发送无效认证...`);

        const authMessage = {
          "type": "auth",
          "access_token": "invalid_token_123"
        };

        ws.send(JSON.stringify(authMessage));
        console.log(`📤 已发送无效认证消息`);

      } else if (parsed.type === 'auth_invalid') {
        console.log(`\n❌ 收到auth_invalid - HA将立即关闭连接`);
        console.log(`💡 这是正常的安全行为，不是bug`);
      }
    } catch (e) {
      console.log(`   ❌ JSON解析失败: ${e.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    const elapsed = Date.now() - startTime;
    console.log(`\n🔴 WebSocket连接关闭 (${elapsed}ms):`);
    console.log(`   关闭代码: ${code}`);
    console.log(`   总消息数: ${messageCount}`);
    console.log(`\n📊 结论:`);
    console.log(`   • HA在认证失败后立即关闭连接是正常行为`);
    console.log(`   • 这不是tunnel-proxy的问题`);
    console.log(`   • 需要确保浏览器使用有效的access_token`);
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });
}

// 运行测试
async function runTests() {
  try {
    await testWebSocketWithInvalidAuth();

    console.log('\n' + '='.repeat(60));
    console.log('💡 如果您有有效的HA访问令牌，可以修改VALID_ACCESS_TOKEN常量并测试有效认证');
    console.log('📝 在Home Assistant中生成长期访问令牌：用户配置 -> 安全 -> 长期访问令牌');

  } catch (error) {
    console.error('测试失败:', error);
  }
}

runTests();
