const WebSocket = require('ws');

/**
 * 简单的WebSocket连接测试
 */
async function testWebSocketConnection() {
  console.log('🔍 测试WebSocket连接到隧道代理...');
  
  const url = 'ws://110.41.20.134:3081/api/websocket';
  
  const ws = new WebSocket(url);
  
  let messageCount = 0;
  
  ws.on('open', () => {
    console.log('✅ WebSocket连接已建立');
    
    // 发送认证消息
    const authMessage = {
      "type": "auth",
      "access_token": "test_token_for_debugging"
    };
    
    console.log('📤 发送认证消息');
    ws.send(JSON.stringify(authMessage));
  });
  
  ws.on('message', (data) => {
    messageCount++;
    console.log(`📥 收到消息 #${messageCount}:`);
    console.log(`   数据: ${data.toString()}`);
    
    try {
      const parsed = JSON.parse(data.toString());
      console.log(`   类型: ${parsed.type}`);
      
      if (parsed.type === 'auth_required') {
        console.log('🔄 收到auth_required，等待更多消息...');
      } else if (parsed.type === 'auth_ok') {
        console.log('✅ 收到auth_ok，认证成功！');
      } else if (parsed.type === 'auth_invalid') {
        console.log('❌ 收到auth_invalid，认证失败');
      }
    } catch (e) {
      console.log(`   JSON解析失败: ${e.message}`);
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔴 连接关闭: code=${code}, reason=${reason}`);
    console.log(`📊 总共收到 ${messageCount} 条消息`);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ 连接错误: ${error.message}`);
  });
  
  // 15秒后自动关闭
  setTimeout(() => {
    console.log('⏰ 测试时间结束，关闭连接');
    ws.close();
  }, 15000);
}

testWebSocketConnection().catch(console.error);
