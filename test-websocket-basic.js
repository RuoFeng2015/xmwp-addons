const crypto = require('crypto');

console.log('🚀 WebSocket端到端测试开始\n');

// 测试WebSocket头计算
console.log('=== 测试WebSocket头计算 ===');

const testCases = [
  'dGhlIHNhbXBsZSBub25jZQ==',
  'x3JJHMbDL1EzLkh9GBhXDw==',
  'AQIDBAUGBwgJCgsMDQ4PEC=='
];

testCases.forEach((key, index) => {
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  console.log(`✅ WebSocket Key ${index + 1}: ${key} => Accept: ${accept}`);
});

// 测试升级请求格式
console.log('\n=== 测试WebSocket升级请求格式 ===');

const websocketKey = crypto.randomBytes(16).toString('base64');
console.log(`✅ 生成的WebSocket Key: ${websocketKey}`);

const expectedAccept = crypto.createHash('sha1')
  .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
  .digest('base64');
console.log(`✅ 期望的Accept值: ${expectedAccept}`);

// 模拟HTTP升级请求
const upgradeRequest = [
  'GET /api/websocket HTTP/1.1',
  'Host: localhost:3081',
  'Upgrade: websocket',
  'Connection: Upgrade',
  `Sec-WebSocket-Key: ${websocketKey}`,
  'Sec-WebSocket-Version: 13',
  'Sec-WebSocket-Protocol: chat',
  '',
  ''
].join('\r\n');

console.log('\n✅ WebSocket升级请求格式:');
console.log(upgradeRequest);

// 模拟期望的响应
const upgradeResponse = [
  'HTTP/1.1 101 Switching Protocols',
  'Upgrade: websocket',
  'Connection: Upgrade',
  `Sec-WebSocket-Accept: ${expectedAccept}`,
  '',
  ''
].join('\r\n');

console.log('✅ 期望的WebSocket升级响应:');
console.log(upgradeResponse);

console.log('\n🎉 基础WebSocket测试完成！');
console.log('\n💡 下一步：启动服务器并测试真实连接');
