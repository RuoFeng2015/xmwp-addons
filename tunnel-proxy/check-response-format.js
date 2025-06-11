/**
 * 检测当前响应是否为base64编码
 */
const http = require('http');

console.log('🔍 检测当前响应格式');
console.log('=====================================\n');

function isBase64(str) {
  try {
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch (err) {
    return false;
  }
}

const options = {
  hostname: '110.41.20.134',
  port: 3081,
  path: '/ha-client-001/',
  method: 'GET',
  headers: {
    'User-Agent': 'Debug-Client/1.0',
    'Accept': 'text/html'
  }
};

console.log('发送测试请求...\n');

const req = http.request(options, (res) => {
  console.log(`状态: ${res.statusCode} ${res.statusMessage}`);
  console.log(`Content-Type: ${res.headers['content-type']}`);
  console.log(`Content-Encoding: ${res.headers['content-encoding']}`);
  console.log(`Content-Length: ${res.headers['content-length']}\n`);

  let rawBody = Buffer.alloc(0);
  
  res.on('data', chunk => {
    rawBody = Buffer.concat([rawBody, chunk]);
  });

  res.on('end', () => {
    const bodyText = rawBody.toString();
    
    console.log('响应体分析:');
    console.log(`  原始长度: ${rawBody.length} 字节`);
    console.log(`  文本长度: ${bodyText.length} 字符`);
    console.log(`  前50字符: ${bodyText.substring(0, 50)}...`);
    
    // 检测是否为base64
    const isValidBase64 = isBase64(bodyText.trim());
    console.log(`  是否为Base64: ${isValidBase64 ? '✅' : '❌'}`);
    
    if (isValidBase64) {
      console.log('\n✅ 检测到Base64编码响应！客户端修改已生效');
      
      try {
        const decoded = Buffer.from(bodyText.trim(), 'base64');
        console.log(`  解码后长度: ${decoded.length} 字节`);
        
        // 尝试解压
        const zlib = require('zlib');
        const decompressed = zlib.inflateSync(decoded);
        const html = decompressed.toString();
        
        console.log(`  解压后长度: ${html.length} 字符`);
        console.log(`  HTML开头: ${html.substring(0, 100)}...`);
        
        if (html.toLowerCase().includes('<!doctype html')) {
          console.log('\n🎉 完美！现在只需要修复服务器端的解码逻辑');
        }
        
      } catch (error) {
        console.log(`  解码/解压失败: ${error.message}`);
      }
      
    } else {
      console.log('\n❌ 仍然是原始响应格式，客户端修改未生效');
      console.log('可能需要重启容器或检查客户端代码部署');
    }
  });
});

req.on('error', (error) => {
  console.error(`请求失败: ${error.message}`);
});

req.end();
