/**
 * 测试WebSocket连接
 */
const WebSocket = require('ws');

console.log('🔍 测试WebSocket连接');
console.log('=====================================\n');

// 测试直接连接到Home Assistant
function testDirectWebSocket() {
  console.log('1. 测试直接连接到Home Assistant WebSocket...');
  
  const wsUrl = 'ws://192.168.6.170:8123/api/websocket';
  console.log(`连接URL: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✅ 直接WebSocket连接成功');
    
    ws.on('message', (data) => {
      console.log('收到消息:', data.toString());
      
      // 发送认证消息
      const authMessage = {
        type: 'auth_required'
      };
      ws.send(JSON.stringify(authMessage));
    });
    
    setTimeout(() => {
      ws.close();
      console.log('关闭直接连接，开始测试隧道连接...\n');
      testTunnelWebSocket();
    }, 3000);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ 直接连接失败: ${error.message}`);
    console.log('开始测试隧道连接...\n');
    testTunnelWebSocket();
  });
}

// 测试通过隧道的WebSocket连接
function testTunnelWebSocket() {
  console.log('2. 测试通过隧道的WebSocket连接...');
  
  const wsUrl = 'ws://110.41.20.134:3081/ha-client-001/api/websocket';
  console.log(`连接URL: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✅ 隧道WebSocket连接成功！');
    
    ws.on('message', (data) => {
      console.log('通过隧道收到消息:', data.toString());
    });
    
    setTimeout(() => {
      ws.close();
      console.log('✅ WebSocket测试完成');
    }, 3000);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ 隧道连接失败: ${error.message}`);
    console.log('这可能是因为WebSocket代理功能还没有完全部署');
  });
  
  ws.on('close', (code, reason) => {
    console.log(`WebSocket连接关闭: ${code} ${reason}`);
  });
}

// 检查WebSocket库是否可用
try {
  testDirectWebSocket();
} catch (error) {
  console.error(`WebSocket测试失败: ${error.message}`);
  console.log('请确保已安装ws库: npm install ws');
}
