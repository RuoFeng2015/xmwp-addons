const WebSocket = require('ws');

/**
 * 调试JWT Token验证问题
 * 直接连接到HA验证token是否有效
 */
async function debugTokenValidation() {
  console.log('🔍 调试JWT Token验证问题...');

  // 从用户提供的token信息
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjNGExN2ZiOTRmNmM0MGY4YTVlZTkzYWZlNmMyMmI5NyIsImlhdCI6MTc0OTcxNjg3OCwiZXhwIjoxNzQ5NzE4Njc4fQ.1zK9K3uadhz4gSDfuTPOpwR1P8O8_Cltv0qVTttX8LQ";

  console.log(`🔑 测试Token: ${token.substring(0, 50)}...`);

  // 检查token过期时间
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp;
    const iat = payload.iat;

    console.log(`📅 Token信息:`);
    console.log(`   发行时间: ${new Date(iat * 1000).toISOString()}`);
    console.log(`   过期时间: ${new Date(exp * 1000).toISOString()}`);
    console.log(`   当前时间: ${new Date(now * 1000).toISOString()}`);
    console.log(`   是否过期: ${now > exp ? '❌ 是' : '✅ 否'}`);
    console.log(`   剩余时间: ${exp - now} 秒`);

    if (now > exp) {
      console.log('⚠️  Token已过期，这可能是认证失败的原因！');
    }
  } catch (e) {
    console.log(`❌ 无法解析Token: ${e.message}`);
  }

  console.log(`\n🔗 直接连接到HA WebSocket测试认证...`);

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  const messages = [];

  ws.on('open', () => {
    console.log('✅ 直连HA WebSocket成功');
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    messages.push(message);

    console.log(`📥 消息 #${messageCount}: ${JSON.stringify(message)}`);

    if (message.type === 'auth_required') {
      console.log('🔐 收到auth_required，发送认证...');

      const authMessage = {
        type: 'auth',
        access_token: token
      };

      ws.send(JSON.stringify(authMessage));
      console.log('📤 认证消息已发送');

    } else if (message.type === 'auth_ok') {
      console.log('✅ 认证成功！Token有效');
      ws.close();

    } else if (message.type === 'auth_invalid') {
      console.log('❌ 认证失败！Token无效');
      console.log(`   失败原因: ${message.message || '未知'}`);
      ws.close();
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`\n🔴 连接关闭: code=${code}, reason=${reason || '无'}`);
    console.log(`📊 总共收到 ${messageCount} 条消息`);

    console.log(`\n📋 消息列表:`);
    messages.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(msg)}`);
    });

    // 分析结果
    const hasAuthRequired = messages.some(m => m.type === 'auth_required');
    const hasAuthResponse = messages.some(m => m.type === 'auth_ok' || m.type === 'auth_invalid');

    console.log(`\n🔍 分析结果:`);
    console.log(`   收到auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
    console.log(`   收到认证响应: ${hasAuthResponse ? '✅' : '❌'}`);

    if (hasAuthRequired && !hasAuthResponse) {
      console.log(`⚠️  问题确认：HA没有发送认证响应！`);
      console.log(`   可能原因：`);
      console.log(`   1. Token已过期`);
      console.log(`   2. Token格式错误`);
      console.log(`   3. HA内部错误`);
      console.log(`   4. 网络连接问题`);
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ WebSocket错误: ${error.message}`);
  });

  // 15秒后自动关闭
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏰ 测试超时，主动关闭');
      ws.close();
    }
  }, 15000);
}

debugTokenValidation().catch(console.error);
