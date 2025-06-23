const WebSocket = require('ws');

console.log('=== WebSocket 数据格式调试工具 ===');

// 从实际网页登录获取的有效 token
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWQxZDg4NmI2Zjc0MGU5ODQzY2MxZGY4ODA3MGUzYyIsImlhdCI6MTc1MDY2MDM5NiwiZXhwIjoxNzUwNjYyMTk2fQ.jMSGKOReRNggZy7GjC82WAuYDEINKq4c7gdA7Iefm2c';

// 测试函数
async function testConnection(wsUrl, label) {
  console.log(`\n--- 测试 ${label} ---`);
  console.log(`连接地址: ${wsUrl}`);

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let messageCount = 0;

    ws.on('open', () => {
      console.log(`${label}: WebSocket 连接已建立`);

      // 构造认证消息
      const authMessage = {
        type: 'auth',
        access_token: ACCESS_TOKEN
      };

      console.log(`${label}: 发送认证消息:`, JSON.stringify(authMessage));

      // 发送认证消息
      ws.send(JSON.stringify(authMessage));
    });

    ws.on('message', (data) => {
      messageCount++;
      console.log(`${label}: 收到消息 #${messageCount}:`, data.toString());

      try {
        const message = JSON.parse(data.toString());
        console.log(`${label}: 解析后的消息:`, message);

        if (message.type === 'auth_ok') {
          console.log(`${label}: ✅ 认证成功!`);
          ws.close();
          resolve({ success: true, message: '认证成功' });
        } else if (message.type === 'auth_invalid') {
          console.log(`${label}: ❌ 认证失败!`);
          ws.close();
          resolve({ success: false, message: '认证失败' });
        } else if (message.type === 'auth_required') {
          console.log(`${label}: ℹ️ 需要认证`);
        }
      } catch (e) {
        console.log(`${label}: 消息解析失败:`, e.message);
      }
    });

    ws.on('error', (error) => {
      console.log(`${label}: WebSocket 错误:`, error.message);
      resolve({ success: false, message: `连接错误: ${error.message}` });
    });

    ws.on('close', (code, reason) => {
      console.log(`${label}: 连接关闭 - 代码: ${code}, 原因: ${reason}`);
      if (messageCount === 0) {
        resolve({ success: false, message: '未收到任何消息' });
      }
    });

    // 30秒超时
    setTimeout(() => {
      console.log(`${label}: ⏰ 测试超时`);
      ws.close();
      resolve({ success: false, message: '测试超时' });
    }, 30000);
  });
}

async function main() {
  try {
    // 测试直连 Home Assistant
    const directResult = await testConnection('ws://http://192.168.6.170:8123/api/websocket', '直连 HA');

    // 测试通过隧道代理
    const proxyResult = await testConnection('ws://ws://110.41.20.134:3081/api/websocket', '隧道代理');

    console.log('\n=== 测试结果汇总 ===');
    console.log('直连 HA:', directResult);
    console.log('隧道代理:', proxyResult);

    // 分析差异
    if (directResult.success && !proxyResult.success) {
      console.log('\n❌ 问题确认: 直连成功但代理失败');
      console.log('需要检查隧道代理的 WebSocket 数据处理逻辑');
    } else if (directResult.success && proxyResult.success) {
      console.log('\n✅ 问题已解决: 两种方式都成功');
    } else {
      console.log('\n⚠️  其他问题: 需要进一步分析');
    }

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

main().catch(console.error);
