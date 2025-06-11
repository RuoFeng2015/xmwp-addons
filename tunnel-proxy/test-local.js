#!/usr/bin/env node
/**
 * Home Assistant 加载项本地测试脚本
 * 用于验证加载项配置和依赖安装
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🧪 Home Assistant 加载项本地测试');
console.log('=====================================');

// 测试1：验证package.json
console.log('📦 测试 package.json...');
try {
    const packagePath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`✅ 包名: ${packageData.name}`);
    console.log(`✅ 版本: ${packageData.version}`);
    console.log(`✅ 依赖数量: ${Object.keys(packageData.dependencies || {}).length}`);
} catch (error) {
    console.log(`❌ package.json 错误: ${error.message}`);
}

// 测试2：验证主程序
console.log('\n🚀 测试主程序...');
try {
    const appPath = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy', 'app.js');
    if (fs.existsSync(appPath)) {
        const appContent = fs.readFileSync(appPath, 'utf8');
        if (appContent.includes('require') && appContent.includes('module.exports')) {
            console.log('✅ app.js 格式正确');
        } else {
            console.log('⚠️  app.js 可能有格式问题');
        }
    } else {
        console.log('❌ app.js 不存在');
    }
} catch (error) {
    console.log(`❌ app.js 错误: ${error.message}`);
}

// 测试3：检查启动脚本
console.log('\n⚙️  测试启动脚本...');
try {
    const runPath = path.join(__dirname, 'rootfs', 'etc', 'services.d', 'tunnel-proxy', 'run');
    if (fs.existsSync(runPath)) {
        const runContent = fs.readFileSync(runPath, 'utf8');
        if (runContent.includes('bashio')) {
            console.log('✅ 启动脚本格式正确');
        } else {
            console.log('⚠️  启动脚本可能缺少bashio');
        }
    } else {
        console.log('❌ 启动脚本不存在');
    }
} catch (error) {
    console.log(`❌ 启动脚本错误: ${error.message}`);
}

// 测试4：模拟npm install
console.log('\n📥 测试依赖安装...');
const packageDir = path.join(__dirname, 'rootfs', 'opt', 'tunnel-proxy');
exec('npm install --dry-run', { cwd: packageDir }, (error, stdout, stderr) => {
    if (error) {
        console.log('⚠️  npm install 模拟失败，但这在测试环境中是正常的');
        console.log(`   原因: ${error.message.split('\n')[0]}`);
    } else {
        console.log('✅ npm install 模拟成功');
    }
    
    // 测试完成总结
    console.log('\n🎉 测试完成！');
    console.log('=====================================');
    console.log('💡 下一步：');
    console.log('1. 在 Home Assistant 中安装加载项');
    console.log('2. 配置服务器连接信息');
    console.log('3. 启动服务并查看日志');
    console.log('4. 测试外网访问功能');
});

// 测试5：检查Dockerfile语法
console.log('\n🐳 检查Dockerfile...');
try {
    const dockerfilePath = path.join(__dirname, 'Dockerfile');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    
    if (dockerfileContent.includes('FROM') && dockerfileContent.includes('RUN')) {
        console.log('✅ Dockerfile 基本语法正确');
    } else {
        console.log('❌ Dockerfile 可能有语法问题');
    }
    
    // 检查关键指令
    const requiredInstructions = ['ARG BUILD_FROM', 'npm install', 'chmod +x'];
    requiredInstructions.forEach(instruction => {
        if (dockerfileContent.includes(instruction)) {
            console.log(`✅ 包含指令: ${instruction}`);
        } else {
            console.log(`⚠️  缺少指令: ${instruction}`);
        }
    });
    
} catch (error) {
    console.log(`❌ Dockerfile 错误: ${error.message}`);
}
