const WebSocket = require('ws');

/**
 * 模拟tunnel-proxy的主机选择逻辑
 */
function getTargetHosts() {
  return [
    '127.0.0.1',
    'localhost',
    '192.168.6.170',
    'hassio.local',
    '172.30.32.2',
    '192.168.6.1',
    '192.168.1.170',
    '10.0.0.170'
  ];
}

/**
 * 模拟tunnel-proxy的WebSocket连接逻辑
 */
async function simulateTunnelProxyWebSocketLogic() {
  console.log('🔍 模拟tunnel-proxy的WebSocket连接逻辑...');

  const targetHosts = getTargetHosts();
  const local_ha_port = 8123;
  const url = '/api/websocket';

  console.log(`📋 目标主机列表: ${targetHosts.join(', ')}`);
  console.log(`🔗 尝试连接顺序:`);

  for (const hostname of targetHosts) {
    console.log(`\n🎯 尝试: ${hostname}:${local_ha_port}`);

    try {
      const wsUrl = `ws://${hostname}:${local_ha_port}${url}`;
      console.log(`   URL: ${wsUrl}`);

      const success = await attemptConnection(hostname, local_ha_port, url);
      if (success) {
        console.log(`✅ 成功连接到: ${hostname}:${local_ha_port}`);
        console.log(`🎉 这应该是tunnel-proxy选择的主机`);
        return hostname;
      }
    } catch (error) {
      console.log(`❌ 连接失败: ${error.message}`);
      continue;
    }
  }

  console.log(`❌ 所有主机连接失败`);
  return null;
}

/**
 * 尝试WebSocket连接
 */
function attemptConnection(hostname, port, url) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://${hostname}:${port}${url}`;

    console.log(`   🔗 创建WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl, {
      timeout: 5000  // 5秒超时，和tunnel-proxy一样
    });

    let resolved = false;
    const startTime = Date.now();

    ws.on('open', () => {
      if (resolved) return;
      resolved = true;
      const elapsed = Date.now() - startTime;
      console.log(`   ✅ 连接建立 (${elapsed}ms)`);

      // 发送测试认证
      const authMessage = {
        "type": "auth",
        "access_token": "test_token_123"
      };
      console.log(`   📤 发送认证消息`);
      ws.send(JSON.stringify(authMessage));

      // 等待消息
      let messageCount = 0;
      ws.on('message', (data) => {
        messageCount++;
        const elapsed = Date.now() - startTime;
        console.log(`   📥 收到消息 #${messageCount} (${elapsed}ms): ${data.toString()}`);

        // 如果收到第二条消息，认为连接成功
        if (messageCount >= 2) {
          console.log(`   ✅ 接收到完整认证流程，连接成功`);
          ws.close();
          resolve(true);
        }
      });

      // 如果10秒内没收到第二条消息，也算失败
      setTimeout(() => {
        if (!resolved && messageCount < 2) {
          console.log(`   ⚠️  超时：只收到${messageCount}条消息`);
          ws.close();
          resolve(false);
        }
      }, 10000);
    });

    ws.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      const elapsed = Date.now() - startTime;
      console.log(`   ❌ 连接错误 (${elapsed}ms): ${error.message}`);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      if (resolved) return;
      const elapsed = Date.now() - startTime;
      console.log(`   🔴 连接关闭 (${elapsed}ms): code=${code}, reason=${reason || '无'}`);
      resolve(false);
    });

    // 超时保护
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`   ⏰ 连接超时 (5秒)`);
        ws.close();
        reject(new Error('连接超时'));
      }
    }, 5000);
  });
}

simulateTunnelProxyWebSocketLogic().catch(console.error);
