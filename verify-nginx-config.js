#!/usr/bin/env node

/**
 * Nginx配置验证脚本
 * 验证nginx.conf中的二级域名配置是否正确
 */

const fs = require('fs');
const path = require('path');

class NginxConfigVerifier {
  constructor() {
    this.nginxConfigPath = path.join(__dirname, 'nginx.conf');
    this.tunnelServerPath = path.join(__dirname, 'tunnel-server');
    this.results = {
      checks: [],
      warnings: [],
      errors: [],
      success: true
    };
  }

  /**
   * 添加检查结果
   */
  addResult(type, message, details = null) {
    const result = {
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    };

    this.results[type + 's'].push(result);

    if (type === 'error') {
      this.results.success = false;
    }

    console.log(`${this.getIcon(type)} ${message}`);
    if (details) {
      console.log(`   ${details}`);
    }
  }

  getIcon(type) {
    switch (type) {
      case 'check': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  }

  /**
   * 验证nginx.conf文件存在
   */
  verifyNginxConfigExists() {
    if (!fs.existsSync(this.nginxConfigPath)) {
      this.addResult('error', 'Nginx配置文件不存在', `路径: ${this.nginxConfigPath}`);
      return false;
    }

    this.addResult('check', 'Nginx配置文件存在', this.nginxConfigPath);
    return true;
  }

  /**
   * 验证nginx配置内容
   */
  verifyNginxConfig() {
    try {
      const config = fs.readFileSync(this.nginxConfigPath, 'utf8');

      // 检查二级域名配置
      const checks = [
        {
          pattern: /server_name\s+~\^\(\?\<subdomain\>\[\^\.\]\+\)\\\.wzzhk\\\.club\$/,
          name: '二级域名通配符匹配',
          required: true
        },
        {
          pattern: /proxy_pass\s+http:\/\/127\.0\.0\.1:3081/,
          name: '隧道代理端口配置',
          required: true
        },
        {
          pattern: /proxy_set_header\s+Upgrade\s+\$http_upgrade/,
          name: 'WebSocket支持配置',
          required: true
        },
        {
          pattern: /proxy_set_header\s+Connection\s+"upgrade"/,
          name: 'WebSocket连接升级',
          required: true
        },
        {
          pattern: /ssl_certificate\s+.*wzzhk\.club/,
          name: 'SSL证书路径配置',
          required: false
        },
        {
          pattern: /location\s+\/api\/websocket/,
          name: 'Home Assistant WebSocket特殊处理',
          required: true
        },
        {
          pattern: /server_name\s+wzzhk\.club/,
          name: '根域名独立配置',
          required: true
        },
        {
          pattern: /proxy_pass\s+http:\/\/127\.0\.0\.1:3082/,
          name: '管理后台代理配置',
          required: false
        }
      ];

      checks.forEach(check => {
        if (check.pattern.test(config)) {
          this.addResult('check', `${check.name} - 已配置`);
        } else {
          const type = check.required ? 'error' : 'warning';
          this.addResult(type, `${check.name} - ${check.required ? '缺失' : '未配置'}`);
        }
      });

      // 检查端口配置一致性
      this.verifyPortConsistency(config);

    } catch (error) {
      this.addResult('error', '读取nginx配置文件失败', error.message);
    }
  }

  /**
   * 验证端口配置一致性
   */
  verifyPortConsistency(nginxConfig) {
    const envExamplePath = path.join(this.tunnelServerPath, '.env.example');

    if (!fs.existsSync(envExamplePath)) {
      this.addResult('warning', '未找到.env.example文件，无法验证端口一致性');
      return;
    }

    try {
      const envContent = fs.readFileSync(envExamplePath, 'utf8');

      // 提取端口配置
      const tunnelPortMatch = envContent.match(/TUNNEL_PORT=(\d+)/);
      const proxyPortMatch = envContent.match(/PROXY_PORT=(\d+)/);
      const adminPortMatch = envContent.match(/ADMIN_PORT=(\d+)/);

      const envPorts = {
        tunnel: tunnelPortMatch ? tunnelPortMatch[1] : null,
        proxy: proxyPortMatch ? proxyPortMatch[1] : null,
        admin: adminPortMatch ? adminPortMatch[1] : null
      };

      // 检查nginx中的端口配置
      const nginxProxyMatch = nginxConfig.match(/proxy_pass\s+http:\/\/127\.0\.0\.1:(\d+)/g);

      if (nginxProxyMatch) {
        const nginxPorts = nginxProxyMatch.map(match => {
          const portMatch = match.match(/:(\d+)/);
          return portMatch ? portMatch[1] : null;
        }).filter(Boolean);

        // 验证代理端口
        if (envPorts.proxy && nginxPorts.includes(envPorts.proxy)) {
          this.addResult('check', `代理端口 ${envPorts.proxy} 配置一致`);
        } else {
          this.addResult('error',
            `代理端口配置不一致`,
            `env: ${envPorts.proxy}, nginx: ${nginxPorts.join(', ')}`
          );
        }

        // 验证管理端口
        if (envPorts.admin && nginxPorts.includes(envPorts.admin)) {
          this.addResult('check', `管理端口 ${envPorts.admin} 配置一致`);
        } else if (envPorts.admin) {
          this.addResult('warning',
            `管理端口 ${envPorts.admin} 在nginx中未配置代理`
          );
        }
      }

    } catch (error) {
      this.addResult('warning', '端口一致性验证失败', error.message);
    }
  }

  /**
   * 验证域名配置
   */
  verifyDomainConfig() {
    const envExamplePath = path.join(this.tunnelServerPath, '.env.example');

    try {
      const envContent = fs.readFileSync(envExamplePath, 'utf8');
      const nginxConfig = fs.readFileSync(this.nginxConfigPath, 'utf8');

      // 检查域名配置
      const baseDomainMatch = envContent.match(/BASE_DOMAIN=(.+)/);
      const baseDomain = baseDomainMatch ? baseDomainMatch[1].trim() : null;

      if (baseDomain) {
        const domainPattern = new RegExp(baseDomain.replace('.', '\\.'), 'g');
        if (domainPattern.test(nginxConfig)) {
          this.addResult('check', `域名 ${baseDomain} 在nginx中已配置`);
        } else {
          this.addResult('error', `域名 ${baseDomain} 在nginx中未找到`);
        }
      } else {
        this.addResult('warning', '未找到BASE_DOMAIN配置');
      }

      // 检查域名模式是否启用
      const domainModeMatch = envContent.match(/DOMAIN_MODE=(.+)/);
      const domainMode = domainModeMatch ? domainModeMatch[1].trim() : 'false';

      if (domainMode === 'true') {
        this.addResult('check', '域名模式已启用');
      } else {
        this.addResult('warning', '域名模式未启用');
      }

    } catch (error) {
      this.addResult('warning', '域名配置验证失败', error.message);
    }
  }

  /**
   * 验证SSL证书路径
   */
  verifySSLConfig() {
    const nginxConfig = fs.readFileSync(this.nginxConfigPath, 'utf8');

    // 提取SSL证书路径
    const certMatches = nginxConfig.match(/ssl_certificate\s+([^;]+);/g);
    const keyMatches = nginxConfig.match(/ssl_certificate_key\s+([^;]+);/g);

    if (certMatches && keyMatches) {
      const certPaths = certMatches.map(match =>
        match.replace(/ssl_certificate\s+/, '').replace(';', '').trim()
      );
      const keyPaths = keyMatches.map(match =>
        match.replace(/ssl_certificate_key\s+/, '').replace(';', '').trim()
      );

      this.addResult('check', `SSL证书配置已找到`);
      this.addResult('warning',
        'SSL证书路径需要手动验证存在性',
        `证书: ${certPaths.join(', ')}\n密钥: ${keyPaths.join(', ')}`
      );
    } else {
      this.addResult('warning', '未找到SSL证书配置');
    }
  }

  /**
   * 生成配置建议
   */
  generateRecommendations() {
    console.log('\n📋 配置建议:');

    const recommendations = [
      '1. 确保SSL证书文件存在并有效',
      '2. 验证腾讯云DNS API密钥配置正确',
      '3. 检查服务器防火墙允许80、443、3080-3082端口',
      '4. 确保域名DNS解析指向服务器IP',
      '5. 测试nginx配置: sudo nginx -t',
      '6. 重载nginx配置: sudo nginx -s reload',
      '7. 运行域名模式测试: node test-domain-mode.js'
    ];

    recommendations.forEach(rec => {
      console.log(`   ${rec}`);
    });
  }

  /**
   * 运行所有验证
   */
  async run() {
    console.log('🔍 开始验证Nginx配置...\n');

    if (!this.verifyNginxConfigExists()) {
      return this.results;
    }

    this.verifyNginxConfig();
    this.verifyPortConsistency();
    this.verifyDomainConfig();
    this.verifySSLConfig();

    console.log('\n📊 验证结果汇总:');
    console.log(`   ✅ 通过检查: ${this.results.checks.length}`);
    console.log(`   ⚠️  警告: ${this.results.warnings.length}`);
    console.log(`   ❌ 错误: ${this.results.errors.length}`);
    console.log(`   🎯 总体状态: ${this.results.success ? '成功' : '需要修复'}`);

    if (this.results.warnings.length > 0 || this.results.errors.length > 0) {
      this.generateRecommendations();
    }

    return this.results;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const verifier = new NginxConfigVerifier();
  verifier.run().then(results => {
    process.exit(results.success ? 0 : 1);
  });
}

module.exports = NginxConfigVerifier;
