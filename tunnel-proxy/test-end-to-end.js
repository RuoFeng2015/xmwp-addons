/**
 * 完整的端到端测试
 * 测试隧道服务器修复后是否能正确处理Home Assistant请求
 */
const http = require('http');

console.log('=== 端到端隧道测试 ===');

// 使用浏览器相同的请求头
const options = {
  hostname: '110.41.20.134',
  port: 3081,
  path: '/ha-client-001/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
};

console.log('发送完整的浏览器请求:', JSON.stringify(options, null, 2));

const req = http.request(options, (res) => {
  console.log(`\n=== 响应结果 ===`);
  console.log(`状态: ${res.statusCode} ${res.statusMessage}`);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', chunk => {
    body += chunk;
  });

  res.on('end', () => {
    console.log(`\n响应体长度: ${body.length} 字节`);
    
    if (res.statusCode === 200) {
      console.log('\n🎉 成功！隧道代理工作正常');
      console.log('响应体预览:', body.substring(0, 200) + '...');
    } else if (res.statusCode === 400) {
      console.log('\n❌ 仍然是400错误，需要进一步调试');
      console.log('响应体:', body);
    } else if (res.statusCode === 504) {
      console.log('\n⏰ 504超时错误 - 客户端可能未运行');
      console.log('这比400错误要好，说明请求体问题已解决');
    } else {
      console.log(`\n❓ 其他状态码: ${res.statusCode}`);
      console.log('响应体:', body);
    }
    
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('\n❌ 请求失败:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('\n⏰ 请求超时');
  req.destroy();
  process.exit(1);
});

// 设置超时
req.setTimeout(10000);

console.log('\n发送请求...');
req.end();
