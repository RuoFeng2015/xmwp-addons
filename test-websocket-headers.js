const crypto = require('crypto');

/**
 * 测试WebSocket握手头信息
 */
function testWebSocketHandshake() {
  console.log('=== WebSocket握手头信息测试 ===\n');

  // 模拟浏览器发送的WebSocket升级请求
  const websocketKey = 'dGhlIHNhbXBsZSBub25jZQ==';
  console.log(`1. 浏览器发送的Sec-WebSocket-Key: ${websocketKey}`);

  // 计算正确的Accept值
  const websocketAccept = crypto.createHash('sha1')
    .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  console.log(`2. 服务器应该返回的Sec-WebSocket-Accept: ${websocketAccept}`);

  // 验证魔法字符串
  const magicString = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  console.log(`3. WebSocket魔法字符串: ${magicString}`);

  // 测试其他常见的Key值
  console.log('\n=== 测试其他WebSocket Key值 ===');
  const testKeys = [
    'x3JJHMbDL1EzLkh9GBhXDw==',
    'XYZ123ABC456DEF789==',
    '13-10-22:18:55:07:GMT'
  ];

  testKeys.forEach((key, index) => {
    const accept = crypto.createHash('sha1')
      .update(key + magicString)
      .digest('base64');
    console.log(`Key ${index + 1}: ${key} => Accept: ${accept}`);
  });

  console.log('\n=== WebSocket升级响应头格式 ===');
  console.log('HTTP/1.1 101 Switching Protocols');
  console.log('Upgrade: websocket');
  console.log('Connection: Upgrade');
  console.log(`Sec-WebSocket-Accept: ${websocketAccept}`);
  console.log('');
}

/**
 * 测试当前隧道代理的WebSocket Accept计算
 */
function testTunnelProxyWebSocketAccept() {
  console.log('=== 隧道代理WebSocket Accept计算测试 ===\n');

  // 模拟隧道代理收到的消息
  const mockMessage = {
    upgrade_id: 'test-upgrade-123',
    headers: {
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
      'sec-websocket-protocol': 'chat'
    }
  };

  console.log('隧道代理收到的WebSocket升级请求:');
  console.log(JSON.stringify(mockMessage, null, 2));

  // 计算Accept值（复制隧道代理的逻辑）
  const websocketKey = mockMessage.headers['sec-websocket-key'];
  const websocketAccept = websocketKey ?
    crypto.createHash('sha1')
      .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64') :
    'dummy-accept-key';

  console.log(`\n计算的WebSocket Accept: ${websocketAccept}`);

  // 构造隧道代理应该发送的响应
  const response = {
    type: 'websocket_upgrade_response',
    upgrade_id: mockMessage.upgrade_id,
    status_code: 101,
    headers: {
      'upgrade': 'websocket',
      'connection': 'upgrade',
      'sec-websocket-accept': websocketAccept
    }
  };

  console.log('\n隧道代理应该发送的响应:');
  console.log(JSON.stringify(response, null, 2));
}

/**
 * 测试WebSocket帧格式
 */
function testWebSocketFrameFormat() {
  console.log('\n=== WebSocket帧格式测试 ===\n');

  // 文本帧示例
  const textMessage = 'Hello WebSocket!';
  const textBuffer = Buffer.from(textMessage, 'utf8');

  console.log(`文本消息: "${textMessage}"`);
  console.log(`UTF-8编码: ${textBuffer.toString('hex')}`);
  console.log(`Base64编码: ${textBuffer.toString('base64')}`);

  // 二进制帧示例
  const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xFF, 0xFE]);
  console.log(`\n二进制数据: ${Array.from(binaryData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`Base64编码: ${binaryData.toString('base64')}`);
}

// 运行所有测试
if (require.main === module) {
  testWebSocketHandshake();
  testTunnelProxyWebSocketAccept();
  testWebSocketFrameFormat();
}

module.exports = {
  testWebSocketHandshake,
  testTunnelProxyWebSocketAccept,
  testWebSocketFrameFormat
};
