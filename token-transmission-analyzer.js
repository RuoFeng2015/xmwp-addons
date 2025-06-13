const WebSocket = require('ws');
const crypto = require('crypto');

/**
 * Token传输完整性分析器
 * 检查access_token在隧道传输过程中是否被修改
 */
class TokenTransmissionAnalyzer {
  constructor() {
    this.originalToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWQ0OTU0ZGVhNjI0YWYxOTUyNjU5YjE3YzZkZjcwZiIsImlhdCI6MTczNDEwMzQyNCwiZXhwIjoyMDQ5NDYzNDI0fQ.DJg9KO2Hd0WGP_bLVGIXKQ7RP4MYoTcxONqNY1Jt2iM';
    this.tokenHash = crypto.createHash('sha256').update(this.originalToken).digest('hex');
  }

  async analyzeTokenTransmission() {
    console.log('🔍 Token传输完整性分析');
    console.log('============================================================');
    console.log(`🔑 原始Token: ${this.originalToken.substring(0, 50)}...`);
    console.log(`🔐 Token哈希: ${this.tokenHash}`);
    console.log('');

    // 步骤1: 监控隧道代理实际发送的token
    await this.interceptTunnelProxyToken();

    // 步骤2: 检查HA日志中的token信息（如果可能）
    await this.checkHAAuthLogs();
  }

  async interceptTunnelProxyToken() {
    console.log('📡 步骤1: 拦截隧道代理发送的token');
    console.log('-------------------------------------------');

    return new Promise((resolve) => {
      const ws = new WebSocket('ws://110.41.20.134:3081/api/websocket');

      let sentToken = null;
      let tokenSent = false;

      // 重写send方法来拦截发送的消息
      const originalSend = ws.send;
      ws.send = function (data) {
        try {
          const message = JSON.parse(data);
          if (message.type === 'auth' && message.access_token) {
            sentToken = message.access_token;
            tokenSent = true;

            const sentTokenHash = crypto.createHash('sha256').update(sentToken).digest('hex');

            console.log(`📤 检测到发送的token: ${sentToken.substring(0, 50)}...`);
            console.log(`🔐 发送token哈希: ${sentTokenHash}`);

            if (sentTokenHash === this.tokenHash) {
              console.log('✅ Token完整性验证通过 - 发送的token与原始token一致');
            } else {
              console.log('❌ Token完整性验证失败 - 发送的token与原始token不一致！');
              console.log('🚨 这可能是问题的根源！');
            }
          }
        } catch (e) {
          // 忽略非JSON消息
        }

        return originalSend.call(this, data);
      };

      ws.on('open', () => {
        console.log('✅ 隧道代理WebSocket连接建立');
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📥 收到消息: ${message.type}`);

          if (message.type === 'auth_required') {
            console.log('🔐 发送认证消息...');
            const authMessage = {
              "type": "auth",
              "access_token": this.originalToken
            };
            ws.send(JSON.stringify(authMessage));
          } else if (message.type === 'auth_invalid') {
            console.log('❌ 收到auth_invalid响应');
            if (tokenSent && sentToken) {
              console.log('\n🔍 Token传输分析:');
              console.log(`   原始token长度: ${this.originalToken.length}`);
              console.log(`   发送token长度: ${sentToken.length}`);
              console.log(`   长度是否一致: ${this.originalToken.length === sentToken.length ? '✅' : '❌'}`);
              console.log(`   内容是否一致: ${this.originalToken === sentToken ? '✅' : '❌'}`);

              if (this.originalToken !== sentToken) {
                console.log('\n🚨 发现token被修改！');
                console.log('差异分析:');
                for (let i = 0; i < Math.max(this.originalToken.length, sentToken.length); i++) {
                  if (this.originalToken[i] !== sentToken[i]) {
                    console.log(`   位置 ${i}: 原始='${this.originalToken[i] || 'undefined'}', 发送='${sentToken[i] || 'undefined'}'`);
                    break;
                  }
                }
              }
            }
          } else if (message.type === 'auth_ok') {
            console.log('✅ 收到auth_ok响应');
          }
        } catch (e) {
          console.log(`📥 收到非JSON消息: ${data.toString().substring(0, 100)}`);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`🔴 连接关闭: code=${code}, reason=${reason || '无'}`);
        resolve();
      });

      ws.on('error', (error) => {
        console.log(`❌ 连接错误: ${error.message}`);
        resolve();
      });

      // 30秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve();
      }, 30000);
    });
  }

  async checkHAAuthLogs() {
    console.log('\n📋 步骤2: HA认证日志分析建议');
    console.log('-------------------------------------------');
    console.log('💡 建议检查以下内容:');
    console.log('1. HA日志中是否有关于token验证失败的详细信息');
    console.log('2. 检查HA是否记录了收到的token内容');
    console.log('3. 验证HA实例的时间设置是否正确');
    console.log('4. 检查是否有IP白名单或其他安全策略影响');

    console.log('\n🔧 可能的解决方案:');
    console.log('1. 如果token被修改，需要检查隧道代理的消息处理逻辑');
    console.log('2. 如果token完整但仍然失败，可能是HA的安全策略问题');
    console.log('3. 检查隧道代理是否正确转发了所有HTTP头信息');
    console.log('4. 验证WebSocket升级过程中的头信息处理');
  }
}

// 运行分析
const analyzer = new TokenTransmissionAnalyzer();
analyzer.analyzeTokenTransmission().catch(console.error);
