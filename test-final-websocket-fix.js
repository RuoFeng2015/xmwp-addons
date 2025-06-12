/**
 * 最终WebSocket修复验证测试
 * 测试改进后的认证状态跟踪和auth_invalid消息补偿机制
 */

const WebSocket = require('ws');

console.log('🔍 测试最终的WebSocket认证修复...');
console.log('='.repeat(80));

/**
 * 测试直接连接到HA（对照组）
 */
async function testDirectHAConnection() {
  console.log('\n📍 步骤 1: 测试直接连接到Home Assistant');
  console.log('-'.repeat(50));

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    let messages = [];
    let authSent = false;
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('✅ 直连WebSocket已建立');
    });

    ws.on('message', (data) => {
      const elapsed = Date.now() - startTime;
      try {
        const message = JSON.parse(data.toString());
        messages.push({ ...message, elapsed });
        console.log(`📥 直连消息 (${elapsed}ms): ${message.type}`);

        if (message.type === 'auth_required' && !authSent) {
          authSent = true;
          console.log('🔐 发送无效认证消息...');
          
          const authMessage = {
            "type": "auth",
            "access_token": "invalid_token_for_testing_final_fix"
          };
          
          ws.send(JSON.stringify(authMessage));
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`🔴 直连关闭 (${elapsed}ms): code=${code}`);
      
      const hasAuthRequired = messages.some(m => m.type === 'auth_required');
      const hasAuthInvalid = messages.some(m => m.type === 'auth_invalid');
      
      console.log('📊 直连结果:');
      console.log(`   消息总数: ${messages.length}`);
      console.log(`   auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
      console.log(`   auth_invalid: ${hasAuthInvalid ? '✅' : '❌'}`);
      
      resolve({ messages, hasAuthRequired, hasAuthInvalid });
    });

    ws.on('error', (error) => {
      console.log(`❌ 直连错误: ${error.message}`);
      resolve({ messages: [], hasAuthRequired: false, hasAuthInvalid: false });
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 8000);
  });
}

/**
 * 测试通过隧道代理连接（实验组）
 */
async function testTunnelProxyConnection() {
  console.log('\n📍 步骤 2: 测试通过隧道代理连接');
  console.log('-'.repeat(50));

  return new Promise((resolve) => {
    // 注意：这里需要确保tunnel-proxy和tunnel-server都在运行
    // 并且配置正确指向192.168.6.170:8123
    const ws = new WebSocket('ws://localhost:8080/api/websocket');
    let messages = [];
    let authSent = false;
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('✅ 代理WebSocket已建立');
    });

    ws.on('message', (data) => {
      const elapsed = Date.now() - startTime;
      try {
        const message = JSON.parse(data.toString());
        messages.push({ ...message, elapsed });
        console.log(`📥 代理消息 (${elapsed}ms): ${message.type}`);

        if (message.type === 'auth_required' && !authSent) {
          authSent = true;
          console.log('🔐 发送无效认证消息...');
          
          const authMessage = {
            "type": "auth",
            "access_token": "invalid_token_for_testing_final_fix"
          };
          
          ws.send(JSON.stringify(authMessage));
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`🔴 代理关闭 (${elapsed}ms): code=${code}`);
      
      const hasAuthRequired = messages.some(m => m.type === 'auth_required');
      const hasAuthInvalid = messages.some(m => m.type === 'auth_invalid');
      
      console.log('📊 代理结果:');
      console.log(`   消息总数: ${messages.length}`);
      console.log(`   auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
      console.log(`   auth_invalid: ${hasAuthInvalid ? '✅' : '❌'}`);
      
      resolve({ messages, hasAuthRequired, hasAuthInvalid });
    });

    ws.on('error', (error) => {
      console.log(`❌ 代理连接错误: ${error.message}`);
      console.log('💡 请确保tunnel-proxy和tunnel-server正在运行');
      resolve({ messages: [], hasAuthRequired: false, hasAuthInvalid: false });
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 8000);
  });
}

/**
 * 运行完整测试
 */
async function runFinalTest() {
  try {
    console.log('🎯 这个测试将验证以下修复:');
    console.log('   1. 认证状态跟踪机制');
    console.log('   2. 智能连接关闭分析');
    console.log('   3. auth_invalid消息补偿机制');
    console.log('   4. 改进的延迟策略');

    // 测试直接连接
    const directResult = await testDirectHAConnection();
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 测试代理连接
    const proxyResult = await testTunnelProxyConnection();

    // 分析结果
    console.log('\n📈 最终分析结果:');
    console.log('='.repeat(80));

    console.log('\n🔍 消息接收对比:');
    console.log(`   直连消息数: ${directResult.messages.length}`);
    console.log(`   代理消息数: ${proxyResult.messages.length}`);

    console.log('\n🔐 认证流程对比:');
    console.log(`   直连auth_required: ${directResult.hasAuthRequired ? '✅' : '❌'}`);
    console.log(`   代理auth_required: ${proxyResult.hasAuthRequired ? '✅' : '❌'}`);
    console.log(`   直连auth_invalid: ${directResult.hasAuthInvalid ? '✅' : '❌'}`);
    console.log(`   代理auth_invalid: ${proxyResult.hasAuthInvalid ? '✅' : '❌'}`);

    // 修复效果评估
    const isFixed = proxyResult.hasAuthRequired && proxyResult.hasAuthInvalid && 
                   proxyResult.messages.length >= directResult.messages.length;

    console.log('\n🎉 修复效果评估:');
    if (isFixed) {
      console.log('✅ 修复成功！隧道代理现在能正确处理WebSocket认证流程');
      console.log('   ✓ 认证状态跟踪正常工作');
      console.log('   ✓ auth_invalid消息能够到达浏览器');
      console.log('   ✓ 消息完整性得到保障');
    } else if (proxyResult.hasAuthRequired && !proxyResult.hasAuthInvalid) {
      console.log('⚠️  部分修复：能收到auth_required，但auth_invalid仍有问题');
      console.log('   💡 检查认证消息补偿机制是否正常工作');
    } else if (!proxyResult.hasAuthRequired) {
      console.log('❌ 代理连接失败：请检查tunnel-proxy和tunnel-server状态');
    } else {
      console.log('❓ 修复效果不明确，需要进一步调试');
    }

    console.log('\n📝 建议的下一步:');
    if (isFixed) {
      console.log('   1. 在生产环境中测试');
      console.log('   2. 监控tunnel-proxy日志确认认证分析功能正常');
      console.log('   3. 指导用户正确配置访问令牌');
    } else {
      console.log('   1. 检查tunnel-proxy日志中的认证状态跟踪信息');
      console.log('   2. 验证auth_invalid消息补偿机制是否触发');
      console.log('   3. 确认tunnel-server的WebSocket转发功能正常');
    }

  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
  }
}

// 运行测试
runFinalTest().catch(console.error);
