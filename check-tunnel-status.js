const WebSocket = require('ws');
const net = require('net');

/**
 * 检查tunnel-proxy实际运行状态和连接问题
 */
class TunnelProxyStatusChecker {
  async runAllChecks() {
    console.log('🔍 Tunnel-Proxy 运行状态检查');
    console.log('============================================================');
    
    // 1. 检查tunnel-proxy是否在监听
    await this.checkTunnelProxyListening();
    
    // 2. 检查tunnel-proxy到HA的连接
    await this.checkProxyToHAConnection();
    
    // 3. 检查tunnel-server状态
    await this.checkTunnelServerStatus();
    
    // 4. 分析问题
    this.analyzeIssues();
  }

  async checkTunnelProxyListening() {
    console.log('\n📡 检查tunnel-proxy是否正在监听...');
    
    return new Promise((resolve) => {
      const client = net.createConnection({ port: 3081, host: '110.41.20.134' }, () => {
        console.log('✅ tunnel-proxy端口3081正在监听');
        client.end();
        resolve(true);
      });
      
      client.on('error', (err) => {
        console.log(`❌ tunnel-proxy端口3081无法连接: ${err.message}`);
        resolve(false);
      });
      
      client.setTimeout(5000, () => {
        console.log('❌ tunnel-proxy连接超时');
        client.destroy();
        resolve(false);
      });
    });
  }

  async checkProxyToHAConnection() {
    console.log('\n🏠 检查tunnel-proxy到Home Assistant的连接...');
    
    return new Promise((resolve) => {
      // 尝试直接连接到HA来验证HA服务状态
      const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
      
      ws.on('open', () => {
        console.log('✅ Home Assistant WebSocket服务正常运行');
        ws.close();
        resolve(true);
      });
      
      ws.on('error', (error) => {
        console.log(`❌ Home Assistant WebSocket服务异常: ${error.message}`);
        resolve(false);
      });
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log('❌ 连接到Home Assistant超时');
          ws.close();
          resolve(false);
        }
      }, 5000);
    });
  }

  async checkTunnelServerStatus() {
    console.log('\n🌐 检查tunnel-server状态...');
    
    return new Promise((resolve) => {
      const client = net.createConnection({ port: 3080, host: '110.41.20.134' }, () => {
        console.log('✅ tunnel-server端口3080正在监听');
        
        // 发送简单的心跳测试
        const testMessage = JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        }) + '\n';
        
        client.write(testMessage);
        
        client.on('data', (data) => {
          console.log('✅ tunnel-server响应正常');
          client.end();
          resolve(true);
        });
        
        setTimeout(() => {
          console.log('⚠️  tunnel-server无响应但端口开放');
          client.end();
          resolve(true);
        }, 3000);
      });
      
      client.on('error', (err) => {
        console.log(`❌ tunnel-server端口3080无法连接: ${err.message}`);
        resolve(false);
      });
      
      client.setTimeout(5000, () => {
        console.log('❌ tunnel-server连接超时');
        client.destroy();
        resolve(false);
      });
    });
  }

  analyzeIssues() {
    console.log('\n============================================================');
    console.log('🔧 问题分析和建议');
    console.log('============================================================');
    
    console.log('\n基于之前的测试结果（连接关闭代码1006），问题可能是：');
    console.log('');
    console.log('1. 🔄 tunnel-proxy服务状态问题');
    console.log('   - tunnel-proxy可能需要重启以加载修复代码');
    console.log('   - 服务可能在认证过程中崩溃或重连');
    console.log('');
    console.log('2. 🌐 网络连接不稳定');
    console.log('   - tunnel-proxy到Home Assistant的连接可能不稳定');
    console.log('   - tunnel-proxy到tunnel-server的连接可能有问题');
    console.log('');
    console.log('3. 🔧 配置问题');
    console.log('   - tunnel-proxy可能配置了错误的HA地址');
    console.log('   - 修复代码可能未正确部署');
    console.log('');
    console.log('📋 建议操作步骤：');
    console.log('1. 重启tunnel-proxy服务以确保加载修复代码');
    console.log('2. 检查tunnel-proxy的日志输出');
    console.log('3. 验证tunnel-proxy的配置文件');
    console.log('4. 如果问题持续，可能需要在tunnel-server端实施补偿机制');
  }
}

// 运行检查
const checker = new TunnelProxyStatusChecker();
checker.runAllChecks().catch(console.error);
