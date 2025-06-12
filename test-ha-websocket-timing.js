const WebSocket = require('ws');

/**
 * 测试HA WebSocket认证失败的完整流程
 * 包括消息接收时序
 */
async function testHAWebSocketAuthTiming() {
  console.log('🔍 测试HA WebSocket认证失败的消息时序...');
  
  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
  
  let messageCount = 0;
  let closeReceived = false;
  const messages = [];

  ws.on('open', () => {
    console.log('✅ 连接到HA WebSocket成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    messages.push({
      seq: messageCount,
      timestamp: Date.now(),
      message: message
    });
    
    console.log(`📥 收到HA消息 #${messageCount} [${new Date().toISOString()}]:`, message);

    if (message.type === 'auth_required') {
      console.log('🔐 HA要求认证，发送错误认证消息...');
      
      // 使用错误的token测试认证失败情况
      const authMessage = {
        type: 'auth',
        access_token: 'invalid_token_for_test'
      };
      
      console.log('📤 发送认证消息:', authMessage);
      ws.send(JSON.stringify(authMessage));
    }
  });

  ws.on('close', (code, reason) => {
    closeReceived = true;
    const closeTime = Date.now();
    console.log(`❌ WebSocket连接关闭 [${new Date().toISOString()}]: code=${code}, reason=${reason?.toString()}`);
    console.log(`总共收到 ${messageCount} 条消息`);
    
    if (messages.length >= 2) {
      const authInvalidTime = messages[1].timestamp;
      const timeDiff = closeTime - authInvalidTime;
      console.log(`⏱️  从收到auth_invalid到连接关闭的时间差: ${timeDiff}ms`);
    }
    
    // 打印所有消息的时序
    console.log('\n📋 消息时序分析:');
    messages.forEach(msg => {
      console.log(`  ${msg.seq}. [${new Date(msg.timestamp).toISOString()}] ${msg.message.type}`);
    });
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });

  // 10秒后自动关闭（如果还没关闭）
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏰ 测试超时，关闭连接');
      ws.close();
    }
  }, 10000);
}

// 运行测试
testHAWebSocketAuthTiming().catch(console.error);
