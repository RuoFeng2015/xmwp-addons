#!/usr/bin/env node

/**
 * 简单的连接测试脚本 - 检查客户端是否正确连接到服务器
 */

const net = require('net');

console.log('🔍 测试客户端与服务器的连接状态...');

// 测试连接到tunnel服务器
const client = net.connect(3080, 'tunnel.wzzhk.club', () => {
  console.log('✅ 成功连接到 tunnel.wzzhk.club:3080');
  
  // 发送认证消息
  const authMessage = {
    type: 'auth',
    username: 'admin',
    password: 'password',
    client_id: 'ha-client-001'
  };
  
  console.log('📤 发送认证消息:', authMessage);
  client.write(JSON.stringify(authMessage) + '\n');
});

client.on('data', (data) => {
  console.log('📥 服务器响应:', data.toString());
  
  try {
    const response = JSON.parse(data.toString());
    if (response.type === 'auth_success') {
      console.log('✅ 认证成功！客户端已连接');
    } else if (response.type === 'auth_failed') {
      console.log('❌ 认证失败:', response.reason);
    }
  } catch (e) {
    // 非JSON响应
  }
});

client.on('error', (error) => {
  console.log('❌ 连接错误:', error.message);
});

client.on('close', () => {
  console.log('🔌 连接关闭');
  process.exit(0);
});

// 10秒后超时
setTimeout(() => {
  console.log('⏰ 测试超时');
  client.destroy();
  process.exit(1);
}, 10000);
