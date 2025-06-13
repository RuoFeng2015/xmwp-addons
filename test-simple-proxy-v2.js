/**
 * 测试简化版隧道代理
 */

const WebSocket = require('ws');

console.log('🧪 测试简化版隧道代理');
console.log('='.repeat(60));

async function testSimpleProxy() {
  try {
    console.log('📍 步骤1: 测试HTTP代理');
    await testHttpProxy();

    console.log('\n📍 步骤2: 测试WebSocket代理');
    await testWebSocketProxy();

    console.log('\n✅ 所有测试完成');
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
  }
}

/**
 * 测试HTTP代理
 */
async function testHttpProxy() {
  const http = require('http');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      console.log(`📊 HTTP代理响应: ${res.statusCode}`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📄 响应长度: ${data.length} bytes`);
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`⚠️  HTTP代理测试失败: ${error.message}`);
      console.log(`💡 这是正常的，如果代理服务器没有运行`);
      resolve(); // 不要reject，因为这个测试是可选的
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log(`⏰ HTTP代理测试超时`);
      resolve();
    });

    req.end();
  });
}

/**
 * 测试WebSocket代理
 */
async function testWebSocketProxy() {
  return new Promise((resolve) => {
    console.log('🔗 连接到代理WebSocket: ws://localhost:8080/api/websocket');

    const ws = new WebSocket('ws://localhost:8080/api/websocket');
    let messageCount = 0;
    let authSent = false;
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('✅ 代理WebSocket连接成功');
    });

    ws.on('message', (data) => {
      messageCount++;
      const elapsed = Date.now() - startTime;

      try {
        const message = JSON.parse(data.toString());
        console.log(`📥 收到消息 #${messageCount} (${elapsed}ms): ${message.type}`);

        if (message.type === 'auth_required' && !authSent) {
          authSent = true;
          console.log('🔐 发送认证消息...');

          // 使用一个测试令牌
          const authMessage = {
            "type": "auth",
            "access_token": "test_token_for_simple_proxy"
          };

          ws.send(JSON.stringify(authMessage));
          console.log('📤 认证消息已发送');
        } else if (message.type === 'auth_invalid') {
          console.log('✅ 收到auth_invalid响应（预期结果）');
        } else if (message.type === 'auth_ok') {
          console.log('🎉 收到auth_ok响应！');
        }
      } catch (e) {
        console.log(`📥 收到非JSON消息: ${data.toString()}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`🔴 WebSocket连接关闭 (${elapsed}ms): code=${code}`);
      console.log(`📊 总共收到 ${messageCount} 条消息`);

      if (messageCount >= 1) {
        console.log('✅ WebSocket代理基本功能正常');
      } else {
        console.log('⚠️  WebSocket代理可能有问题');
      }

      resolve();
    });

    ws.on('error', (error) => {
      console.log(`❌ WebSocket连接错误: ${error.message}`);
      console.log(`💡 请确保简化代理服务器正在运行: node simple-tunnel-proxy-v2.js`);
      resolve();
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('⏰ 测试超时，关闭连接');
        ws.close();
      }
    }, 10000);
  });
}

// 运行测试
testSimpleProxy().catch(console.error);
