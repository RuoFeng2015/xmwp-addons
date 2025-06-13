const WebSocket = require('ws');

/**
 * 简单的WebSocket连接测试
 * 重点检查隧道代理服务状态和认证消息传输
 */

async function testWebSocketConnection(url, description) {
  console.log(`\n🔍 测试 ${description}`);
  console.log(`📡 连接: ${url}`);
  console.log('-------------------');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const result = {
      url,
      description,
      connected: false,
      messages: [],
      error: null,
      closeCode: null,
      timeline: []
    };
    
    const startTime = Date.now();
    
    function addEvent(event, details = '') {
      const elapsed = Date.now() - startTime;
      result.timeline.push({ elapsed, event, details });
      console.log(`  [${elapsed}ms] ${event}${details ? ': ' + details : ''}`);
    }
    
    ws.on('open', () => {
      result.connected = true;
      addEvent('WebSocket连接建立');
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        result.messages.push(message);
        addEvent(`收到消息`, `type: ${message.type}`);
        
        // 如果收到auth_required，发送一个简单的测试认证
        if (message.type === 'auth_required') {
          setTimeout(() => {
            const testAuth = {
              "type": "auth",
              "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxM2JhYTFiYjVhZDU0Y2Y2OWFmMDkyNTEwNDQxODg4YiIsImlhdCI6MTc0OTgwNzU2NCwiZXhwIjoxNzQ5ODA5MzY0fQ.Op_uqdXOvgETuwdWjEPCqflv6uhz9KgSr5x6ZeP5pIk"
            };
            addEvent('发送测试认证消息');
            ws.send(JSON.stringify(testAuth));
          }, 100);
        }
        
      } catch (e) {
        addEvent('消息解析失败', e.message);
      }
    });
    
    ws.on('close', (code, reason) => {
      result.closeCode = code;
      addEvent('连接关闭', `code: ${code}, reason: ${reason}`);
      resolve(result);
    });
    
    ws.on('error', (error) => {
      result.error = error.message;
      addEvent('连接错误', error.message);
    });
    
    // 设置超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        addEvent('测试超时，主动关闭连接');
        ws.close();
      }
    }, 10000);
  });
}

async function main() {
  console.log('🔍 WebSocket连接状态检查');
  console.log('=================================');
  console.log('目标：检查隧道代理服务状态和消息传输');
  console.log('');
  
  try {
    // 测试1: 直连HA
    const directResult = await testWebSocketConnection(
      'ws://192.168.6.170:8123/api/websocket',
      '直连Home Assistant'
    );
    
    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 测试2: 通过隧道代理
    const proxyResult = await testWebSocketConnection(
      'ws://192.168.6.170:8099/api/websocket',
      '隧道代理连接'
    );
    
    // 分析结果
    console.log('\n📊 连接测试结果分析');
    console.log('===================');
    
    console.log(`\n🔗 直连结果:`);
    console.log(`  连接状态: ${directResult.connected ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  收到消息数: ${directResult.messages.length}`);
    console.log(`  关闭代码: ${directResult.closeCode}`);
    console.log(`  错误: ${directResult.error || '无'}`);
    
    console.log(`\n🌐 代理结果:`);
    console.log(`  连接状态: ${proxyResult.connected ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  收到消息数: ${proxyResult.messages.length}`);
    console.log(`  关闭代码: ${proxyResult.closeCode}`);
    console.log(`  错误: ${proxyResult.error || '无'}`);
    
    // 检查代理服务状态
    if (!proxyResult.connected) {
      console.log('\n⚠️  隧道代理连接失败，可能的原因：');
      console.log('   1. tunnel-proxy 服务未运行');
      console.log('   2. 端口8099未开放或被占用');
      console.log('   3. 服务配置问题');
    } else if (proxyResult.messages.length === 0) {
      console.log('\n⚠️  隧道代理连接成功但无消息，可能的原因：');
      console.log('   1. 消息转发机制问题');
      console.log('   2. 上游连接问题');
    }
    
  } catch (error) {
    console.log(`❌ 测试过程出错: ${error.message}`);
  }
}

main();
