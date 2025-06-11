/**
 * 测试add-on如何处理没有Host头的请求
 */
const http = require('http');

// 模拟隧道服务器发送的消息（没有Host头）
const testMessage = {
  type: 'proxy_request',
  request_id: 'test-123',
  method: 'GET',
  url: '/',
  headers: {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    'accept-encoding': 'gzip, deflate',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'upgrade-insecure-requests': '1'
    // 注意：没有 'host' 头
  },
  body: ''
};

console.log('=== 测试add-on对无Host头请求的处理 ===');
console.log('原始消息（无Host头）:', JSON.stringify(testMessage.headers, null, 2));

// 模拟add-on的处理逻辑
const hostname = '192.168.6.170';
const port = 8123;

const options = {
  hostname: hostname,
  port: port,
  path: testMessage.url,
  method: testMessage.method,
  headers: { ...testMessage.headers },
  family: 4,
  timeout: 5000
};

// add-on设置正确的Host头
options.headers['host'] = `${hostname}:${port}`;

// 删除冲突的头信息
delete options.headers['connection'];
delete options.headers['content-length'];
delete options.headers['transfer-encoding'];

// 确保有User-Agent
if (!options.headers['user-agent']) {
  options.headers['user-agent'] = 'HomeAssistant-Tunnel-Proxy/1.0.8';
}

console.log('\n=== add-on处理后的请求头 ===');
console.log(JSON.stringify(options.headers, null, 2));

console.log('\n=== 发送请求到Home Assistant ===');
console.log(`目标: ${hostname}:${port}${testMessage.url}`);

const proxyReq = http.request(options, (proxyRes) => {
  console.log(`\n✅ 响应状态: HTTP ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
  console.log('响应头:', JSON.stringify(proxyRes.headers, null, 2));

  let responseBody = '';
  proxyRes.on('data', chunk => {
    responseBody += chunk;
  });

  proxyRes.on('end', () => {
    console.log('\n=== 响应体预览 ===');
    console.log(responseBody.substring(0, 500) + (responseBody.length > 500 ? '...' : ''));
    
    if (proxyRes.statusCode === 400) {
      console.log('\n❌ 仍然收到400错误！');
      console.log('这表明问题可能不只是Host头的问题');
    } else {
      console.log('\n✅ 请求成功！Host头修复有效');
    }
    process.exit(0);
  });
});

proxyReq.on('error', (error) => {
  console.error('\n❌ 请求失败:', error.message);
  process.exit(1);
});

proxyReq.end();
