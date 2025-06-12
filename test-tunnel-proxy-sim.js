/**
 * 模拟tunnel-proxy的WebSocket处理，看看是否遗漏消息
 */

const WebSocket = require('ws');

console.log('🔍 模拟tunnel-proxy的WebSocket处理流程');

async function simulateTunnelProxy() {
  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  const messages = [];

  ws.on('open', () => {
    console.log('✅ tunnel-proxy模拟：连接到HA成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    messages.push(message);

    console.log(`📥 tunnel-proxy收到HA消息 #${messageCount}:`, message);

    // 模拟转发给tunnel-server（base64编码）
    const forwardMessage = {
      type: 'websocket_data',
      upgrade_id: 'test-upgrade-id',
      data: data.toString('base64')
    };
    console.log(`📤 tunnel-proxy转发消息 #${messageCount} 到tunnel-server`);

    if (message.type === 'auth_required') {
      console.log('🔐 收到认证要求，等待浏览器发送认证...');

      // 模拟3秒后浏览器发送认证消息
      setTimeout(() => {
        const authMessage = {
          "type": "auth",
          "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwZjgwMzRmZTIyODY0NDY1OGRhZDUxZGM5YmMwMjA3NCIsImlhdCI6MTc0OTY5NjI0NCwiZXhwIjoxNzQ5Njk4MDQ0fQ.OTny2nKRkaOIivCHXndfyzqd5HWInkR5uPInF7dKvts"
        };

        console.log('📤 tunnel-proxy发送认证消息到HA:', JSON.stringify(authMessage));
        ws.send(JSON.stringify(authMessage));
      }, 3000);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔴 tunnel-proxy模拟：WebSocket连接关闭: code=${code}, reason=${reason}`);
    console.log(`📊 总共收到 ${messageCount} 条消息`);
    console.log('📝 所有消息:', messages);
  });

  ws.on('error', (error) => {
    console.log(`❌ tunnel-proxy模拟：WebSocket连接错误: ${error.message}`);
  });

  // 15秒后自动关闭
  setTimeout(() => {
    console.log('⏰ 测试超时，关闭连接');
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }, 15000);
}

simulateTunnelProxy().catch(console.error);
