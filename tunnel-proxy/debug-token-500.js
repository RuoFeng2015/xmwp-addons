/**
 * 调试 /auth/token 500错误
 */
const http = require('http');

console.log('🔍 调试 /auth/token 500错误');
console.log('=====================================\n');

// 模拟获取token的POST请求
function testTokenRequest() {
  // 这是Home Assistant OAuth流程中获取访问令牌的请求
  const postData = JSON.stringify({
    "grant_type": "authorization_code",
    "code": "test_authorization_code", // 这个在实际情况下是从授权步骤获得的
    "client_id": "http://110.41.20.134:3081/"
  });

  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/auth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Origin': 'http://110.41.20.134:3081',
      'Referer': 'http://110.41.20.134:3081/ha-client-001/'
    }
  };

  console.log('📤 发送POST请求到token端点:');
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
      
      if (res.statusCode === 500) {
        console.log('   ❌ 500错误：内部服务器错误');
        console.log('   可能原因:');
        console.log('     1. 请求体格式不正确');
        console.log('     2. 隧道服务器处理请求体时出错');
        console.log('     3. Home Assistant内部处理异常');
        console.log('     4. Content-Type头处理问题');
        
        if (responseBody.includes('Server got itself in trouble')) {
          console.log('   ❌ 这是Koa/Node.js的通用错误消息');
          console.log('   建议检查隧道服务器日志以获取具体错误信息');
        }
      } else if (res.statusCode === 400) {
        console.log('   ❌ 400错误：请求格式问题');
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('   ✅ 请求成功');
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ 请求失败: ${error.message}`);
  });

  req.write(postData);
  req.end();
}

// 也测试一个简单的GET请求确保连接正常
function testSimpleGet() {
  console.log('首先测试到token端点的GET请求...\n');
  
  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/auth/token',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`GET测试: ${res.statusCode} ${res.statusMessage}`);
    
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`GET响应体: ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}\n`);
      
      console.log('现在测试POST请求...\n');
      testTokenRequest();
    });
  });

  req.on('error', (error) => {
    console.error(`GET测试失败: ${error.message}`);
  });

  req.end();
}

// 先测试不同的Content-Type
function testDifferentContentTypes() {
  console.log('测试不同的Content-Type...\n');
  
  const testCases = [
    {
      name: 'application/json',
      contentType: 'application/json',
      body: JSON.stringify({
        "grant_type": "authorization_code",
        "code": "test_code",
        "client_id": "http://110.41.20.134:3081/"
      })
    },
    {
      name: 'application/x-www-form-urlencoded',
      contentType: 'application/x-www-form-urlencoded',
      body: 'grant_type=authorization_code&code=test_code&client_id=http%3A//110.41.20.134%3A3081/'
    }
  ];
  
  let currentTest = 0;
  
  function runNextTest() {
    if (currentTest >= testCases.length) {
      console.log('所有Content-Type测试完成\n');
      return;
    }
    
    const testCase = testCases[currentTest];
    console.log(`🧪 测试 ${testCase.name}:`);
    
    const options = {
      hostname: '110.41.20.134',
      port: 3081,
      path: '/ha-client-001/auth/token',
      method: 'POST',
      headers: {
        'Content-Type': testCase.contentType,
        'Content-Length': Buffer.byteLength(testCase.body),
        'User-Agent': 'Debug-Client/1.0'
      }
    };
    
    const req = http.request(options, (res) => {
      console.log(`   状态: ${res.statusCode} ${res.statusMessage}`);
      
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   响应: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}\n`);
        
        currentTest++;
        setTimeout(runNextTest, 1000);
      });
    });
    
    req.on('error', (error) => {
      console.log(`   错误: ${error.message}\n`);
      currentTest++;
      setTimeout(runNextTest, 1000);
    });
    
    req.write(testCase.body);
    req.end();
  }
  
  runNextTest();
}

testDifferentContentTypes();
