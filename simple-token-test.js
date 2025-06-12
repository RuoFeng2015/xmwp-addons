const WebSocket = require('ws');

console.log('🔍 调试JWT Token验证...');

// 用户提供的token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjNGExN2ZiOTRmNmM0MGY4YTVlZTkzYWZlNmMyMmI5NyIsImlhdCI6MTc0OTcxNjg3OCwiZXhwIjoxNzQ5NzE4Njc4fQ.1zK9K3uadhz4gSDfuTPOpwR1P8O8_Cltv0qVTttX8LQ";

// 解析token
try {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const now = Math.floor(Date.now() / 1000);

  console.log(`📅 Token信息:`);
  console.log(`   发行时间: ${new Date(payload.iat * 1000).toISOString()}`);
  console.log(`   过期时间: ${new Date(payload.exp * 1000).toISOString()}`);
  console.log(`   当前时间: ${new Date(now * 1000).toISOString()}`);
  console.log(`   是否过期: ${now > payload.exp ? '❌ 是' : '✅ 否'}`);

  if (now > payload.exp) {
    console.log('⚠️  Token已过期！这就是认证失败的原因！');
    process.exit(0);
  }
} catch (e) {
  console.log(`❌ Token解析失败: ${e.message}`);
}

console.log(`\n🔗 测试HA WebSocket认证...`);

const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

ws.on('open', () => {
  console.log('✅ 连接成功');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log(`📥 收到: ${JSON.stringify(message)}`);

  if (message.type === 'auth_required') {
    console.log('🔐 发送认证...');
    ws.send(JSON.stringify({
      type: 'auth',
      access_token: token
    }));
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔴 关闭: code=${code}`);
});

ws.on('error', (error) => {
  console.log(`❌ 错误: ${error.message}`);
});

setTimeout(() => {
  ws.close();
}, 10000);
