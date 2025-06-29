#!/usr/bin/env node

/**
 * 测试HTTP API请求转发
 * 模拟iOS应用在WebSocket认证后访问HA API
 */

const http = require('http');
const https = require('https');

// 配置
const CONFIG = {
  // 使用域名访问（模拟iOS应用行为）
  host: 'ha-client-001.wzzhk.club',
  port: 443,
  protocol: 'https',
  
  // 测试的API路径
  testPaths: [
    '/api/config',
    '/api/',
    '/api/auth/current_user',
    '/api/discovery_info',
    '/manifest.json'
  ],
  
  // iOS应用的User-Agent
  userAgent: 'Home Assistant/2021.12 (io.robbie.HomeAssistant; build:2021.322; iOS 15.1.0) Alamofire/5.4.4'
};

// 禁用证书验证（用于测试）
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

class HTTPAPITester {
  constructor() {
    this.results = [];
  }

  /**
   * 测试单个API端点
   */
  async testAPIEndpoint(path) {
    return new Promise((resolve) => {
      console.log(`\n🔍 测试API端点: ${path}`);
      
      const options = {
        hostname: CONFIG.host,
        port: CONFIG.port,
        path: path,
        method: 'GET',
        headers: {
          'User-Agent': CONFIG.userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 10000
      };

      const startTime = Date.now();
      
      const requestLib = CONFIG.protocol === 'https' ? https : http;
      const req = requestLib.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const result = {
            path: path,
            statusCode: res.statusCode,
            headers: res.headers,
            bodyLength: data.length,
            duration: duration,
            success: res.statusCode >= 200 && res.statusCode < 400
          };
          
          console.log(`   状态码: ${res.statusCode}`);
          console.log(`   响应时间: ${duration}ms`);
          console.log(`   Content-Type: ${res.headers['content-type'] || 'N/A'}`);
          console.log(`   响应长度: ${data.length} bytes`);
          
          if (data.length > 0 && data.length < 1000) {
            console.log(`   响应内容: ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`);
          }
          
          this.results.push(result);
          resolve(result);
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ 请求失败: ${error.message}`);
        
        const result = {
          path: path,
          error: error.message,
          duration: duration,
          success: false
        };
        
        this.results.push(result);
        resolve(result);
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`   ⏰ 请求超时`);
        
        const result = {
          path: path,
          error: 'Timeout',
          duration: 10000,
          success: false
        };
        
        this.results.push(result);
        resolve(result);
      });

      req.end();
    });
  }

  /**
   * 测试带认证的API请求
   */
  async testAuthenticatedAPI(path, token) {
    return new Promise((resolve) => {
      console.log(`\n🔐 测试认证API端点: ${path}`);
      
      const options = {
        hostname: CONFIG.host,
        port: CONFIG.port,
        path: path,
        method: 'GET',
        headers: {
          'User-Agent': CONFIG.userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 10000
      };

      const startTime = Date.now();
      
      const requestLib = CONFIG.protocol === 'https' ? https : http;
      const req = requestLib.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const result = {
            path: path,
            statusCode: res.statusCode,
            headers: res.headers,
            bodyLength: data.length,
            duration: duration,
            success: res.statusCode >= 200 && res.statusCode < 400,
            authenticated: true
          };
          
          console.log(`   状态码: ${res.statusCode}`);
          console.log(`   响应时间: ${duration}ms`);
          console.log(`   Content-Type: ${res.headers['content-type'] || 'N/A'}`);
          console.log(`   响应长度: ${data.length} bytes`);
          
          if (data.length > 0 && data.length < 1000) {
            console.log(`   响应内容: ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`);
          }
          
          this.results.push(result);
          resolve(result);
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ 请求失败: ${error.message}`);
        
        const result = {
          path: path,
          error: error.message,
          duration: duration,
          success: false,
          authenticated: true
        };
        
        this.results.push(result);
        resolve(result);
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`   ⏰ 请求超时`);
        
        const result = {
          path: path,
          error: 'Timeout',
          duration: 10000,
          success: false,
          authenticated: true
        };
        
        this.results.push(result);
        resolve(result);
      });

      req.end();
    });
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log(`🚀 开始HTTP API测试`);
    console.log(`目标服务器: ${CONFIG.host}:${CONFIG.port}`);
    console.log(`User-Agent: ${CONFIG.userAgent}`);

    // 测试所有基础API端点
    for (const path of CONFIG.testPaths) {
      await this.testAPIEndpoint(path);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 间隔1秒
    }

    // 测试带token的认证API（使用模拟token）
    const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI...'; // 模拟token
    await this.testAuthenticatedAPI('/api/auth/current_user', mockToken);

    this.printSummary();
  }

  /**
   * 打印测试总结
   */
  printSummary() {
    console.log(`\n📊 测试总结:`);
    console.log(`═══════════════════════════════════════`);
    
    const successful = this.results.filter(r => r.success).length;
    const total = this.results.length;
    
    console.log(`总请求数: ${total}`);
    console.log(`成功数: ${successful}`);
    console.log(`失败数: ${total - successful}`);
    console.log(`成功率: ${((successful / total) * 100).toFixed(1)}%`);
    
    console.log(`\n详细结果:`);
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const auth = result.authenticated ? ' [认证]' : '';
      console.log(`${index + 1}. ${status} ${result.path}${auth} - ${result.statusCode || result.error}`);
    });

    // 检查关键API
    const configAPI = this.results.find(r => r.path === '/api/config');
    if (configAPI && configAPI.success) {
      console.log(`\n🎉 关键发现: /api/config 访问成功！这表明HTTP API代理工作正常。`);
    } else {
      console.log(`\n⚠️ 警告: /api/config 访问失败，这可能是iOS认证问题的根因。`);
    }
  }
}

// 运行测试
const tester = new HTTPAPITester();
tester.runAllTests().catch(console.error);
