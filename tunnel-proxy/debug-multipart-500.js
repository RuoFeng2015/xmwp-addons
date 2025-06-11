/**
 * 调试multipart/form-data请求的500错误
 */
const http = require('http');

console.log('🔍 调试multipart/form-data请求500错误');
console.log('=====================================\n');

// 模拟实际的multipart请求
function testMultipartRequest() {
  const boundary = '----WebKitFormBoundarymxi8fXdHAKTB2YVZ';
  const formData = [
    `------WebKitFormBoundarymxi8fXdHAKTB2YVZ\r\n`,
    `Content-Disposition: form-data; name="client_id"\r\n\r\n`,
    `http://110.41.20.134:3081/\r\n`,
    `------WebKitFormBoundarymxi8fXdHAKTB2YVZ\r\n`,
    `Content-Disposition: form-data; name="code"\r\n\r\n`,
    `a51268ae81514a1bae815bf45bdb014f\r\n`,
    `------WebKitFormBoundarymxi8fXdHAKTB2YVZ\r\n`,
    `Content-Disposition: form-data; name="grant_type"\r\n\r\n`,
    `authorization_code\r\n`,
    `------WebKitFormBoundarymxi8fXdHAKTB2YVZ--\r\n`
  ].join('');

  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/auth/token',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(formData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-HK;q=0.8,zh-TW;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'http://110.41.20.134:3081/ha-client-001/?auth_callback=1',
      'Origin': 'http://110.41.20.134:3081'
    }
  };

  console.log('📤 发送multipart POST请求:');
  console.log(`   URL: http://${options.hostname}:${options.port}${options.path}`);
  console.log(`   Content-Type: ${options.headers['Content-Type']}`);
  console.log(`   Content-Length: ${options.headers['Content-Length']}`);
  console.log(`   Body preview: ${formData.substring(0, 200)}...`);
  console.log('');

  const req = http.request(options, (res) => {
    console.log('📥 收到响应:');
    console.log(`   状态: ${res.statusCode} ${res.statusMessage}`);
    console.log('   响应头:');
    
    Object.entries(res.headers).forEach(([key, value]) => {
      console.log(`     ${key}: ${value}`);
    });

    let responseBody = '';
    res.on('data', chunk => {
      responseBody += chunk;
    });

    res.on('end', () => {
      console.log(`\n📝 响应体:`);
      console.log(`   长度: ${responseBody.length} 字符`);
      console.log(`   内容: ${responseBody}`);

      console.log('\n🔧 诊断结果:');
      
      if (res.statusCode === 500) {
        console.log('   ❌ 500错误：内部服务器错误');
        console.log('   可能原因:');
        console.log('     1. multipart/form-data解析失败');
        console.log('     2. body parser不支持multipart格式');
        console.log('     3. Content-Length或boundary处理问题');
        console.log('     4. 隧道服务器multipart数据传输问题');
      } else if (res.statusCode === 400) {
        console.log('   ✅ 400错误：这是预期的客户端错误');
        console.log('   说明multipart解析成功，但认证参数有问题');
      } else if (res.statusCode === 200) {
        console.log('   ✅ 请求成功');
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ 请求失败: ${error.message}`);
  });

  req.write(formData);
  req.end();
}

// 先测试一个简单的JSON请求确保服务器正常
function testJsonFirst() {
  console.log('首先测试JSON请求确保基本功能正常...\n');
  
  const jsonData = JSON.stringify({
    "client_id": "http://110.41.20.134:3081/",
    "code": "test_code",
    "grant_type": "authorization_code"
  });

  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/auth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`JSON测试: ${res.statusCode} ${res.statusMessage}`);
    
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`JSON响应: ${body}\n`);
      
      if (res.statusCode === 400) {
        console.log('✅ JSON请求正常，现在测试multipart请求...\n');
        testMultipartRequest();
      } else if (res.statusCode === 500) {
        console.log('❌ JSON请求就有500错误，基本功能异常');
      } else {
        console.log('继续测试multipart请求...\n');
        testMultipartRequest();
      }
    });
  });

  req.on('error', (error) => {
    console.error(`JSON测试失败: ${error.message}`);
    console.log('继续测试multipart请求...\n');
    testMultipartRequest();
  });

  req.write(jsonData);
  req.end();
}

testJsonFirst();
