const WebSocket = require('ws');
const http = require('http');

/**
 * 测试所有可能的Home Assistant地址
 */
async function testAllPossibleHosts() {
  const targetHosts = [
    '127.0.0.1',
    'localhost',
    '192.168.6.170',
    'hassio.local',
    '172.30.32.2',
    '192.168.6.1',
    '192.168.1.170',
    '10.0.0.170'
  ];
  
  const port = 8123;
  
  console.log('🔍 测试所有可能的Home Assistant地址...\n');
  
  for (const host of targetHosts) {
    console.log(`测试 ${host}:${port}...`);
    
    // 测试HTTP连接
    try {
      const httpResult = await testHTTP(host, port);
      console.log(`  HTTP: ${httpResult.success ? '✅' : '❌'} ${httpResult.message}`);
      
      if (httpResult.success) {
        // 测试WebSocket连接
        try {
          const wsResult = await testWebSocket(host, port);
          console.log(`  WebSocket: ${wsResult.success ? '✅' : '❌'} ${wsResult.message}`);
          console.log(`  消息数: ${wsResult.messageCount}`);
          if (wsResult.messages.length > 0) {
            console.log(`  消息内容:`);
            wsResult.messages.forEach((msg, i) => {
              console.log(`    ${i + 1}. ${msg}`);
            });
          }
        } catch (wsError) {
          console.log(`  WebSocket: ❌ ${wsError.message}`);
        }
      }
    } catch (httpError) {
      console.log(`  HTTP: ❌ ${httpError.message}`);
    }
    
    console.log('');
  }
}

/**
 * 测试HTTP连接
 */
function testHTTP(hostname, port) {
  return new Promise((resolve) => {
    const options = {
      hostname,
      port,
      path: '/',
      method: 'GET',
      timeout: 3000,
      family: 4
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk.toString());
      res.on('end', () => {
        const isHA = body.includes('Home Assistant') || 
                     body.includes('homeassistant') ||
                     res.headers['server']?.includes('HomeAssistant');
        
        resolve({
          success: true,
          message: `HTTP ${res.statusCode} ${isHA ? '(Home Assistant)' : '(其他服务)'}`
        });
      });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, message: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, message: '连接超时' });
    });
    
    req.end();
  });
}

/**
 * 测试WebSocket连接
 */
function testWebSocket(hostname, port) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://${hostname}:${port}/api/websocket`;
    const ws = new WebSocket(wsUrl, { timeout: 5000 });
    
    let messageCount = 0;
    const messages = [];
    let resolved = false;
    
    ws.on('open', () => {
      // 发送认证消息
      const authMessage = JSON.stringify({
        type: "auth",
        access_token: "test_token_for_discovery"
      });
      ws.send(authMessage);
    });
    
    ws.on('message', (data) => {
      messageCount++;
      messages.push(data.toString());
    });
    
    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: true,
          message: `连接正常关闭`,
          messageCount,
          messages
        });
      }
    });
    
    ws.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });
    
    // 5秒后关闭连接
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({
          success: true,
          message: `测试完成`,
          messageCount,
          messages
        });
      }
    }, 5000);
  });
}

testAllPossibleHosts().catch(console.error);
