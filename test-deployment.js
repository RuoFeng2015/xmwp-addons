#!/usr/bin/env node

/**
 * 内网穿透服务部署测试脚本
 * 全面测试nginx配置、服务连接、域名功能等
 */

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

class DeploymentTester {
  constructor() {
    this.baseUrl = 'http://localhost';
    this.baseDomain = 'wzzhk.club';
    this.serverIp = '110.41.20.134';
    this.ports = {
      tunnel: 3080,
      proxy: 3081,
      admin: 3082
    };
    this.results = {
      tests: [],
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  /**
   * 记录测试结果
   */
  logResult(name, status, message, details = null) {
    const result = {
      name,
      status, // 'pass', 'fail', 'warning'
      message,
      details,
      timestamp: new Date().toISOString()
    };

    this.results.tests.push(result);
    this.results[status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : 'warnings']++;

    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${name}: ${message}`);

    if (details) {
      console.log(`   ${details}`);
    }
  }

  /**
   * HTTP请求封装
   */
  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const module = isHttps ? https : http;

      const req = module.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * 测试服务端口可用性
   */
  async testServicePorts() {
    console.log('\n🔗 测试服务端口可用性...');

    for (const [service, port] of Object.entries(this.ports)) {
      try {
        const response = await this.makeRequest(`${this.baseUrl}:${port}/health`, {
          method: 'GET'
        });

        if (response.statusCode === 200) {
          this.logResult(
            `${service.toUpperCase()}服务端口${port}`,
            'pass',
            '服务正常运行'
          );
        } else {
          this.logResult(
            `${service.toUpperCase()}服务端口${port}`,
            'warning',
            `返回状态码: ${response.statusCode}`
          );
        }
      } catch (error) {
        this.logResult(
          `${service.toUpperCase()}服务端口${port}`,
          'fail',
          '服务无法连接',
          error.message
        );
      }
    }
  }

  /**
   * 测试管理后台API
   */
  async testAdminAPI() {
    console.log('\n🎛️ 测试管理后台API...');

    const adminUrl = `${this.baseUrl}:${this.ports.admin}`;

    // 测试状态接口
    try {
      const response = await this.makeRequest(`${adminUrl}/api/status`);

      if (response.statusCode === 200) {
        this.logResult(
          '管理后台状态API',
          'pass',
          'API正常响应'
        );

        try {
          const data = JSON.parse(response.data);
          this.logResult(
            '管理后台状态数据',
            'pass',
            `活跃连接: ${data.activeConnections || 0}`
          );
        } catch (e) {
          this.logResult(
            '管理后台状态数据',
            'warning',
            '数据格式异常'
          );
        }
      } else {
        this.logResult(
          '管理后台状态API',
          'fail',
          `状态码: ${response.statusCode}`
        );
      }
    } catch (error) {
      this.logResult(
        '管理后台状态API',
        'fail',
        'API无法访问',
        error.message
      );
    }

    // 测试域名管理API
    try {
      const response = await this.makeRequest(`${adminUrl}/api/domains`);

      this.logResult(
        '域名管理API',
        response.statusCode === 200 ? 'pass' : 'warning',
        `状态码: ${response.statusCode}`
      );
    } catch (error) {
      this.logResult(
        '域名管理API',
        'warning',
        '可能需要认证',
        error.message
      );
    }
  }

  /**
   * 测试DNS解析
   */
  async testDNSResolution() {
    console.log('\n🌐 测试DNS解析...');

    // 测试根域名解析
    try {
      const addresses = await dns.resolve4(this.baseDomain);

      if (addresses.includes(this.serverIp)) {
        this.logResult(
          `根域名DNS解析`,
          'pass',
          `正确解析到: ${this.serverIp}`
        );
      } else {
        this.logResult(
          `根域名DNS解析`,
          'warning',
          `解析到: ${addresses.join(', ')}, 期望: ${this.serverIp}`
        );
      }
    } catch (error) {
      this.logResult(
        `根域名DNS解析`,
        'fail',
        'DNS解析失败',
        error.message
      );
    }

    // 测试二级域名解析（如果配置了通配符）
    const testSubdomain = `test001abcd.${this.baseDomain}`;
    try {
      const addresses = await dns.resolve4(testSubdomain);

      if (addresses.includes(this.serverIp)) {
        this.logResult(
          `二级域名DNS解析`,
          'pass',
          `${testSubdomain} 正确解析`
        );
      } else {
        this.logResult(
          `二级域名DNS解析`,
          'warning',
          `解析结果与预期不符`
        );
      }
    } catch (error) {
      this.logResult(
        `二级域名DNS解析`,
        'warning',
        '通配符DNS可能未配置',
        error.message
      );
    }
  }

  /**
   * 测试SSL证书
   */
  async testSSLCertificate() {
    console.log('\n🔒 测试SSL证书...');

    const certPaths = [
      '/www/server/panel/vhost/cert/wzzhk.club/fullchain.pem',
      '/www/server/panel/vhost/cert/wzzhk.club/privkey.pem'
    ];

    for (const certPath of certPaths) {
      try {
        if (fs.existsSync(certPath)) {
          const stats = fs.statSync(certPath);
          const fileName = path.basename(certPath);

          this.logResult(
            `SSL证书文件 ${fileName}`,
            'pass',
            `文件存在，大小: ${stats.size} bytes`
          );

          // 检查证书有效期（如果是证书文件）
          if (fileName.includes('fullchain') || fileName.includes('cert')) {
            try {
              const certContent = fs.readFileSync(certPath, 'utf8');
              if (certContent.includes('BEGIN CERTIFICATE')) {
                this.logResult(
                  `SSL证书格式 ${fileName}`,
                  'pass',
                  '证书格式正确'
                );
              } else {
                this.logResult(
                  `SSL证书格式 ${fileName}`,
                  'warning',
                  '证书格式可能异常'
                );
              }
            } catch (e) {
              this.logResult(
                `SSL证书读取 ${fileName}`,
                'warning',
                '无法读取证书内容'
              );
            }
          }
        } else {
          this.logResult(
            `SSL证书文件 ${path.basename(certPath)}`,
            'fail',
            '证书文件不存在',
            certPath
          );
        }
      } catch (error) {
        this.logResult(
          `SSL证书检查 ${path.basename(certPath)}`,
          'fail',
          '检查失败',
          error.message
        );
      }
    }
  }

  /**
   * 测试Nginx配置
   */
  async testNginxConfig() {
    console.log('\n⚙️ 测试Nginx配置...');

    const nginxConfigPath = path.join(__dirname, 'nginx.conf');

    try {
      if (fs.existsSync(nginxConfigPath)) {
        const config = fs.readFileSync(nginxConfigPath, 'utf8');

        // 检查关键配置项
        const checks = [
          {
            pattern: /server_name\s+~\^\(\?\<subdomain\>/,
            name: '二级域名通配符配置'
          },
          {
            pattern: /proxy_pass\s+http:\/\/127\.0\.0\.1:3081/,
            name: '代理端口配置'
          },
          {
            pattern: /proxy_set_header\s+Upgrade/,
            name: 'WebSocket支持'
          },
          {
            pattern: /ssl_certificate.*wzzhk\.club/,
            name: 'SSL证书配置'
          }
        ];

        let configScore = 0;
        for (const check of checks) {
          if (check.pattern.test(config)) {
            this.logResult(
              check.name,
              'pass',
              '配置正确'
            );
            configScore++;
          } else {
            this.logResult(
              check.name,
              'fail',
              '配置缺失或错误'
            );
          }
        }

        this.logResult(
          'Nginx配置评分',
          configScore === checks.length ? 'pass' : 'warning',
          `${configScore}/${checks.length} 项配置正确`
        );

      } else {
        this.logResult(
          'Nginx配置文件',
          'fail',
          '配置文件不存在'
        );
      }
    } catch (error) {
      this.logResult(
        'Nginx配置检查',
        'fail',
        '配置检查失败',
        error.message
      );
    }
  }

  /**
   * 生成部署报告
   */
  generateReport() {
    console.log('\n📊 部署测试报告');
    console.log('='.repeat(50));
    console.log(`总测试项: ${this.results.tests.length}`);
    console.log(`✅ 通过: ${this.results.passed}`);
    console.log(`❌ 失败: ${this.results.failed}`);
    console.log(`⚠️  警告: ${this.results.warnings}`);

    const successRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
    console.log(`📈 成功率: ${successRate}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ 需要解决的问题:');
      this.results.tests
        .filter(test => test.status === 'fail')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.message}`);
          if (test.details) {
            console.log(`     ${test.details}`);
          }
        });
    }

    if (this.results.warnings > 0) {
      console.log('\n⚠️  需要关注的警告:');
      this.results.tests
        .filter(test => test.status === 'warning')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.message}`);
        });
    }

    console.log('\n🎯 后续建议:');
    console.log('   1. 解决所有失败项');
    console.log('   2. 检查并处理警告项');
    console.log('   3. 运行客户端连接测试');
    console.log('   4. 监控服务运行状态');
    console.log('   5. 配置日志轮转和监控');
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始内网穿透服务部署测试\n');

    await this.testNginxConfig();
    await this.testServicePorts();
    await this.testAdminAPI();
    await this.testDNSResolution();
    await this.testSSLCertificate();

    this.generateReport();

    return {
      success: this.results.failed === 0,
      results: this.results
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const tester = new DeploymentTester();
  tester.runAllTests().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
}

module.exports = DeploymentTester;
