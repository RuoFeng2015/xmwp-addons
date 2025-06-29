#!/usr/bin/env node

/**
 * 简化的WebSocket测试 - 专门测试认证流程
 */

const WebSocket = require('ws');

function testWebSocketAuth() {
  console.log(`🔗 [测试] 连接到生产服务器WebSocket...`);
  
  const wsUrl = 'wss://ha-client-001.wzzhk.club/api/websocket';
  const ws = new WebSocket(wsUrl, {
    rejectUnauthorized: false,
    headers: {
      'User-Agent': 'Home Assistant/2025.5 (io.robbie.HomeAssistant; build:2025.1264; iOS 16.3.0)',
      'Origin': 'https://ha-client-001.wzzhk.club'
    }
  });

  ws.on('open', () => {
    console.log(`✅ [测试] WebSocket连接成功`);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📥 [测试] 收到消息:`, message);
      
      if (message.type === 'auth_required') {
        console.log(`🔐 [测试] 服务器要求认证，发送测试token...`);
        
        // 发送一个测试认证消息
        const authMessage = {
          type: 'auth',
          access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0OWZlOWNkMTVhYWQ0MDBjOTdjOTRkMTM2OGE4ODQ3OCIsImlhdCI6MTc1MTE3NTUzOCwiZXhwIjoxNzUxMTc3MzM4fQ.DxvN1ngoTyT9gAdRRVq6nltJ6_jgy6WvJMkcd388suY'  // 使用真实token
        };
        
        console.log(`📤 [测试] 发送认证消息:`, authMessage);
        ws.send(JSON.stringify(authMessage));
      } else if (message.type === 'auth_ok') {
        console.log(`✅ [测试] 认证成功！（意外）`);
        ws.close();
      } else if (message.type === 'auth_invalid') {
        console.log(`❌ [测试] 认证失败（预期的）`);
        console.log(`🎉 [测试] 服务器正确响应了认证失败，说明认证逻辑工作正常`);
        ws.close();
      } else {
        console.log(`📥 [测试] 其他消息类型: ${message.type}`);
      }
    } catch (e) {
      console.log(`📥 [测试] 收到非JSON消息: ${data.toString()}`);
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ [测试] WebSocket错误: ${error.message}`);
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 [测试] WebSocket关闭: ${code} ${reason}`);
    console.log(`\n=== 测试完成 ===`);
    process.exit(0);
  });

  // 10秒超时
  setTimeout(() => {
    console.log(`⏰ [测试] 超时，强制关闭连接`);
    ws.close();
  }, 10000);
}

testWebSocketAuth();
