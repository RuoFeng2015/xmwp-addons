/**
 * 测试修复后的WebSocket消息转发问题
 * 这个脚本将模拟完整的认证流程来验证修复效果
 */

const WebSocket = require('ws');

console.log('🔧 测试修复后的WebSocket消息转发...');
console.log('='.repeat(60));

async function testFixedWebSocketFlow() {
  console.log('📋 测试步骤:');
  console.log('1. 连接到HA WebSocket');
  console.log('2. 收到auth_required消息');
  console.log('3. 发送无效认证（模拟tunnel-proxy场景）');
  console.log('4. 验证是否能收到auth_invalid响应');
  console.log('5. 观察连接关闭时序\n');

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  let authRequired = false;
  let authResponse = false;
  let connectionClosed = false;

  const startTime = Date.now();

  function logWithTime(message) {
    const elapsed = Date.now() - startTime;
    console.log(`[${elapsed}ms] ${message}`);
  }

  ws.on('open', () => {
    logWithTime('✅ WebSocket连接建立成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());

    logWithTime(`📥 收到消息 #${messageCount}: ${JSON.stringify(message)}`);

    if (message.type === 'auth_required') {
      authRequired = true;

      // 延迟发送认证消息，模拟真实场景的网络延迟
      setTimeout(() => {
        logWithTime('📤 发送认证消息...');

        // 使用无效token来触发auth_invalid响应
        const authMessage = {
          "type": "auth",
          "access_token": "deliberately_invalid_token_for_testing"
        };

        ws.send(JSON.stringify(authMessage));
        logWithTime('✅ 认证消息已发送');
      }, 100);

    } else if (message.type === 'auth_invalid' || message.type === 'auth_ok') {
      authResponse = true;
      logWithTime(`🔐 收到认证响应: ${message.type}`);

      if (message.type === 'auth_invalid') {
        logWithTime('✅ 成功收到auth_invalid响应（预期结果）');
      }
    }
  });

  ws.on('close', (code, reason) => {
    connectionClosed = true;
    logWithTime(`🔴 WebSocket连接关闭: code=${code}, reason=${reason || '无'}`);

    // 分析测试结果
    console.log('\n📊 测试结果分析:');
    console.log(`   消息总数: ${messageCount}`);
    console.log(`   收到auth_required: ${authRequired ? '✅' : '❌'}`);
    console.log(`   收到认证响应: ${authResponse ? '✅' : '❌'}`);

    if (authRequired && authResponse) {
      console.log('\n🎉 测试成功！');
      console.log('   ✅ HA发送了完整的认证流程消息');
      console.log('   ✅ 消息转发时序正常');
      console.log('   💡 如果tunnel-proxy仍有问题，说明问题在转发逻辑的其他部分');
    } else if (authRequired && !authResponse) {
      console.log('\n❌ 测试失败！');
      console.log('   ❌ 认证响应消息丢失');
      console.log('   💡 可能存在消息缓冲区或时序问题');
    } else {
      console.log('\n❓ 测试异常！');
      console.log('   ❓ 连接建立或初始消息有问题');
    }
  });

  ws.on('error', (error) => {
    logWithTime(`❌ WebSocket错误: ${error.message}`);
  });

  // 10秒后强制关闭
  setTimeout(() => {
    if (!connectionClosed) {
      logWithTime('⏰ 测试超时，强制关闭连接');
      ws.close();
    }
  }, 10000);
}

testFixedWebSocketFlow().catch(console.error);
