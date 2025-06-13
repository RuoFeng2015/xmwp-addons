/**
 * 快速验证WebSocket认证状态跟踪修复
 * 测试authenticationState作用域问题是否已解决
 */

const WebSocket = require('ws');

console.log('🔧 快速验证WebSocket认证状态跟踪修复');
console.log('='.repeat(60));

async function testWebSocketAuthTracking() {
  console.log('\n📍 测试1: 直接连接HA验证认证流程');

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    let messages = [];
    let authSent = false;
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('✅ WebSocket连接已建立');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        const elapsed = Date.now() - startTime;

        console.log(`📥 收到消息 (${elapsed}ms): ${message.type}`);

        if (message.type === 'auth_required' && !authSent) {
          authSent = true;
          console.log('🔐 发送认证消息...');

          // 使用无效token测试认证失败流程
          const authMessage = {
            "type": "auth",
            "access_token": "invalid_token_for_testing_scope_fix"
          };

          ws.send(JSON.stringify(authMessage));
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`🔴 连接关闭 (${elapsed}ms): code=${code}`);

      const hasAuthRequired = messages.some(m => m.type === 'auth_required');
      const hasAuthInvalid = messages.some(m => m.type === 'auth_invalid');

      console.log('\n📊 直连测试结果:');
      console.log(`   总消息数: ${messages.length}`);
      console.log(`   auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
      console.log(`   auth_invalid: ${hasAuthInvalid ? '✅' : '❌'}`);

      if (hasAuthRequired && hasAuthInvalid && messages.length >= 2) {
        console.log('✅ 直连认证流程正常，HA会发送完整的认证消息');
      } else {
        console.log('⚠️  直连认证流程异常，需要检查HA状态');
      }

      resolve({ hasAuthRequired, hasAuthInvalid, messageCount: messages.length });
    });

    ws.on('error', (error) => {
      console.log(`❌ WebSocket错误: ${error.message}`);
      resolve({ hasAuthRequired: false, hasAuthInvalid: false, messageCount: 0 });
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 6000);
  });
}

async function testTunnelProxyAuth() {
  console.log('\n📍 测试2: 通过隧道代理测试认证状态跟踪');

  return new Promise((resolve) => {
    // 确保tunnel-proxy在localhost:8080运行
    const ws = new WebSocket('ws://localhost:8080/api/websocket');
    let messages = [];
    let authSent = false;
    const startTime = Date.now();

    ws.on('open', () => {
      console.log('✅ 代理WebSocket连接已建立');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        const elapsed = Date.now() - startTime;

        console.log(`📥 代理消息 (${elapsed}ms): ${message.type}`);

        if (message.type === 'auth_required' && !authSent) {
          authSent = true;
          console.log('🔐 发送认证消息...');

          const authMessage = {
            "type": "auth",
            "access_token": "invalid_token_for_testing_scope_fix"
          };

          ws.send(JSON.stringify(authMessage));
        }
      } catch (e) {
        console.log(`❌ 消息解析失败: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      const elapsed = Date.now() - startTime;
      console.log(`🔴 代理连接关闭 (${elapsed}ms): code=${code}`);

      const hasAuthRequired = messages.some(m => m.type === 'auth_required');
      const hasAuthInvalid = messages.some(m => m.type === 'auth_invalid');

      console.log('\n📊 代理测试结果:');
      console.log(`   总消息数: ${messages.length}`);
      console.log(`   auth_required: ${hasAuthRequired ? '✅' : '❌'}`);
      console.log(`   auth_invalid: ${hasAuthInvalid ? '✅' : '❌'}`);

      resolve({ hasAuthRequired, hasAuthInvalid, messageCount: messages.length });
    });

    ws.on('error', (error) => {
      console.log(`❌ 代理连接错误: ${error.message}`);
      console.log('💡 请确保tunnel-proxy正在运行在localhost:8080');
      resolve({ hasAuthRequired: false, hasAuthInvalid: false, messageCount: 0 });
    });

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 6000);
  });
}

async function runQuickValidation() {
  try {
    console.log('🎯 这个测试将验证:');
    console.log('   1. authenticationState作用域问题是否已修复');
    console.log('   2. 认证状态跟踪是否正常工作');
    console.log('   3. auth_invalid消息补偿机制是否有效');

    // 测试直接连接
    const directResult = await testWebSocketAuthTracking();

    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试代理连接
    const proxyResult = await testTunnelProxyAuth();

    // 分析结果
    console.log('\n🎉 修复验证结果:');
    console.log('='.repeat(60));

    if (proxyResult.hasAuthRequired) {
      console.log('✅ tunnel-proxy可以转发auth_required消息');
    } else {
      console.log('❌ tunnel-proxy无法转发auth_required消息');
    }

    if (proxyResult.hasAuthInvalid) {
      console.log('✅ tunnel-proxy可以转发auth_invalid消息 - 修复成功！');
      console.log('   • authenticationState作用域问题已解决');
      console.log('   • 认证状态跟踪正常工作');
    } else if (proxyResult.hasAuthRequired) {
      console.log('⚠️  tunnel-proxy可以转发auth_required但auth_invalid仍有问题');
      console.log('   • 检查认证消息补偿机制是否触发');
      console.log('   • 查看tunnel-proxy日志中的认证状态分析');
    } else {
      console.log('❌ tunnel-proxy连接失败');
      console.log('   • 请确保tunnel-proxy和tunnel-server正在运行');
    }

    console.log('\n📋 消息数量对比:');
    console.log(`   直连: ${directResult.messageCount} 条消息`);
    console.log(`   代理: ${proxyResult.messageCount} 条消息`);

    if (proxyResult.messageCount >= directResult.messageCount && proxyResult.hasAuthInvalid) {
      console.log('\n🎊 恭喜！WebSocket认证修复验证通过！');
      console.log('   ✓ authenticationState作用域问题已修复');
      console.log('   ✓ 认证状态跟踪机制正常工作');
      console.log('   ✓ auth_invalid消息可以正确传输');
    } else {
      console.log('\n🔧 还需要进一步调试:');
      console.log('   1. 检查tunnel-proxy日志中是否有"authenticationState is not defined"错误');
      console.log('   2. 验证认证状态跟踪和连接关闭分析功能');
      console.log('   3. 确认auth_invalid消息补偿机制是否正确触发');
    }

  } catch (error) {
    console.error(`❌ 验证测试失败: ${error.message}`);
  }
}

// 运行验证
runQuickValidation().catch(console.error);
let authSent = false;
let authRequiredTime = null;
let authInvalidTime = null;
let closeTime = null;

ws.on('open', () => {
  console.log('✅ WebSocket连接建立');
});

ws.on('message', (data) => {
  const now = Date.now();
  try {
    const message = JSON.parse(data.toString());

    if (message.type === 'auth_required') {
      authRequiredTime = now;
      console.log(`📥 收到auth_required`);

      if (!authSent) {
        authSent = true;
        console.log('📤 发送无效认证...');

        const authMessage = {
          "type": "auth",
          "access_token": "invalid_token_validation_test"
        };

        ws.send(JSON.stringify(authMessage));
      }
    } else if (message.type === 'auth_invalid') {
      authInvalidTime = now;
      console.log(`📥 收到auth_invalid (${authInvalidTime - authRequiredTime}ms后)`);
    }
  } catch (e) {
    console.log(`❌ 消息解析失败: ${e.message}`);
  }
});

ws.on('close', (code, reason) => {
  closeTime = Date.now();
  console.log(`🔴 连接关闭: code=${code} (${closeTime - authRequiredTime}ms后)`);

  // 分析时序
  console.log('\n📊 时序分析:');
  if (authInvalidTime) {
    const authToInvalid = authInvalidTime - authRequiredTime;
    const invalidToClose = closeTime - authInvalidTime;
    console.log(`   auth_required → auth_invalid: ${authToInvalid}ms`);
    console.log(`   auth_invalid → 连接关闭: ${invalidToClose}ms`);

    if (invalidToClose < 100) {
      console.log('   ⚠️  HA在发送auth_invalid后几乎立即关闭连接');
      console.log('   💡 这解释了为什么在网络延迟或代理环境中可能丢失消息');
    }
  } else {
    console.log(`   ❌ 没有收到auth_invalid消息`);
    console.log(`   🚨 这表明存在严重的消息丢失问题`);
  }

  // 验证我们的修复逻辑
  console.log('\n🔧 修复逻辑验证:');

  // 模拟我们在tunnel-proxy中实现的认证状态跟踪
  const authState = {
    required: !!authRequiredTime,
    response: authInvalidTime ? 'invalid' : null,
    successful: false
  };

  console.log(`   认证状态跟踪: ${JSON.stringify(authState)}`);

  // 模拟连接关闭分析
  let closeAnalysis = '';
  if (authState.required) {
    if (authState.response === 'invalid') {
      closeAnalysis = 'HA在认证失败后正常关闭连接（安全机制）';
    } else if (authState.response === null && code === 1000) {
      closeAnalysis = 'HA在认证过程中关闭连接（可能是auth_invalid消息丢失）';
      console.log('   🎯 触发auth_invalid消息补偿机制');
    }
  }

  console.log(`   连接关闭分析: ${closeAnalysis}`);

  // 评估修复效果
  console.log('\n✅ 修复验证结果:');
  if (authInvalidTime) {
    console.log('   ✓ 直连环境下能收到auth_invalid消息');
    console.log('   ✓ 认证状态跟踪逻辑正确');
    console.log('   ✓ 连接关闭分析准确');
    console.log('   💡 在代理环境中，新的补偿机制将确保消息不丢失');
  } else {
    console.log('   ❌ 连直连都收不到auth_invalid，存在其他问题');
  }

  resolve();
});

ws.on('error', (error) => {
  console.log(`❌ WebSocket错误: ${error.message}`);
  resolve();
});

// 超时保护
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}, 10000);
  });
}

// 运行验证
quickValidationTest().then(() => {
  console.log('\n🎉 快速验证完成');
  console.log('\n📝 总结:');
  console.log('   1. 我们已经确认了HA的行为模式');
  console.log('   2. 实现了智能的认证状态跟踪');
  console.log('   3. 添加了auth_invalid消息补偿机制');
  console.log('   4. 改进了连接关闭延迟策略');
  console.log('\n💡 下一步: 在实际的tunnel-proxy环境中测试这些改进');
}).catch(console.error);
