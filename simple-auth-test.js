/**
 * 简单测试：使用已验证有效的token
 */

const WebSocket = require('ws');

console.log('🔍 开始WebSocket认证测试...');

const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

ws.on('open', () => {
  console.log('✅ WebSocket连接成功');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log(`📥 收到: ${data.toString()}`);

  if (message.type === 'auth_required') {
    console.log('🔐 发送认证...');
    // 使用simple-token-test.js中验证有效的token
    const authMessage = {
      "type": "auth",
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWYxNGU0OTM4NTA0YzUzOGI1Y2RlMmFiODc5MzdhOCIsImlhdCI6MTczNTYxNDQ0NSwiZXhwIjoyMDUwOTc0NDQ1fQ.hpZmAjM_4A1h4aCkXgXL1vMWLDTfS0B0IjvJj8eX-WY"
    };
    ws.send(JSON.stringify(authMessage));
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔴 连接关闭: code=${code}`);
});

ws.on('error', (error) => {
  console.log(`❌ 错误: ${error.message}`);
});

setTimeout(() => {
  if (ws.readyState === 1) ws.close();
}, 5000);
