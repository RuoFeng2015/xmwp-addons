/**
 * 测试Home Assistant WebSocket认证流程
 */

const WebSocket = require('ws');

console.log('🔍 测试Home Assistant WebSocket认证流程');

async function testHAAuth() {
  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;

  ws.on('open', () => {
    console.log('✅ 直接连接到HA WebSocket成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    console.log(`📥 收到HA消息 #${messageCount}:`, message);

    if (message.type === 'auth_required') {
      console.log('🔐 HA要求认证，发送认证消息...');
      const authMessage = {
        "type": "auth",
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwZjgwMzRmZTIyODY0NDY1OGRhZDUxZGM5YmMwMjA3NCIsImlhdCI6MTc0OTY5NjI0NCwiZXhwIjoxNzQ5Njk4MDQ0fQ.OTny2nKRkaOIivCHXndfyzqd5HWInkR5uPInF7dKvts"
      };

      console.log('📤 发送认证消息:', JSON.stringify(authMessage));
      ws.send(JSON.stringify(authMessage));
    } else if (message.type === 'auth_ok') {
      console.log('✅ 认证成功！');
      ws.close();
    } else if (message.type === 'auth_invalid') {
      console.log('❌ 认证失败！');
      ws.close();
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔴 WebSocket连接关闭: code=${code}, reason=${reason}`);
    console.log(`📊 总共收到 ${messageCount} 条消息`);
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket连接错误: ${error.message}`);
  });

  // 10秒后自动关闭
  setTimeout(() => {
    console.log('⏰ 测试超时，关闭连接');
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }, 10000);
}

testHAAuth().catch(console.error);
