const http = require('http');
const crypto = require('crypto');

console.log('🔍 简单WebSocket升级测试');

// 生成WebSocket Key
const websocketKey = crypto.randomBytes(16).toString('base64');
const expectedAccept = crypto.createHash('sha1')
  .update(websocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
  .digest('base64');

console.log(`发送WebSocket Key: ${websocketKey}`);
console.log(`期望Accept: ${expectedAccept}`);

const options = {
  port: 3081,
  host: 'localhost',
  path: '/api/websocket',
  headers: {
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': websocketKey,
    'Sec-WebSocket-Version': '13',
    'User-Agent': 'Simple-WebSocket-Test/1.0'
  }
};

console.log(`尝试连接: ${options.host}:${options.port}${options.path}`);

const req = http.request(options);

req.on('upgrade', (res, socket, head) => {
  console.log(`✅ 收到WebSocket升级响应: ${res.statusCode} ${res.statusMessage}`);
  
  console.log('📋 响应头:');
  Object.entries(res.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  const actualAccept = res.headers['sec-websocket-accept'];
  console.log(`\n🔑 Accept头比较:`);
  console.log(`  期望: ${expectedAccept}`);
  console.log(`  实际: ${actualAccept}`);
  
  if (actualAccept === expectedAccept) {
    console.log('✅ WebSocket Accept头验证成功！');
  } else {
    console.log('❌ WebSocket Accept头验证失败！');
  }

  socket.end();
  console.log('✅ 测试完成');
});

req.on('response', (res) => {
  console.log(`❌ 收到HTTP响应 (而非升级): ${res.statusCode} ${res.statusMessage}`);
  
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`响应体: ${body}`);
  });
});

req.on('error', (error) => {
  console.log(`❌ 请求失败: ${error.message}`);
});

req.setTimeout(10000, () => {
  console.log('❌ 请求超时');
  req.destroy();
});

req.end();
