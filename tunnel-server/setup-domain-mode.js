#!/usr/bin/env node

/**
 * 域名模式快速配置脚本
 * 帮助用户快速配置和启动域名模式的内网穿透服务
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class DomainModeSetup {
  constructor() {
    this.envPath = path.join(__dirname, '.env');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 运行配置向导
   */
  async run() {
    console.log('🚀 内网穿透服务域名模式配置向导');
    console.log('=====================================\n');

    try {
      const config = await this.collectConfiguration();
      await this.writeConfiguration(config);
      await this.validateConfiguration();
      this.showCompletionMessage();
    } catch (error) {
      console.error('❌ 配置失败:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  /**
   * 收集配置信息
   */
  async collectConfiguration() {
    console.log('请提供以下配置信息:\n');

    const config = {};

    // 基础域名
    config.BASE_DOMAIN = await this.ask('基础域名 (如: wzzhk.club): ');
    if (!config.BASE_DOMAIN) {
      throw new Error('基础域名不能为空');
    }

    // 服务器IP
    config.SERVER_IP = await this.ask('服务器公网IP地址: ');
    if (!config.SERVER_IP) {
      throw new Error('服务器IP不能为空');
    }

    // 腾讯云API配置
    console.log('\n腾讯云DNS API配置:');
    config.TENCENT_SECRET_ID = await this.ask('腾讯云SecretId: ');
    config.TENCENT_SECRET_KEY = await this.ask('腾讯云SecretKey: ');

    if (!config.TENCENT_SECRET_ID || !config.TENCENT_SECRET_KEY) {
      throw new Error('腾讯云API密钥不能为空');
    }

    // 可选配置
    console.log('\n可选配置 (直接回车使用默认值):');

    config.MAX_CLIENTS = await this.ask('最大客户端数 [546]: ') || '546';
    config.ADMIN_USERNAME = await this.ask('管理员用户名 [admin]: ') || 'admin';
    config.ADMIN_PASSWORD = await this.ask('管理员密码 [请设置强密码]: ') || this.generateRandomPassword();
    config.JWT_SECRET = await this.ask('JWT密钥 [自动生成]: ') || this.generateRandomSecret();

    return config;
  }

  /**
   * 写入配置文件
   */
  async writeConfiguration(config) {
    console.log('\n📝 正在写入配置文件...');

    const envContent = `# 内网穿透服务配置 - 域名模式
# 由配置向导自动生成于 ${new Date().toISOString()}

# ===========================================
# 基础服务配置
# ===========================================

TUNNEL_PORT=3080
PROXY_PORT=3081
ADMIN_PORT=3082
MAX_CLIENTS=${config.MAX_CLIENTS}
LOG_LEVEL=info

# ===========================================
# 管理后台配置
# ===========================================

ADMIN_USERNAME=${config.ADMIN_USERNAME}
ADMIN_PASSWORD=${config.ADMIN_PASSWORD}
JWT_SECRET=${config.JWT_SECRET}

# ===========================================
# 域名模式配置
# ===========================================

DOMAIN_MODE=true
BASE_DOMAIN=${config.BASE_DOMAIN}
SERVER_IP=${config.SERVER_IP}

# ===========================================
# 腾讯云DNS配置
# ===========================================

TENCENT_SECRET_ID=${config.TENCENT_SECRET_ID}
TENCENT_SECRET_KEY=${config.TENCENT_SECRET_KEY}
TENCENT_REGION=ap-guangzhou

# ===========================================
# SSL配置 (可选)
# ===========================================

SSL_ENABLED=false
# SSL_KEY_PATH=/path/to/private.key
# SSL_CERT_PATH=/path/to/certificate.crt
`;

    fs.writeFileSync(this.envPath, envContent);
    console.log('✅ 配置文件已生成: .env');
  }

  /**
   * 验证配置
   */
  async validateConfiguration() {
    console.log('\n🔍 验证配置...');

    try {
      // 重新加载环境变量
      require('dotenv').config({ path: this.envPath });

      // 验证腾讯云API连接
      await this.testTencentCloudAPI();

      console.log('✅ 配置验证通过');
    } catch (error) {
      console.log('⚠️ 配置验证失败:', error.message);
      console.log('请检查配置并手动修正');
    }
  }

  /**
   * 测试腾讯云API连接
   */
  async testTencentCloudAPI() {
    const TencentCloudDNS = require('./src/utils/tencent-dns');
    const dns = new TencentCloudDNS();

    try {
      const result = await dns.listRecords();
      if (result.success) {
        console.log('✅ 腾讯云DNS API连接成功');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`腾讯云API测试失败: ${error.message}`);
    }
  }

  /**
   * 显示完成消息
   */
  showCompletionMessage() {
    console.log('\n🎉 域名模式配置完成！\n');

    console.log('下一步操作:');
    console.log('1. 启动服务: npm start');
    console.log('2. 测试域名模式: node test-domain-mode.js');
    console.log('3. 查看管理后台: http://localhost:3082');
    console.log(`4. 管理员登录: ${process.env.ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD}\n`);

    console.log('域名分配示例:');
    console.log(`客户端: ha-client-001`);
    console.log(`分配域名: ha001abcd.${process.env.BASE_DOMAIN}`);
    console.log(`访问地址: https://ha001abcd.${process.env.BASE_DOMAIN}\n`);

    console.log('重要提醒:');
    console.log('1. 确保域名已在腾讯云进行DNS解析');
    console.log('2. 防火墙开放相应端口 (3080, 3081, 3082)');
    console.log('3. 建议生产环境启用SSL证书');
    console.log('4. 定期备份配置文件');
  }

  /**
   * 询问用户输入
   */
  async ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 生成随机密码
   */
  generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * 生成随机JWT密钥
   */
  generateRandomSecret() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}

// 检查是否直接运行
if (require.main === module) {
  const setup = new DomainModeSetup();
  setup.run().catch(error => {
    console.error('配置失败:', error.message);
    process.exit(1);
  });
}

module.exports = DomainModeSetup;
