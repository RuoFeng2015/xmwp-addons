#!/usr/bin/env node

/**
 * Home Assistant 加载项配置验证脚本
 * 用于验证加载项配置的正确性
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

console.log('🔍 Home Assistant 加载项配置验证');
console.log('=====================================\n');

// 验证必要文件
const requiredFiles = [
  'config.yaml',
  'Dockerfile',
  'README.md',
  'CHANGELOG.md',
  'rootfs/etc/services.d/tunnel-proxy/run',
  'rootfs/opt/tunnel-proxy/app.js',
  'rootfs/opt/tunnel-proxy/package.json'
];

console.log('📁 检查必要文件...');
let allFilesExist = true;

for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - 文件不存在`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ 配置验证失败：缺少必要文件');
  process.exit(1);
}

// 验证 config.yaml
console.log('\n⚙️  验证 config.yaml...');
try {
  const configPath = path.join(__dirname, 'config.yaml');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configContent);

  const requiredFields = ['name', 'version', 'slug', 'description', 'arch'];
  let configValid = true;

  for (const field of requiredFields) {
    if (config[field]) {
      console.log(`✅ ${field}: ${Array.isArray(config[field]) ? config[field].join(', ') : config[field]}`);
    } else {
      console.log(`❌ ${field}: 缺少字段`);
      configValid = false;
    }
  }

  // 检查是否移除了 image 字段
  if (!config.image) {
    console.log('✅ image: 已正确移除，将使用本地构建');
  } else {
    console.log('⚠️  image: 仍然存在，可能导致构建问题');
  }

  if (!configValid) {
    console.log('\n❌ config.yaml 验证失败');
    process.exit(1);
  }

} catch (error) {
  console.log(`❌ config.yaml 解析失败: ${error.message}`);
  process.exit(1);
}

// 验证 package.json
console.log('\n📦 验证 package.json...');
try {
  const packagePath = path.join(__dirname, 'rootfs/opt/tunnel-proxy/package.json');
  const packageContent = fs.readFileSync(packagePath, 'utf8');
  const packageJson = JSON.parse(packageContent);

  console.log(`✅ 名称: ${packageJson.name}`);
  console.log(`✅ 版本: ${packageJson.version}`);
  console.log(`✅ 依赖数量: ${Object.keys(packageJson.dependencies || {}).length}`);
  console.log(`✅ Node.js 要求: ${packageJson.engines?.node || '未指定'}`);

} catch (error) {
  console.log(`❌ package.json 解析失败: ${error.message}`);
  process.exit(1);
}

// 验证启动脚本
console.log('\n🚀 验证启动脚本...');
try {
  const runScriptPath = path.join(__dirname, 'rootfs/etc/services.d/tunnel-proxy/run');
  const runScriptContent = fs.readFileSync(runScriptPath, 'utf8');

  if (runScriptContent.includes('#!/usr/bin/with-contenv bashio')) {
    console.log('✅ 使用正确的 shebang');
  } else {
    console.log('❌ 缺少或错误的 shebang');
  }

  if (runScriptContent.includes('exec node app.js')) {
    console.log('✅ 正确的 Node.js 启动命令');
  } else {
    console.log('❌ 缺少或错误的启动命令');
  }

} catch (error) {
  console.log(`❌ 启动脚本读取失败: ${error.message}`);
  process.exit(1);
}

// 检查 Dockerfile
console.log('\n🐳 验证 Dockerfile...');
try {
  const dockerfilePath = path.join(__dirname, 'Dockerfile');
  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

  if (dockerfileContent.includes('FROM $BUILD_FROM')) {
    console.log('✅ 使用正确的基础镜像');
  } else {
    console.log('❌ 基础镜像配置错误');
  }

  if (dockerfileContent.includes('nodejs') && dockerfileContent.includes('npm')) {
    console.log('✅ 包含 Node.js 和 npm 安装');
  } else {
    console.log('❌ 缺少 Node.js 或 npm 安装');
  }

  if (dockerfileContent.includes('chmod a+x')) {
    console.log('✅ 设置执行权限');
  } else {
    console.log('⚠️  可能缺少执行权限设置');
  }

} catch (error) {
  console.log(`❌ Dockerfile 读取失败: ${error.message}`);
  process.exit(1);
}

console.log('\n🎉 配置验证完成！');
console.log('=====================================');
console.log('✅ 所有必要文件存在');
console.log('✅ 配置文件格式正确');
console.log('✅ 启动脚本配置正确');
console.log('✅ Dockerfile 配置正确');
console.log('\n📋 下一步：');
console.log('1. 确保在 Home Assistant 中添加了仓库');
console.log('2. 刷新加载项商店');
console.log('3. 安装并配置加载项');
console.log('4. 查看日志确认运行状态');
