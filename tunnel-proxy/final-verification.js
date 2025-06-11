/**
 * 最终验证脚本 - 确认HTTP 400错误修复完成
 */
const http = require('http');

console.log('🔍 Home Assistant隧道代理修复验证');
console.log('=====================================\n');

// 测试不同类型的请求
const tests = [
  {
    name: 'GET 根路径',
    method: 'GET',
    path: '/ha-client-001/',
    expectedStatus: 200
  },
  {
    name: 'GET API状态',
    method: 'GET', 
    path: '/ha-client-001/api/',
    expectedStatus: 200
  },
  {
    name: 'GET 登录页面',
    method: 'GET',
    path: '/ha-client-001/auth/login',
    expectedStatus: 200
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: '110.41.20.134',
      port: 3081,
      path: test.path,
      method: test.method,
      headers: {
        'User-Agent': 'HA-Tunnel-Verification/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };

    console.log(`🧪 测试: ${test.name}`);
    console.log(`   请求: ${test.method} ${test.path}`);

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const success = res.statusCode === test.expectedStatus;
        console.log(`   响应: ${res.statusCode} ${res.statusMessage}`);
        console.log(`   结果: ${success ? '✅ 通过' : '❌ 失败'}`);
        
        if (res.statusCode === 400) {
          console.log(`   错误详情: ${body}`);
        }
        
        console.log('');
        resolve({ test: test.name, success, statusCode: res.statusCode });
      });
    });

    req.on('error', (error) => {
      console.log(`   错误: ${error.message}`);
      console.log(`   结果: ❌ 失败\n`);
      resolve({ test: test.name, success: false, error: error.message });
    });

    req.end();
  });
}

async function runAllTests() {
  console.log('开始验证测试...\n');
  
  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }

  console.log('📊 测试总结');
  console.log('=====================================');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log(`总计: ${total} 个测试`);
  console.log(`通过: ${passed} 个测试`);
  console.log(`失败: ${total - passed} 个测试\n`);

  if (passed === total) {
    console.log('🎉 所有测试通过！HTTP 400错误已完全修复！');
    console.log('✅ 隧道代理现在可以正常工作');
    console.log('✅ Home Assistant可以通过外部网络访问');
  } else {
    console.log('⚠️  仍有部分测试失败，需要进一步调查');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.test}: ${r.error || `状态码 ${r.statusCode}`}`);
    });
  }
}

runAllTests().catch(console.error);
