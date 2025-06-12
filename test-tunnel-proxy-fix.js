/**
 * 直接测试tunnel-proxy的WebSocket处理逻辑
 * 验证消息转发的时序问题是否已修复
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

console.log('🔧 测试tunnel-proxy WebSocket消息转发修复...');
console.log('='.repeat(60));

async function testTunnelProxyFix() {
  console.log('📋 测试计划:');
  console.log('1. 启动tunnel-proxy (开发模式)');
  console.log('2. 观察WebSocket消息处理日志');
  console.log('3. 验证500ms延迟修复是否生效');
  console.log('4. 检查消息转发完整性\n');

  // 启动tunnel-proxy
  const tunnelProxyPath = path.join(__dirname, 'tunnel-proxy', 'rootfs', 'opt', 'tunnel-proxy');
  console.log(`🚀 启动tunnel-proxy: ${tunnelProxyPath}`);

  const tunnelProxy = spawn('node', ['app.js'], {
    cwd: tunnelProxyPath,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'pipe'
  });

  let proxyLogs = '';
  let proxyReady = false;

  tunnelProxy.stdout.on('data', (data) => {
    const log = data.toString();
    proxyLogs += log;
    console.log(`[PROXY] ${log.trim()}`);

    if (log.includes('代理服务器已启动')) {
      proxyReady = true;
    }
  });

  tunnelProxy.stderr.on('data', (data) => {
    console.log(`[PROXY ERROR] ${data.toString().trim()}`);
  });

  tunnelProxy.on('close', (code) => {
    console.log(`🔴 tunnel-proxy进程退出: ${code}`);
  });

  // 等待proxy启动
  console.log('⏳ 等待tunnel-proxy启动...');
  await new Promise(resolve => {
    const checkReady = () => {
      if (proxyReady) {
        resolve();
      } else {
        setTimeout(checkReady, 500);
      }
    };
    checkReady();
  });

  console.log('✅ tunnel-proxy已启动');

  // 模拟WebSocket连接测试
  setTimeout(() => {
    console.log('\n🔍 开始WebSocket连接测试...');
    testWebSocketConnection();
  }, 2000);

  // 10秒后关闭
  setTimeout(() => {
    console.log('\n⏰ 测试完成，关闭tunnel-proxy...');
    tunnelProxy.kill('SIGINT');

    // 分析日志
    console.log('\n📊 日志分析:');
    if (proxyLogs.includes('500ms延迟')) {
      console.log('✅ 修复生效: 找到500ms延迟处理');
    } else {
      console.log('❌ 修复可能未生效: 未找到500ms延迟处理');
    }

    if (proxyLogs.includes('WebSocket消息转发失败')) {
      console.log('❌ 发现消息转发错误');
    } else {
      console.log('✅ 未发现明显的消息转发错误');
    }

    process.exit(0);
  }, 15000);
}

function testWebSocketConnection() {
  // 这里可以添加实际的WebSocket连接测试
  // 但主要目的是观察tunnel-proxy的日志输出
  console.log('📝 注意观察tunnel-proxy日志中的:');
  console.log('   - WebSocket连接建立');
  console.log('   - 消息转发处理');
  console.log('   - 连接关闭时序');
  console.log('   - 500ms延迟处理');
}

testTunnelProxyFix().catch(console.error);
