/**
 * 测试WebSocket消息缓冲区和close事件的时序问题
 */

const WebSocket = require('ws');

console.log('🔍 测试WebSocket消息缓冲区和close事件时序...');
console.log('='.repeat(60));

const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

let messageCount = 0;
let authSent = false;
let closeEventTriggered = false;
const messages = [];

ws.on('open', () => {
  console.log('✅ WebSocket连接建立');
});

ws.on('message', (data) => {
  messageCount++;
  const message = JSON.parse(data.toString());
  messages.push(message);

  console.log(`📥 收到消息 #${messageCount}: ${data.toString()}`);
  console.log(`   时间: ${new Date().toISOString()}`);
  console.log(`   Close事件已触发: ${closeEventTriggered}`);

  if (message.type === 'auth_required' && !authSent) {
    authSent = true;

    // 使用无效token来触发auth_invalid响应
    const authMessage = {
      "type": "auth",
      "access_token": "invalid_token_for_testing"
    };

    console.log('\n📤 发送无效认证消息（故意触发auth_invalid）...');
    console.log(`   时间: ${new Date().toISOString()}`);
    ws.send(JSON.stringify(authMessage));
    console.log('✅ 认证消息已发送');
  }
});

ws.on('close', (code, reason) => {
  closeEventTriggered = true;
  console.log(`\n🔴 Close事件触发:`);
  console.log(`   时间: ${new Date().toISOString()}`);
  console.log(`   关闭码: ${code}`);
  console.log(`   关闭原因: ${reason || '无'}`);
  console.log(`   📊 收到消息总数: ${messageCount}`);

  console.log('\n📋 所有收到的消息:');
  messages.forEach((msg, i) => {
    console.log(`   ${i + 1}. ${JSON.stringify(msg)}`);
  });

  // 检查是否有auth_invalid消息
  const hasAuthInvalid = messages.some(msg => msg.type === 'auth_invalid');
  const hasAuthRequired = messages.some(msg => msg.type === 'auth_required');

  console.log('\n🔍 分析结果:');
  console.log(`   收到auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
  console.log(`   收到auth_invalid: ${hasAuthInvalid ? '✅' : '❌'}`);

  if (hasAuthRequired && hasAuthInvalid) {
    console.log('   ✅ HA发送了完整的认证流程消息');
    console.log('   💡 问题可能在tunnel-proxy的消息转发逻辑');
  } else if (hasAuthRequired && !hasAuthInvalid) {
    console.log('   ❌ 认证响应消息丢失或未收到');
    console.log('   💡 可能存在消息缓冲区或时序问题');
  }
});

ws.on('error', (error) => {
  console.log(`❌ WebSocket错误: ${error.message}`);
  console.log(`   时间: ${new Date().toISOString()}`);
});

// 10秒后强制关闭
setTimeout(() => {
  console.log('\n⏰ 测试超时');
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}, 10000);
