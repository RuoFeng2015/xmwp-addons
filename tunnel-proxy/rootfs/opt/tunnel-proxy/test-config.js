#!/usr/bin/env node

/**
 * 检查配置值
 */

const { getConfig, ConfigManager } = require('./lib/config');

function checkConfig() {
  console.log('🔍 检查配置值...\n');

  try {
    // 初始化配置
    console.log('📤 初始化配置...');
    ConfigManager.loadConfig();

    const config = getConfig();

    console.log('📋 当前配置:');
    console.log(`   local_ha_port: ${config.local_ha_port}`);
    console.log(`   server_host: ${config.server_host}`);
    console.log(`   server_port: ${config.server_port}`);
    console.log(`   username: ${config.username}`);
    console.log(`   client_id: ${config.client_id}`);
    console.log(`   proxy_port: ${config.proxy_port}`);

    if (config.local_ha_port !== 8123) {
      console.log('\n❌ 问题发现:');
      console.log(`   local_ha_port 应该是 8123，但当前是 ${config.local_ha_port}`);
    } else {
      console.log('\n✅ local_ha_port 配置正确');
    }

  } catch (error) {
    console.error('❌ 读取配置出错:', error.message);
  }
}

checkConfig();
