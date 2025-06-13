/**
 * 调试WebSocket close事件的问题
 * 验证为什么连接在发送认证消息后立即关闭
 */

const WebSocket = require('ws');

async function debugWebSocketCloseIssue() {
  console.log('🔍 调试WebSocket close事件问题...');
  console.log('='.repeat(60));

  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

  let messageCount = 0;
  let authSent = false;

  ws.on('open', () => {
    console.log('✅ WebSocket连接建立成功');
    console.log(`⏰ ${new Date().toISOString()}`);
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = JSON.parse(data.toString());
    console.log(`\n📥 收到消息 #${messageCount}: ${data.toString()}`);
    console.log(`⏰ 时间: ${new Date().toISOString()}`);

    if (message.type === 'auth_required' && !authSent) {
      authSent = true;
      console.log('\n📤 发送认证消息...');

      const authMessage = {
        "type": "auth",
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIyZjRlOGZkYmNkNGE0YWIwYjA2NDRjYmE3ZTJmMjE5YiIsImlhdCI6MTc0OTc4MTYyMSwiZXhwIjoxNzQ5NzgzNDIxfQ.k9xVYaHEmmf1w7Up5ou7CNkysUEDvCIbFw3phiEHl-E"
      };

      console.log(`   内容: ${JSON.stringify(authMessage)}`);
      console.log(`   ⏰ 发送时间: ${new Date().toISOString()}`);

      // 发送认证消息
      ws.send(JSON.stringify(authMessage));

      console.log('✅ 认证消息已发送');
      console.log('⏳ 等待认证响应...');

      // 在这里观察是否会立即触发close事件
      setTimeout(() => {
        console.log(`🕐 认证发送后1秒 - WebSocket状态: ${ws.readyState}`);
        console.log(`   0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED`);
      }, 1000);

      setTimeout(() => {
        console.log(`🕑 认证发送后2秒 - WebSocket状态: ${ws.readyState}`);
      }, 2000);

      setTimeout(() => {
        console.log(`🕒 认证发送后3秒 - WebSocket状态: ${ws.readyState}`);
      }, 3000);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`\n🔴 WebSocket连接关闭:`);
    console.log(`   关闭码: ${code}`);
    console.log(`   关闭原因: ${reason}`);
    console.log(`   ⏰ 关闭时间: ${new Date().toISOString()}`);
    console.log(`   📊 总共收到 ${messageCount} 条消息`);
    console.log(`   🔐 认证消息已发送: ${authSent}`);

    // 分析关闭原因
    switch (code) {
      case 1000:
        console.log('   ✅ 正常关闭');
        break;
      case 1001:
        console.log('   ⚠️  端点离开');
        break;
      case 1002:
        console.log('   ❌ 协议错误');
        break;
      case 1003:
        console.log('   ❌ 不可接受的数据类型');
        break;
      case 1006:
        console.log('   ❌ 异常关闭（没有收到关闭帧）');
        break;
      case 1011:
        console.log('   ❌ 服务器错误');
        break;
      default:
        console.log(`   ❓ 未知关闭码: ${code}`);
    }
  });

  ws.on('error', (error) => {
    console.log(`\n❌ WebSocket错误: ${error.message}`);
    console.log(`   ⏰ 错误时间: ${new Date().toISOString()}`);
  });

  // 10秒后强制关闭
  setTimeout(() => {
    console.log('\n⏰ 测试超时，手动关闭连接');
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Test timeout');
    }
  }, 10000);
}

debugWebSocketCloseIssue().catch(console.error);
