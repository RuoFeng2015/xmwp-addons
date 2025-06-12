/**
 * 测试WebSocket认证消息转发修复
 * 验证auth_invalid消息是否能够正确传递到浏览器
 */

const WebSocket = require('ws');

console.log('🔧 测试WebSocket认证消息转发修复');
console.log('='.repeat(60));

async function testWebSocketFix() {
  console.log('🔍 测试连接过程...');
  console.log('📋 预期结果: 浏览器应该能收到完整的认证流程消息');
  console.log('   1. auth_required ✅');
  console.log('   2. auth_invalid ✅ (修复后应该能收到)');
  console.log('   3. 连接关闭 ✅');

  // 测试直接连接HA
  console.log('\n🔗 1. 首先测试直接连接到Home Assistant...');
  const directResult = await testDirectConnection();

  if (directResult.success) {
    console.log('✅ 直接连接测试通过');
    console.log(`📊 消息统计: 收到${directResult.messageCount}条消息`);
    console.log(`📝 消息列表: ${directResult.messages.map(m => m.type).join(' → ')}`);
  } else {
    console.log('❌ 直接连接测试失败');
    return;
  }

  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 测试通过隧道代理连接
  console.log('\n🔗 2. 测试通过隧道代理连接...');
  const proxyResult = await testProxyConnection();

  if (proxyResult.success) {
    console.log('✅ 隧道代理连接测试通过');
    console.log(`📊 消息统计: 收到${proxyResult.messageCount}条消息`);
    console.log(`📝 消息列表: ${proxyResult.messages.map(m => m.type).join(' → ')}`);
  } else {
    console.log('❌ 隧道代理连接测试失败');
    return;
  }

  // 比较结果
  console.log('\n📊 结果对比:');
  console.log(`直接连接消息数: ${directResult.messageCount}`);
  console.log(`代理连接消息数: ${proxyResult.messageCount}`);

  if (directResult.messageCount === proxyResult.messageCount) {
    console.log('✅ 修复成功！代理连接消息数量与直接连接一致');

    // 检查是否都收到了auth_invalid
    const directHasAuthInvalid = directResult.messages.some(m => m.type === 'auth_invalid');
    const proxyHasAuthInvalid = proxyResult.messages.some(m => m.type === 'auth_invalid');

    if (directHasAuthInvalid && proxyHasAuthInvalid) {
      console.log('✅ 完美！两种连接方式都正确收到了auth_invalid消息');
    } else if (!directHasAuthInvalid && !proxyHasAuthInvalid) {
      console.log('⚠️  两种连接都没收到auth_invalid，可能是token有效或其他原因');
    } else {
      console.log('❌ 认证消息接收不一致，仍存在问题');
    }
  } else {
    console.log('❌ 修复可能不完全，消息数量仍不一致');
  }
}

function testDirectConnection() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

    let messageCount = 0;
    const messages = [];
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('   ✅ 直接连接建立');
    });

    ws.on('message', (data) => {
      messageCount++;
      const elapsed = Date.now() - startTime;

      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        console.log(`   📥 [${elapsed}ms] 收到消息 #${messageCount}: ${message.type}`);

        if (message.type === 'auth_required') {
          // 发送无效认证
          const authMessage = {
            "type": "auth",
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIyZjRlOGZkYmNkNGE0YWIwYjA2NDRjYmE3ZTJmMjE5YiIsImlhdCI6MTc0OTcxOTY3MiwiZXhwIjoxNzQ5NzIxNDcyfQ.Xi68yAh-dqfuJxHyvtJJd8G-x0Xbs-blL-VMN8DwwGw"
          };
          ws.send(JSON.stringify(authMessage));
          console.log(`   📤 [${elapsed}ms] 发送无效认证消息`);
        }
      } catch (e) {
        console.log(`   ❌ [${elapsed}ms] 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`   🔴 [${elapsed}ms] 直接连接关闭: code=${code}, reason=${reason || '无'}`);

      resolve({
        success: true,
        messageCount,
        messages,
        duration: elapsed
      });
    });

    ws.on('error', (error) => {
      console.log(`   ❌ 直接连接错误: ${error.message}`);
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

function testProxyConnection() {
  return new Promise((resolve) => {
    // 尝试连接到隧道代理
    const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');

    let messageCount = 0;
    const messages = [];
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('   ✅ 代理连接建立');
    });

    ws.on('message', (data) => {
      messageCount++;
      const elapsed = Date.now() - startTime;

      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        console.log(`   📥 [${elapsed}ms] 收到消息 #${messageCount}: ${message.type}`);

        if (message.type === 'auth_required') {
          // 发送无效认证
          const authMessage = {
            "type": "auth",
            "access_token": "invalid_token_for_fix_test"
          };
          ws.send(JSON.stringify(authMessage));
          console.log(`   📤 [${elapsed}ms] 发送无效认证消息`);
        }
      } catch (e) {
        console.log(`   ❌ [${elapsed}ms] 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`   🔴 [${elapsed}ms] 代理连接关闭: code=${code}, reason=${reason || '无'}`);

      resolve({
        success: true,
        messageCount,
        messages,
        duration: elapsed
      });
    });

    ws.on('error', (error) => {
      console.log(`   ❌ 代理连接错误: ${error.message}`);
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

// 运行测试
testWebSocketFix().catch(console.error);
