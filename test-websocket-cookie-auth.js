/**
 * 测试WebSocket连接中的Cookie认证机制
 * 验证HA Supervised是否依赖cookie进行WebSocket认证
 */

const WebSocket = require('ws');
const http = require('http');

console.log('🍪 Home Assistant WebSocket Cookie认证测试');
console.log('='.repeat(60));

/**
 * 测试1: 不带cookie的WebSocket连接（当前tunnel-proxy行为）
 */
async function testWithoutCookies() {
  console.log('\n📍 测试1: 不带Cookie的WebSocket连接');
  console.log('-'.repeat(40));

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    let authRequired = false;
    let authResponse = null;

    ws.on('open', () => {
      console.log('✅ WebSocket连接建立（无Cookie）');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("%c Line:31 🥥 data.toString()", "color:#3f7cff", data.toString());
        console.log(`📥 收到消息: ${message.type}`);

        if (message.type === 'auth_required') {
          authRequired = true;
          console.log('🔐 HA要求认证（正常行为）');

          // 发送无效token测试
          const authMessage = {
            "type": "auth",
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0NmQ0MWE5MDIyOGE0ODRkODQwYjdiNTgyNGQ4ZjJlYSIsImlhdCI6MTc0OTgwMTc0MywiZXhwIjoxNzQ5ODAzNTQzfQ.sqt_k7wfG58TK92CWhtOfbl6JT7aJrqq3quG250yb2s"
          };
          ws.send(JSON.stringify(authMessage));
        } else if (message.type === 'auth_invalid') {
          authResponse = 'invalid';
          console.log('❌ 认证失败（预期行为）');
        } else if (message.type === 'auth_ok') {
          authResponse = 'ok';
          console.log('✅ 认证成功');
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code) => {
      console.log(`🔴 连接关闭: ${code}`);
      console.log(`📊 结果: auth_required=${authRequired}, auth_response=${authResponse}`);
      resolve({ authRequired, authResponse, method: 'no-cookie' });
    });

    ws.on('error', (error) => {
      console.log(`❌ 连接错误: ${error.message}`);
      resolve({ authRequired: false, authResponse: null, method: 'no-cookie', error: error.message });
    });

    // 5秒超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 5000);
  });
}

/**
 * 测试2: 先获取Session Cookie，然后使用Cookie进行WebSocket连接
 */
async function testWithSessionCookies() {
  console.log('\n📍 测试2: 使用Session Cookie的WebSocket连接');
  console.log('-'.repeat(40));

  // 先尝试获取session cookie
  const cookies = await getSessionCookies();
  console.log(`🍪 获取到的Cookies: ${cookies || '无'}`);

  if (!cookies) {
    console.log('❌ 无法获取Session Cookie，跳过此测试');
    return { authRequired: false, authResponse: null, method: 'cookie-failed', error: 'No cookies' };
  }

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket', {
      headers: {
        'Cookie': cookies
      }
    });

    let authRequired = false;
    let authResponse = null;

    ws.on('open', () => {
      console.log('✅ WebSocket连接建立（带Cookie）');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📥 收到消息: ${message.type}`);

        if (message.type === 'auth_required') {
          authRequired = true;
          console.log('🔐 HA要求认证');

          // 使用有效的长期访问令牌
          const authMessage = {
            "type": "auth",
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0NmQ0MWE5MDIyOGE0ODRkODQwYjdiNTgyNGQ4ZjJlYSIsImlhdCI6MTc0OTgwMTc0MywiZXhwIjoxNzQ5ODAzNTQzfQ.sqt_k7wfG58TK92CWhtOfbl6JT7aJrqq3quG250yb2s"
          };
          ws.send(JSON.stringify(authMessage));
          console.log('🔑 发送有效认证令牌');
        } else if (message.type === 'auth_invalid') {
          authResponse = 'invalid';
          console.log('❌ 认证失败');
        } else if (message.type === 'auth_ok') {
          authResponse = 'ok';
          console.log('✅ 认证成功！');

          // 保持连接一段时间验证稳定性
          setTimeout(() => {
            ws.close();
          }, 2000);
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code) => {
      console.log(`🔴 连接关闭: ${code}`);
      console.log(`📊 结果: auth_required=${authRequired}, auth_response=${authResponse}`);
      resolve({ authRequired, authResponse, method: 'with-cookie' });
    });

    ws.on('error', (error) => {
      console.log(`❌ 连接错误: ${error.message}`);
      resolve({ authRequired: false, authResponse: null, method: 'with-cookie', error: error.message });
    });

    // 10秒超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 10000);
  });
}

/**
 * 获取HA的Session Cookie
 */
function getSessionCookies() {
  return new Promise((resolve) => {
    const options = {
      hostname: '192.168.6.170',
      port: 8123,
      path: '/',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      const cookies = res.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        // 提取cookie字符串
        const cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        resolve(cookieString);
      } else {
        resolve(null);
      }
    });

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * 主测试函数
 */
async function runCookieTests() {
  console.log('🚀 开始WebSocket Cookie认证测试...\n');

  try {
    // 测试1: 无Cookie连接
    const result1 = await testWithoutCookies();

    // 测试2: 带Cookie连接
    const result2 = await testWithSessionCookies();

    // 分析结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果分析');
    console.log('='.repeat(60));

    console.log(`\n🔍 测试1 (无Cookie):`);
    console.log(`  认证要求: ${result1.authRequired ? '✅' : '❌'}`);
    console.log(`  认证响应: ${result1.authResponse || '无'}`);
    console.log(`  错误信息: ${result1.error || '无'}`);

    console.log(`\n🍪 测试2 (带Cookie):`);
    console.log(`  认证要求: ${result2.authRequired ? '✅' : '❌'}`);
    console.log(`  认证响应: ${result2.authResponse || '无'}`);
    console.log(`  错误信息: ${result2.error || '无'}`);

    // 结论
    console.log('\n🎯 关键发现:');

    if (result1.authRequired && result2.authRequired) {
      console.log('  • HA Supervised要求WebSocket显式认证（cookie不足以自动认证）');
      console.log('  • Cookie机制不影响WebSocket认证要求');
      console.log('  • 问题确实在于访问令牌的有效性');
    } else if (!result1.authRequired && !result2.authRequired) {
      console.log('  • HA可能使用cookie进行自动认证');
      console.log('  • 用户可能需要先在浏览器中登录HA');
    } else {
      console.log('  • Cookie对WebSocket认证有影响');
      console.log('  • 可能需要调整tunnel-proxy的cookie处理');
    }

    console.log('\n💡 建议的解决方案:');
    if (result2.authResponse === 'ok') {
      console.log('  ✅ 使用有效的长期访问令牌即可解决问题');
      console.log('  ✅ tunnel-proxy的WebSocket转发逻辑正常工作');
    } else {
      console.log('  🔧 需要检查tunnel-proxy的cookie转发机制');
      console.log('  🔧 确保用户在浏览器中正确登录HA');
    }

  } catch (error) {
    console.log(`❌ 测试执行失败: ${error.message}`);
  }
}

// 运行测试
runCookieTests().catch(console.error);
