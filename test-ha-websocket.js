const WebSocket = require('ws');
const net = require('net');

/**
 * 测试Home Assistant WebSocket连接，观察消息流
 */
async function testHomeAssistantWebSocket() {
  console.log('🔍 直接测试Home Assistant WebSocket连接...');
  
  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
  
  let messageCount = 0;
  const messages = [];
  
  ws.on('open', () => {
    console.log('✅ 直连HA WebSocket连接已建立');
    
    // 发送认证消息
    const authMessage = {
      "type": "auth",
      "access_token": "test_token_for_debugging"
    };
    
    console.log('📤 发送认证消息到HA');
    ws.send(JSON.stringify(authMessage));
  });
  
  ws.on('message', (data) => {
    messageCount++;
    const message = data.toString();
    messages.push(message);
    
    console.log(`📥 从HA收到消息 #${messageCount}:`);
    console.log(`   ${message}`);
    
    try {
      const parsed = JSON.parse(message);
      console.log(`   -> 类型: ${parsed.type}`);
    } catch (e) {
      console.log(`   -> JSON解析失败`);
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔴 HA连接关闭: code=${code}, reason=${reason}`);
    console.log(`📊 从HA总共收到 ${messageCount} 条消息`);
    
    console.log('\n--- 消息列表 ---');
    messages.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg}`);
    });
  });
  
  ws.on('error', (error) => {
    console.log(`❌ HA连接错误: ${error.message}`);
  });
  
  // 等待一段时间观察消息
  await new Promise(resolve => {
    setTimeout(() => {
      console.log('⏰ 测试结束，关闭HA连接');
      ws.close();
      resolve();
    }, 5000);
  });
}

/**
 * 模拟tunnel-proxy的WebSocket处理逻辑
 */
async function simulateTunnelProxyLogic() {
  console.log('\n' + '='.repeat(50));
  console.log('🔧 模拟tunnel-proxy的WebSocket处理逻辑...');
  
  const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
  
  let messageCount = 0;
  const forwardedMessages = [];
  
  ws.on('open', () => {
    console.log('✅ 模拟tunnel-proxy连接到HA成功');
    
    // 模拟设置消息转发（类似setupWebSocketDataForwarding）
    ws.on('message', (data) => {
      messageCount++;
      console.log(`📥 tunnel-proxy收到HA消息 #${messageCount}:`);
      console.log(`   数据长度: ${data.length}`);
      console.log(`   数据内容: ${data.toString()}`);
      
      // 模拟转发给tunnel-server
      const forwardMessage = {
        type: 'websocket_data',
        upgrade_id: 'test-upgrade-id',
        data: data.toString('base64')
      };
      
      forwardedMessages.push(forwardMessage);
      console.log(`📤 tunnel-proxy转发消息: ${JSON.stringify(forwardMessage).substring(0, 100)}...`);
    });
    
    // 发送认证消息
    const authMessage = JSON.stringify({
      "type": "auth",
      "access_token": "test_token_for_debugging"
    });
    
    console.log('📤 tunnel-proxy发送认证消息到HA');
    ws.send(authMessage);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔴 tunnel-proxy模拟连接关闭: code=${code}`);
    console.log(`📊 tunnel-proxy收到 ${messageCount} 条消息`);
    console.log(`📊 tunnel-proxy转发 ${forwardedMessages.length} 条消息`);
    
    console.log('\n--- 转发的消息 ---');
    forwardedMessages.forEach((msg, i) => {
      const decoded = Buffer.from(msg.data, 'base64').toString();
      console.log(`${i + 1}. ${decoded}`);
    });
  });
  
  ws.on('error', (error) => {
    console.log(`❌ tunnel-proxy模拟连接错误: ${error.message}`);
  });
  
  // 等待测试完成
  await new Promise(resolve => {
    setTimeout(() => {
      console.log('⏰ 模拟测试结束');
      ws.close();
      resolve();
    }, 5000);
  });
}

async function runAllTests() {
  try {
    await testHomeAssistantWebSocket();
    await simulateTunnelProxyLogic();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

runAllTests();
