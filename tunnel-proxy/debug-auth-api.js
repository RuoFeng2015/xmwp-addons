/**
 * 调试Home Assistant认证API请求
 */
const http = require('http');

console.log('🔍 调试Home Assistant认证API问题');
console.log('=====================================\n');

// 模拟Home Assistant登录流程中的请求
function testLoginFlowRequest() {
  const postData = JSON.stringify({
    "client_id": "http://110.41.20.134:3081/",
    "handler": ["homeassistant", null],
    "redirect_uri": "http://110.41.20.134:3081/ha-client-001?auth_callback=1"
  });

  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/auth/login_flow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'http://110.41.20.134:3081',
      'Referer': 'http://110.41.20.134:3081/ha-client-001/auth/authorize'
    }
  };

  console.log('📤 发送POST请求到认证API:');
  console.log(`   URL: http://${options.hostname}:${options.port}${options.path}`);
  console.log(`   Method: ${options.method}`);
  console.log(`   Headers: ${JSON.stringify(options.headers, null, 2)}`);
  console.log(`   Body: ${postData}\n`);

  const req = http.request(options, (res) => {
    console.log('📥 收到响应:');
    console.log(`   状态: ${res.statusCode} ${res.statusMessage}`);
    console.log(`   响应头:`);
    
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
      console.log(`   内容: ${responseBody}\n`);

      console.log('🔧 诊断结果:');
      
      if (res.statusCode === 400) {
        console.log('   ❌ 400错误：Bad Request');
        
        if (responseBody.includes('Invalid JSON')) {
          console.log('   ❌ JSON格式错误');
          console.log('   可能原因:');
          console.log('     1. 请求体在隧道传输中被损坏');
          console.log('     2. Content-Type头丢失或错误');
          console.log('     3. 请求体编码问题');
          console.log('     4. Content-Length不匹配');
        }
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('   ✅ 请求成功');
      } else {
        console.log(`   ⚠️ 意外状态码: ${res.statusCode}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ 请求失败: ${error.message}`);
  });

  // 发送请求体
  req.write(postData);
  req.end();
}

// 也测试一个简单的GET请求以确保连接正常
function testSimpleGet() {
  console.log('首先测试简单的GET请求...\n');
  
  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/api/',
    method: 'GET',
    headers: {
      'User-Agent': 'Debug-Client/1.0'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`GET测试: ${res.statusCode} ${res.statusMessage}`);
    
    if (res.statusCode === 200 || res.statusCode === 401) {
      console.log('✅ 基本连接正常，开始测试POST请求...\n');
      testLoginFlowRequest();
    } else {
      console.log('❌ 基本连接有问题，停止测试');
    }
  });

  req.on('error', (error) => {
    console.error(`GET测试失败: ${error.message}`);
  });

  req.end();
}

testSimpleGet();
