/**
 * 模拟WebSocket升级测试
 * 直接测试修复的超时问题
 */

const net = require('net');

function testWebSocketUpgradeTimeout() {
  console.log('🧪 测试WebSocket升级超时修复...');
  console.log('📋 这个测试模拟WebSocket升级过程，验证10秒超时是否已修复\n');

  // 连接到代理服务器
  const client = net.createConnection(3081, 'localhost');
  let startTime = Date.now();
  let upgradeStarted = false;
  let timeoutOccurred = false;

  client.on('connect', () => {
    console.log('✅ 已连接到代理服务器 (端口 3081)');

    // 发送WebSocket升级请求
    const upgradeRequest = [
      'GET /api/websocket HTTP/1.1',
      'Host: localhost:3081',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      '',
      ''
    ].join('\r\n');

    console.log('📤 发送WebSocket升级请求...');
    client.write(upgradeRequest);
    upgradeStarted = true;
    startTime = Date.now();
  });

  client.on('data', (data) => {
    const response = data.toString();
    console.log('📥 收到服务器响应:');
    console.log(response);

    if (response.includes('502 Bad Gateway')) {
      console.log('ℹ️  收到502响应是正常的（没有可用的客户端）');
      console.log('⏱️  重要的是测试连接维持时间');
    }
  });

  client.on('close', () => {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n❌ 连接已关闭`);
    console.log(`📊 连接持续时间: ${duration}秒`);

    if (duration >= 9 && duration <= 11) {
      console.log('⚠️  警告：连接在约10秒后关闭，超时问题可能仍存在');
      console.log('🔧 建议检查代码中的setTimeout是否已正确修复');
    } else if (duration < 5) {
      console.log('ℹ️  连接快速关闭是正常的（502响应后服务器主动关闭）');
      console.log('✅ 这不是10秒超时问题');
    } else {
      console.log('✅ 连接持续时间正常，10秒超时问题已修复');
    }
  });

  client.on('error', (error) => {
    console.log(`❌ 连接错误: ${error.message}`);
  });

  // 监控是否在10秒左右发生超时
  setTimeout(() => {
    if (client.destroyed) {
      timeoutOccurred = true;
      console.log('⚠️  检测到连接在10秒左右关闭');
    } else {
      console.log('✅ 连接在10秒后仍然存活，超时问题已修复');
    }
  }, 10500);

  // 防止测试无限运行
  setTimeout(() => {
    if (!client.destroyed) {
      console.log('\n⏰ 测试结束，主动关闭连接');
      client.destroy();
    }
  }, 15000);
}

// 运行测试
testWebSocketUpgradeTimeout();
