/**
 * 用户场景测试：模拟真实的Home Assistant WebSocket连接
 * 验证修复后的tunnel-proxy是否能正确处理认证流程
 */

const WebSocket = require('ws');

console.log('🏠 Home Assistant WebSocket连接测试');
console.log('模拟用户通过tunnel-proxy连接HA的真实场景');
console.log('='.repeat(60));

async function testRealUserScenario() {
  console.log('📋 测试场景:');
  console.log('1. 用户在浏览器中访问HA');
  console.log('2. 浏览器建立WebSocket连接');
  console.log('3. HA要求认证');
  console.log('4. 用户提供访问令牌');
  console.log('5. HA验证并响应\n');

  // 场景1: 成功认证流程
  console.log('🔄 场景1: 模拟成功认证...');
  await testAuthenticationFlow(true);

  // 场景2: 失败认证流程  
  console.log('\n🔄 场景2: 模拟认证失败...');
  await testAuthenticationFlow(false);

  console.log('\n📊 测试总结:');
  console.log('✅ 如果两个场景都能收到完整的认证响应，说明修复成功');
  console.log('❌ 如果任何场景缺失认证响应，说明仍有问题需要解决');
}

function testAuthenticationFlow(useValidToken) {
  return new Promise((resolve) => {
    console.log(`   🔗 连接到HA WebSocket...`);

    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

    let authRequired = false;
    let authResponse = false;
    let responseType = null;
    const startTime = Date.now();

    function logWithTime(message) {
      const elapsed = Date.now() - startTime;
      console.log(`   [${elapsed}ms] ${message}`);
    }

    ws.on('open', () => {
      logWithTime('✅ WebSocket连接建立');
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      logWithTime(`📥 收到: ${message.type}`);

      if (message.type === 'auth_required') {
        authRequired = true;

        // 根据测试参数选择token
        const token = useValidToken
          ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWYxNGU0OTM4NTA0YzUzOGI1Y2RlMmFiODc5MzdhOCIsImlhdCI6MTczNTYxNDQ0NSwiZXhwIjoyMDUwOTc0NDQ1fQ.hpZmAjM_4A1h4aCkXgXL1vMWLDTfS0B0IjvJj8eX-WY"
          : "invalid_token_for_testing";

        logWithTime(`📤 发送${useValidToken ? '有效' : '无效'}认证令牌`);

        const authMessage = {
          "type": "auth",
          "access_token": token
        };

        ws.send(JSON.stringify(authMessage));

      } else if (message.type === 'auth_ok' || message.type === 'auth_invalid') {
        authResponse = true;
        responseType = message.type;
        logWithTime(`🔐 认证响应: ${message.type}`);

        // 认证完成后关闭连接
        setTimeout(() => {
          ws.close();
        }, 100);
      }
    });

    ws.on('close', (code, reason) => {
      logWithTime(`🔴 连接关闭: code=${code}`);

      // 分析结果
      const expectedResponse = useValidToken ? 'auth_ok' : 'auth_invalid';
      const success = authRequired && authResponse && responseType === expectedResponse;

      if (success) {
        logWithTime(`✅ 场景成功: 完整的认证流程`);
      } else {
        logWithTime(`❌ 场景失败:`);
        logWithTime(`   auth_required: ${authRequired ? '✓' : '✗'}`);
        logWithTime(`   auth_response: ${authResponse ? '✓' : '✗'}`);
        logWithTime(`   expected: ${expectedResponse}, got: ${responseType || 'none'}`);
      }

      resolve({ success, authRequired, authResponse, responseType });
    });

    ws.on('error', (error) => {
      logWithTime(`❌ WebSocket错误: ${error.message}`);
      resolve({ success: false, error: error.message });
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        logWithTime('⏰ 测试超时，关闭连接');
        ws.close();
      }
    }, 8000);
  });
}

testRealUserScenario().catch(console.error);
