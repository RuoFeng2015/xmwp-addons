#!/usr/bin/env node

/**
 * iOS HA连接测试工具
 * 模拟iOS Home Assistant App的请求流程
 */

const http = require('http');

class IOSConnectionTester {
  constructor(domain = 'ha-client-001.wzzhk.club') {
    this.domain = domain;
    this.userAgent = 'Home Assistant/2025.5 (io.robbie.HomeAssistant; build:2025.1264; iOS 16.3.0) Alamofire/5.8.0';
  }

  /**
   * 测试完整的iOS连接流程
   */
  async testFullFlow() {
    console.log('🍎 [iOS测试] 开始模拟iOS Home Assistant App连接流程...\n');
    
    try {
      // 步骤1: 测试基本连接
      console.log('📱 步骤1: 测试基本连接');
      await this.testBasicConnection();
      
      // 步骤2: 测试manifest.json
      console.log('\n📱 步骤2: 测试应用清单');
      await this.testManifest();
      
      // 步骤3: 测试OAuth端点
      console.log('\n📱 步骤3: 测试OAuth端点');
      await this.testOAuthEndpoints();
      
      // 步骤4: 测试关键API
      console.log('\n📱 步骤4: 测试关键API端点');
      await this.testCriticalAPIs();
      
      console.log('\n🎉 [iOS测试] 测试完成!');
      
    } catch (error) {
      console.error('❌ [iOS测试] 测试失败:', error.message);
    }
  }

  /**
   * 测试基本连接
   */
  testBasicConnection() {
    return this.makeRequest('GET', '/');
  }

  /**
   * 测试manifest.json
   */
  testManifest() {
    return this.makeRequest('GET', '/manifest.json');
  }

  /**
   * 测试OAuth端点
   */
  async testOAuthEndpoints() {
    // 测试auth providers
    await this.makeRequest('GET', '/auth/providers');
    
    // 测试authorize endpoint (这会返回HTML)
    await this.makeRequest('GET', '/auth/authorize?response_type=code&client_id=https://home-assistant.io/iOS&redirect_uri=homeassistant://auth-callback');
  }

  /**
   * 测试关键API
   */
  async testCriticalAPIs() {
    // 注意：这些API需要认证，所以会返回401，但我们主要测试连通性
    const apis = [
      '/api/config',
      '/api/states',
      '/api/services',
      '/api/websocket'
    ];
    
    for (const api of apis) {
      await this.makeRequest('GET', api);
    }
  }

  /**
   * 发起HTTP请求
   */
  makeRequest(method, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.domain,
        port: 443,
        path: path,
        method: method,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': '*/*',
          'Accept-Language': 'zh-Hans-US;q=1.0',
          'Accept-Encoding': 'br;q=1.0, gzip;q=0.9, deflate;q=0.8'
        },
        timeout: 10000
      };

      const protocol = require('https');
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const size = data.length;
          const contentType = res.headers['content-type'] || '未知';
          
          if (res.statusCode === 200) {
            console.log(`  ✅ ${method} ${path}: ${res.statusCode} (${size} bytes, ${contentType})`);
          } else if (res.statusCode === 401) {
            console.log(`  🔐 ${method} ${path}: ${res.statusCode} (需要认证，这是正常的)`);
          } else if (res.statusCode === 404) {
            console.log(`  ❓ ${method} ${path}: ${res.statusCode} (端点不存在)`);
          } else {
            console.log(`  ⚠️  ${method} ${path}: ${res.statusCode} (${size} bytes)`);
          }
          
          // 检查重要的响应头
          if (path.includes('/auth/')) {
            this.checkAuthHeaders(res.headers);
          }
          
          resolve({ statusCode: res.statusCode, data, headers: res.headers });
        });
      });

      req.on('error', (error) => {
        console.log(`  ❌ ${method} ${path}: 连接失败 - ${error.message}`);
        reject(error);
      });

      req.on('timeout', () => {
        console.log(`  ⏰ ${method} ${path}: 超时`);
        req.destroy();
        reject(new Error('超时'));
      });

      req.end();
    });
  }

  /**
   * 检查认证相关的响应头
   */
  checkAuthHeaders(headers) {
    const corsOrigin = headers['access-control-allow-origin'];
    const corsHeaders = headers['access-control-allow-headers'];
    const corsMethods = headers['access-control-allow-methods'];
    
    if (corsOrigin) {
      console.log(`    🌐 CORS Origin: ${corsOrigin}`);
    } else {
      console.log(`    ⚠️  缺少CORS Origin头`);
    }
    
    if (corsHeaders) {
      console.log(`    🌐 CORS Headers: ${corsHeaders}`);
    }
    
    if (corsMethods) {
      console.log(`    🌐 CORS Methods: ${corsMethods}`);
    }
  }
}

// 运行测试
if (require.main === module) {
  const domain = process.argv[2] || 'ha-client-001.wzzhk.club';
  const tester = new IOSConnectionTester(domain);
  tester.testFullFlow().catch(console.error);
}

module.exports = IOSConnectionTester;
