#!/usr/bin/env node

/**
 * 模拟iOS Home Assistant应用的完整认证流程
 * 1. WebSocket连接和认证（已经成功）
 * 2. HTTP API访问验证（当前问题所在）
 */

const https = require('https');
const WebSocket = require('ws');

// 禁用证书验证
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const CONFIG = {
  // 正确的域名地址
  domain: 'ha-client-001.wzzhk.club',
  
  // 从日志中提取的token
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIzZTI1OGMxYWZjN2Y0ODFlYmVmY2Q5MWMwZGFkNDNlNyIsImlhdCI6MTc1MTIwODk4OCwiZXhwIjoxNzUxMjEwNzg4fQ.8JVK-VdL2wWYY0QOi_h_0tdjShBJFU9HYxib1iL6jbw',
  
  // iOS应用的User-Agent
  userAgent: 'Home Assistant/2021.12 (io.robbie.HomeAssistant; build:2021.322; iOS 15.1.0) Alamofire/5.4.4'
};

class iOSAuthFlowSimulator {
  constructor() {
    this.results = [];
  }

  /**
   * 测试关键的HTTP API端点 - 这些是iOS应用认证流程必需的
   */
  async testCriticalAPIs() {
    console.log('🍎 开始模拟iOS应用认证后的API访问流程');
    console.log(`目标域名: ${CONFIG.domain}`);
    
    // iOS应用认证后通常访问的关键API端点
    const criticalAPIs = [
      '/api/config',           // 获取HA配置 - 最重要
      '/api/',                 // 获取API根目录
      '/api/discovery_info',   // 发现信息
      '/manifest.json',        // PWA配置
      '/auth/providers',       // 认证提供者
      '/api/auth/current_user' // 当前用户信息
    ];

    console.log('\n📋 测试关键API端点:');
    for (const endpoint of criticalAPIs) {
      await this.testAPI(endpoint, true);
      await this.sleep(500); // 500ms间隔
    }

    // 使用IP地址测试（模拟iOS可能的行为）
    console.log('\n🔍 测试IP地址访问（iOS可能的行为）:');
    await this.testAPIWithIP('/api/config');
    
    this.printResults();
  }

  /**
   * 测试API端点
   */
  async testAPI(endpoint, withAuth = false) {
    return new Promise((resolve) => {
      const options = {
        hostname: CONFIG.domain,
        port: 443,
        path: endpoint,
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

      if (withAuth && CONFIG.accessToken) {
        options.headers['Authorization'] = `Bearer ${CONFIG.accessToken}`;
      }

      const startTime = Date.now();
      console.log(`\n🔍 测试: ${endpoint}${withAuth ? ' [带认证]' : ''}`);

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const result = {
            endpoint,
            status: res.statusCode,
            duration,
            contentType: res.headers['content-type'],
            bodyLength: data.length,
            isJSON: false,
            isErrorPage: false,
            success: res.statusCode >= 200 && res.statusCode < 400
          };

          // 检查响应内容
          try {
            JSON.parse(data);
            result.isJSON = true;
          } catch (e) {
            // 不是JSON，检查是否是错误页面
            if (data.includes('Home Assistant 连接错误') || data.includes('没有可用的隧道客户端')) {
              result.isErrorPage = true;
            }
          }

          console.log(`   状态码: ${res.statusCode}`);
          console.log(`   响应时间: ${duration}ms`);
          console.log(`   Content-Type: ${result.contentType || 'N/A'}`);
          console.log(`   响应长度: ${data.length} bytes`);
          console.log(`   是JSON: ${result.isJSON ? '✅' : '❌'}`);
          console.log(`   是错误页: ${result.isErrorPage ? '⚠️' : '✅'}`);

          if (data.length > 0 && data.length < 1000) {
            console.log(`   内容预览: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
          }

          this.results.push(result);
          resolve(result);
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ 请求失败: ${error.message}`);
        
        this.results.push({
          endpoint,
          error: error.message,
          duration,
          success: false
        });
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`   ⏰ 请求超时`);
        
        this.results.push({
          endpoint,
          error: 'Timeout',
          duration: 10000,
          success: false
        });
        resolve();
      });

      req.end();
    });
  }

  /**
   * 使用IP地址测试API（模拟iOS可能的行为）
   */
  async testAPIWithIP(endpoint) {
    return new Promise((resolve) => {
      const options = {
        hostname: '114.132.237.146', // 直接使用服务器IP
        port: 443,
        path: endpoint,
        method: 'GET',
        headers: {
          'Host': CONFIG.domain, // 保持Host头为域名
          'User-Agent': CONFIG.userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${CONFIG.accessToken}`,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 10000
      };

      const startTime = Date.now();
      console.log(`\n🔍 IP访问测试: ${endpoint} (通过IP但保持Host头)`);

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          
          console.log(`   状态码: ${res.statusCode}`);
          console.log(`   响应时间: ${duration}ms`);
          console.log(`   Content-Type: ${res.headers['content-type'] || 'N/A'}`);
          console.log(`   响应长度: ${data.length} bytes`);

          if (data.length > 0 && data.length < 500) {
            console.log(`   内容预览: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
          }

          resolve();
        });
      });

      req.on('error', (error) => {
        console.log(`   ❌ IP访问失败: ${error.message}`);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`   ⏰ IP访问超时`);
        resolve();
      });

      req.end();
    });
  }

  /**
   * 打印测试结果总结
   */
  printResults() {
    console.log('\n📊 iOS认证流程测试总结:');
    console.log('═══════════════════════════════════════');
    
    const successful = this.results.filter(r => r.success).length;
    const jsonResponses = this.results.filter(r => r.isJSON).length;
    const errorPages = this.results.filter(r => r.isErrorPage).length;
    const total = this.results.length;
    
    console.log(`总请求数: ${total}`);
    console.log(`成功数: ${successful}`);
    console.log(`JSON响应数: ${jsonResponses}`);
    console.log(`错误页面数: ${errorPages}`);
    console.log(`成功率: ${((successful / total) * 100).toFixed(1)}%`);
    
    // 关键发现
    const configAPI = this.results.find(r => r.endpoint === '/api/config');
    if (configAPI && configAPI.success && configAPI.isJSON) {
      console.log('\n✅ 关键发现: /api/config返回有效JSON，iOS认证应该能成功！');
    } else if (configAPI && configAPI.isErrorPage) {
      console.log('\n❌ 关键问题: /api/config返回错误页面，这是iOS认证失败的根因！');
      console.log('   原因: HTTP请求没有正确转发到tunnel-client');
    } else if (configAPI && !configAPI.success) {
      console.log('\n⚠️ 关键问题: /api/config请求失败，需要检查网络连接');
    } else {
      console.log('\n❓ 未知状态: /api/config测试结果不明确');
    }
    
    console.log('\n详细结果:');
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const json = result.isJSON ? ' [JSON]' : '';
      const error = result.isErrorPage ? ' [错误页]' : '';
      console.log(`${index + 1}. ${status} ${result.endpoint}${json}${error} - ${result.status || result.error}`);
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行测试
const simulator = new iOSAuthFlowSimulator();
simulator.testCriticalAPIs().catch(console.error);
