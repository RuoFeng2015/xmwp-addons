/**
 * 测试隧道服务器的请求体处理
 */
const http = require('http');

console.log('=== 测试隧道服务器请求体处理 ===');

// 发送GET请求到隧道服务器，检查是否意外包含请求体
const options = {
  hostname: '110.41.20.134',
  port: 3081,
  path: '/ha-client-001/',
  method: 'GET',
  headers: {
    'User-Agent': 'Test-Client/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  }
};

console.log('发送请求:', options);

const req = http.request(options, (res) => {
  console.log(`\n响应状态: ${res.statusCode} ${res.statusMessage}`);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', chunk => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\n响应体长度:', body.length);
    console.log('响应体内容:', body);
    
    if (res.statusCode === 400) {
      console.log('\n❌ 确认仍有400错误');
    } else {
      console.log('\n✅ 请求成功');
    }
  });
});

req.on('error', (error) => {
  console.error('请求错误:', error.message);
});

// 关键：不写任何数据到请求体，直接结束
console.log('结束请求（无请求体）');
req.end();
