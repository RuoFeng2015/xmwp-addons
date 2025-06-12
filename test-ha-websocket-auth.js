const WebSocket = require('ws');

/**
 * 测试Home Assistant WebSocket认证流程
 */
async function testHAWebSocketAuth() {
  console.log('🔍 测试HA WebSocket认证流程...');

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  let authToken = null;

  ws.on('open', () => {
    console.log('✅ 连接到HA WebSocket成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    console.log(`📥 收到HA消息 #${messageCount}:`, message);

    if (message.type === 'auth_required') {
      console.log('🔐 HA要求认证，发送认证消息...');

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
    console.log(`❌ WebSocket连接关闭: code=${code}, reason=${reason?.toString()}`);
    console.log(`总共收到 ${messageCount} 条消息`);
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });

  // 10秒后自动关闭
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏰ 测试超时，关闭连接');
      ws.close();
    }
  }, 10000);
}

// 运行测试
testHAWebSocketAuth().catch(console.error);
