const WebSocket = require('ws');

console.log('🔍 基础WebSocket连接测试...');

const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

ws.on('open', () => {
  console.log('✅ WebSocket连接成功');
});

ws.on('message', (data) => {
  console.log('📥 收到消息:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log(`🔴 连接关闭: code=${code}, reason=${reason}`);
});

ws.on('error', (error) => {
  console.log(`❌ 连接错误: ${error.message}`);
});

setTimeout(() => {
  console.log('⏰ 超时关闭');
  ws.close();
}, 5000);
