/**
 * 使用实际token测试WebSocket认证流程
 * 分析为什么没有收到auth_invalid消息
 */

const WebSocket = require('ws');

console.log('🔍 分析实际token的WebSocket认证流程');
console.log('='.repeat(60));

async function analyzeActualToken() {
  // 使用用户日志中的实际token
  const actualToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIyY2E3ZjQ5MzliMDg0NTllODFiOGI2NTcyYzVkM2QyNSIsImlhdCI6MTc0OTcyMjE1NCwiZXhwIjoxNzQ5NzIzOTU0fQ.Z7nUakugVhkPG1OLYc98REx7CQCTT-HCoupXIFW0W6U";
  
  console.log('📋 测试用户实际使用的token...');
  console.log('🔑 Token (前50字符):', actualToken.substring(0, 50) + '...');
  
  // 解析JWT token查看过期时间
  try {
    const payload = JSON.parse(Buffer.from(actualToken.split('.')[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp;
    const iat = payload.iat;
    
    console.log('📊 Token信息:');
    console.log(`   发行时间: ${new Date(iat * 1000).toLocaleString()}`);
    console.log(`   过期时间: ${new Date(exp * 1000).toLocaleString()}`);
    console.log(`   当前时间: ${new Date(now * 1000).toLocaleString()}`);
    console.log(`   是否过期: ${now > exp ? '是' : '否'}`);
    console.log(`   剩余时间: ${exp - now}秒`);
  } catch (e) {
    console.log('❌ 无法解析token:', e.message);
  }

  // 测试直接连接
  console.log('\n🔗 1. 测试直接连接到HA...');
  const directResult = await testConnection('ws://192.168.6.170:8123/api/websocket', actualToken, '直接连接');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试代理连接
  console.log('\n🔗 2. 测试通过隧道代理连接...');
  const proxyResult = await testConnection('ws://110.41.20.134:3081/api/websocket', actualToken, '代理连接');
  
  // 分析结果
  console.log('\n📊 结果分析:');
  console.log(`直接连接: ${directResult.messageCount}条消息 - ${directResult.messages.map(m => m.type).join(' → ')}`);
  console.log(`代理连接: ${proxyResult.messageCount}条消息 - ${proxyResult.messages.map(m => m.type).join(' → ')}`);
  
  if (directResult.messageCount === 1 && directResult.messages[0].type === 'auth_required') {
    console.log('\n🎯 发现问题根源:');
    console.log('   - HA只发送了auth_required，然后直接关闭连接');
    console.log('   - 这可能是因为token已过期，HA的安全策略直接关闭连接');
    console.log('   - 没有发送auth_invalid消息');
  }
  
  if (directResult.messageCount === proxyResult.messageCount) {
    console.log('\n✅ 隧道代理工作正常：消息转发数量一致');
  } else {
    console.log('\n❌ 隧道代理存在问题：消息转发数量不一致');
  }
}

function testConnection(url, token, connectionType) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    
    let messageCount = 0;
    const messages = [];
    const startTime = Date.now();

    ws.on('open', () => {
      console.log(`   ✅ ${connectionType}建立`);
    });

    ws.on('message', (data) => {
      messageCount++;
      const elapsed = Date.now() - startTime;
      
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        console.log(`   📥 [${elapsed}ms] 收到消息 #${messageCount}: ${message.type}`);
        
        if (message.type === 'auth_required') {
          // 发送实际token
          const authMessage = {
            "type": "auth",
            "access_token": token
          };
          ws.send(JSON.stringify(authMessage));
          console.log(`   📤 [${elapsed}ms] 发送实际token认证消息`);
        }
      } catch (e) {
        console.log(`   ❌ [${elapsed}ms] 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`   🔴 [${elapsed}ms] ${connectionType}关闭: code=${code}, reason=${reason || '无'}`);
      
      resolve({
        success: true,
        messageCount,
        messages,
        duration: elapsed
      });
    });

    ws.on('error', (error) => {
      console.log(`   ❌ ${connectionType}错误: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
        messageCount: 0,
        messages: []
      });
    });

    // 15秒超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 15000);
  });
}

// 运行分析
analyzeActualToken().catch(console.error);
