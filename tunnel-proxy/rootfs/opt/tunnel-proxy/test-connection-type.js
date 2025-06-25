#!/usr/bin/env node

/**
 * 连接方式测试工具
 * 测试IP和域名两种连接方式
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config-dev.json');

// 配置模板
const ipConfig = {
  "connection_type": "ip",
  "server_host": "114.132.237.146",
  "server_domain": "tunnel.wzzhk.club",
  "server_port": 3080,
  "local_ha_port": 8123,
  "username": "admin",
  "password": "password",
  "client_id": "ha-client-001",
  "proxy_port": 19001,
  "log_level": "debug"
};

const domainConfig = {
  "connection_type": "domain",
  "server_host": "114.132.237.146",
  "server_domain": "tunnel.wzzhk.club",
  "server_port": 3080,
  "local_ha_port": 8123,
  "username": "admin",
  "password": "password",
  "client_id": "ha-client-001",
  "proxy_port": 19001,
  "log_level": "debug"
};

// 获取命令行参数
const connectionType = process.argv[2];

if (!connectionType || !['ip', 'domain'].includes(connectionType)) {
  console.log('🔧 连接方式配置工具');
  console.log('用法: node test-connection-type.js [ip|domain]');
  console.log('');
  console.log('示例:');
  console.log('  node test-connection-type.js ip     # 使用IP连接');
  console.log('  node test-connection-type.js domain # 使用域名连接');
  process.exit(1);
}

// 选择配置
const config = connectionType === 'ip' ? ipConfig : domainConfig;

// 写入配置文件
try {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ 配置已更新为${connectionType === 'ip' ? 'IP' : '域名'}连接方式`);
  console.log(`   服务器地址: ${connectionType === 'ip' ? config.server_host : config.server_domain}:${config.server_port}`);
  console.log(`   配置文件: ${configPath}`);
  console.log('');
  console.log('现在可以启动客户端进行测试：');
  console.log('  node start.js');
} catch (error) {
  console.error('❌ 配置更新失败:', error.message);
  process.exit(1);
}
