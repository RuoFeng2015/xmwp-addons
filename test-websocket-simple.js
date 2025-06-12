const crypto = require('crypto');

console.log('=== WebSocket握手头信息测试 ===');

// 模拟浏览器发送的WebSocket升级请求
const websocketKey = 'dGhlIHNhbXBsZSBub25jZQ==';
console.log('1. 浏览器发送的Sec-WebSocket-Key:', websocketKey);

// 计算正确的Accept值
const websocketAccept = crypto.createHash('sha1')
  .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
  .digest('base64');

console.log('2. 服务器应该返回的Sec-WebSocket-Accept:', websocketAccept);

// 验证魔法字符串
const magicString = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
console.log('3. WebSocket魔法字符串:', magicString);

console.log('\n=== WebSocket升级响应头格式 ===');
console.log('HTTP/1.1 101 Switching Protocols');
console.log('Upgrade: websocket');
console.log('Connection: Upgrade');
console.log('Sec-WebSocket-Accept:', websocketAccept);

console.log('\n测试完成！');
