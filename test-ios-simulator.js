#!/usr/bin/env node

/**
 * 模拟iOS应用的完整认证流程
 * 测试WebSocket认证成功后的HTTP API访问
 */

const http = require('http');
const https = require('https');
const WebSocket = require('ws');

class iOSSimulator {
  constructor() {
    this.baseUrl = 'https://ha-client-001.wzzhk.club';
    this.accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlZmYyMDc1YTQyYzA0NDA5YTI4YmE0ZDVkNGM2MmEyYiIsImlhdCI6MTc1MTE3NTcyNywiZXhwIjoxNzUxMTc3NTI3fQ.hBNQzr9Y1G1GUt08DspiR2TpdCAFkWeSo3Pa_lWcXZM"; // 使用真实的access token
    this.ws = null;
  }

  async testComplete() {
    console.log(`🍎 [iOS模拟器] 开始完整认证测试...`);

    try {
      // 1. 首先测试WebSocket认证
      console.log(`\n=== 步骤1: WebSocket认证测试 ===`);
      await this.testWebSocketAuth();

      // 2. 测试关键HTTP API端点
      console.log(`\n=== 步骤2: HTTP API端点测试 ===`);
      await this.testHttpEndpoints();

    } catch (error) {
      console.log(`❌ [iOS模拟器] 测试失败: ${error.message}`);
    }
  }

  async testWebSocketAuth() {
    return new Promise((resolve, reject) => {
      const wsUrl = 'wss://ha-client-001.wzzhk.club/api/websocket';
      console.log(`🔗 [WebSocket] 连接到: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,  // 忽略SSL证书错误
        headers: {
          'User-Agent': 'Home Assistant/2025.5 (io.robbie.HomeAssistant; build:2025.1264; iOS 16.3.0)',
          'Origin': 'https://ha-client-001.wzzhk.club'
        }
      });

      this.ws.on('open', () => {
        console.log(`✅ [WebSocket] 连接成功`);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`📥 [WebSocket] 收到消息:`, message);

          if (message.type === 'auth_required') {
            console.log(`🔐 [WebSocket] 发送认证消息...`);
            this.ws.send(JSON.stringify({
              type: 'auth',
              access_token: this.accessToken
            }));
          } else if (message.type === 'auth_ok') {
            console.log(`✅ [WebSocket] 认证成功！`);
            this.ws.close();
            resolve();
          } else if (message.type === 'auth_invalid') {
            console.log(`❌ [WebSocket] 认证失败`);
            this.ws.close();
            reject(new Error('WebSocket认证失败'));
          }
        } catch (e) {
          console.log(`📥 [WebSocket] 收到非JSON消息: ${data}`);
        }
      });

      this.ws.on('error', (error) => {
        console.log(`❌ [WebSocket] 连接错误: ${error.message}`);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`🔌 [WebSocket] 连接关闭`);
      });

      setTimeout(() => {
        reject(new Error('WebSocket连接超时'));
      }, 10000);
    });
  }

  async testHttpEndpoints() {
    // 这些是iOS应用通常会访问的关键端点
    const endpoints = [
      '/api/config',           // 获取HA配置信息
      '/api/',                 // API根端点
      '/api/states',           // 获取状态信息
      '/manifest.json',        // Web应用清单
      '/auth/login',           // 登录端点
      '/auth/providers',       // 认证提供者
    ];

    for (const endpoint of endpoints) {
      await this.testHttpRequest(endpoint);
      await this.sleep(500); // 等待500ms避免过快请求
    }
  }

  async testHttpRequest(endpoint) {
    return new Promise((resolve) => {
      const url = `${this.baseUrl}${endpoint}`;
      console.log(`🌐 [HTTP] 测试端点: ${endpoint}`);

      const options = {
        method: 'GET',
        headers: {
          'User-Agent': 'Home Assistant/2025.5 (io.robbie.HomeAssistant; build:2025.1264; iOS 16.3.0)',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        timeout: 5000,
        rejectUnauthorized: false  // 忽略SSL证书错误
      };

      const req = https.request(url, options, (res) => {
        console.log(`📡 [HTTP] ${endpoint} -> ${res.statusCode} ${res.statusMessage}`);
        console.log(`📡 [HTTP] 响应头:`, Object.keys(res.headers));

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (data.length > 0) {
            console.log(`📡 [HTTP] 响应长度: ${data.length} 字节`);
            if (data.length < 200) {
              console.log(`📡 [HTTP] 响应内容: ${data}`);
            }
          }
          resolve();
        });
      });

      req.on('error', (error) => {
        console.log(`❌ [HTTP] ${endpoint} 请求失败: ${error.message}`);
        resolve();
      });

      req.on('timeout', () => {
        console.log(`⏰ [HTTP] ${endpoint} 请求超时`);
        req.destroy();
        resolve();
      });

      req.end();
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 运行测试
const simulator = new iOSSimulator();
simulator.testComplete().finally(() => {
  console.log(`\n🏁 [iOS模拟器] 测试完成`);
  process.exit(0);
});
