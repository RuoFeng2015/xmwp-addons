/**
 * 测试隧道服务器的WebSocket升级支持
 */
const http = require('http');

console.log('🔍 测试隧道服务器WebSocket升级支持');
console.log('=====================================\n');

// 模拟WebSocket升级请求
const options = {
  hostname: '110.41.20.134',
  port: 3081,
  path: '/ha-client-001/api/websocket',
  method: 'GET',
  headers: {
    'Connection': 'Upgrade',
    'Upgrade': 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'User-Agent': 'WebSocket-Test/1.0'
  }
};

console.log('发送WebSocket升级请求...');
console.log(`URL: http://${options.hostname}:${options.port}${options.path}`);
console.log('Headers:', JSON.stringify(options.headers, null, 2));

const req = http.request(options, (res) => {
  console.log(`\n收到响应: ${res.statusCode} ${res.statusMessage}`);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));
  
  if (res.statusCode === 101) {
    console.log('✅ WebSocket升级成功！');
  } else if (res.statusCode === 502) {
    console.log('⚠️ 502错误：可能是客户端未连接或不支持WebSocket');
  } else if (res.statusCode === 501) {
    console.log('❌ 501错误：WebSocket功能未实现（旧版本）');
  } else {
    console.log('❌ 意外的响应状态码');
  }
  
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (body) {
      console.log('响应体:', body);
    }
    process.exit(0);
  });
});

req.setTimeout(10000, () => {
  console.log('❌ 请求超时');
  req.destroy();
  process.exit(1);
});

req.on('error', (error) => {
  console.error(`请求失败: ${error.message}`);
});

req.on('upgrade', (res, socket, head) => {
  console.log('✅ WebSocket升级成功！');
  console.log('升级响应状态:', res.statusCode);
  console.log('升级响应头:', res.headers);
  
  // 模拟发送WebSocket数据
  const frame = Buffer.from([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  socket.write(frame);
  
  socket.on('data', (data) => {
    console.log('收到WebSocket数据:', data);
  });
  
  setTimeout(() => {
    socket.end();
    console.log('WebSocket连接已关闭');
  }, 3000);
});

req.end();
