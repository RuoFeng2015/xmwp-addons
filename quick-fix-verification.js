const WebSocket = require('ws');

console.log('🔍 快速验证修复效果');
console.log('==========================================');

// 测试隧道代理连接
function testTunnelProxy() {
  return new Promise((resolve) => {
    console.log('📡 连接隧道代理...');
    const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');
    
    let messageCount = 0;
    let hasAuthInvalid = false;
    const startTime = Date.now();
    
    ws.on('open', () => {
      console.log(`✅ 隧道代理连接成功 (${Date.now() - startTime}ms)`);
    });
    
    ws.on('message', (data) => {
      messageCount++;
      const message = JSON.parse(data.toString());
      console.log(`📥 [${Date.now() - startTime}ms] 消息 #${messageCount}: ${message.type}`);
      
      if (message.type === 'auth_required') {
        setTimeout(() => {
          console.log(`📤 [${Date.now() - startTime}ms] 发送认证消息...`);
          ws.send(JSON.stringify({
            "type": "auth",
            "access_token": "test_invalid_token"
          }));
        }, 100);
      } else if (message.type === 'auth_invalid') {
        hasAuthInvalid = true;
        console.log(`🔐 [${Date.now() - startTime}ms] 收到认证失败响应！`);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔴 [${Date.now() - startTime}ms] 连接关闭: ${code}`);
      console.log(`📊 总计收到 ${messageCount} 条消息`);
      console.log(`🎯 auth_invalid状态: ${hasAuthInvalid ? '✅ 收到' : '❌ 丢失'}`);
      
      if (hasAuthInvalid) {
        console.log('\n🎉 修复成功！auth_invalid消息已正确传输');
      } else {
        console.log('\n❌ 修复未生效，auth_invalid消息仍然丢失');
      }
      
      resolve(hasAuthInvalid);
    });
    
    ws.on('error', (error) => {
      console.log(`❌ 连接错误: ${error.message}`);
      resolve(false);
    });
    
    // 30秒超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 30000);
  });
}

// 运行测试
testTunnelProxy().then(success => {
  console.log('\n==========================================');
  if (success) {
    console.log('🎊 测试结果: 修复成功');
  } else {
    console.log('🚨 测试结果: 需要进一步检查');
    console.log('\n🔧 可能的问题:');
    console.log('1. tunnel-proxy服务未重启');
    console.log('2. 修复代码未正确部署');
    console.log('3. 消息丢失发生在其他环节');
  }
});
