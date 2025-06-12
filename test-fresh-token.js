/**
 * 使用最新有效token测试WebSocket认证
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

async function testWithFreshToken() {
  // 创建一个新的长期有效token（用于测试）
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWYxNGU0OTM4NTA0YzUzOGI1Y2RlMmFiODc5MzdhOCIsImlhdCI6MTczNTYxNDU0NCwiZXhwIjoyMDUwOTc0NTQ0fQ.T8_yoJOQeA9f8xqFALnFgckWLhJ6iKJhVkjBpClAB4Q";

  console.log('🔍 使用新token测试WebSocket认证...');

  // 解析token信息
  try {
    const decoded = jwt.decode(token);
    const now = Math.floor(Date.now() / 1000);

    console.log('📅 Token信息:');
    console.log(`   发行时间: ${new Date(decoded.iat * 1000).toISOString()}`);
    console.log(`   过期时间: ${new Date(decoded.exp * 1000).toISOString()}`);
    console.log(`   当前时间: ${new Date(now * 1000).toISOString()}`);
    console.log(`   是否过期: ${now > decoded.exp ? '❌ 是' : '✅ 否'}`);
    console.log(`   剩余时间: ${Math.floor((decoded.exp - now) / 60)} 分钟`);
  } catch (error) {
    console.log(`❌ Token解析失败: ${error.message}`);
    return;
  }

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;

  ws.on('open', () => {
    console.log('\n✅ WebSocket连接建立成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    console.log(`📥 收到消息 #${messageCount}: ${data.toString()}`);

    if (message.type === 'auth_required') {
      console.log('\n🔐 发送认证消息...');

      const authMessage = {
        "type": "auth",
        "access_token": token
      };

      ws.send(JSON.stringify(authMessage));
      console.log('✅ 认证消息已发送');
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`\n🔴 WebSocket关闭: code=${code}, reason=${reason}`);
    console.log(`📊 总共收到 ${messageCount} 条消息`);
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });

  // 10秒后关闭
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }, 10000);
}

testWithFreshToken().catch(console.error);
