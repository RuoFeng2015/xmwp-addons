#!/usr/bin/env node

/**
 * 直接测试连接 Home Assistant 实例
 */

const http = require('http');

async function testDirectConnection() {
    console.log('🧪 直接测试 Home Assistant 连接...\n');

    const target = {
        host: '192.168.6.170',
        port: 8123
    };

    console.log(`🔗 测试连接: ${target.host}:${target.port}`);

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const options = {
            hostname: target.host,
            port: target.port,
            path: '/',
            method: 'GET',
            timeout: 5000,
            family: 4,
            headers: {
                'host': `${target.host}:${target.port}`,
                'user-agent': 'HomeAssistant-Discovery-Test/1.0'
            }
        };

        const req = http.request(options, (res) => {
            const responseTime = Date.now() - startTime;
            console.log(`✅ 连接成功!`);
            console.log(`   状态码: ${res.statusCode}`);
            console.log(`   响应时间: ${responseTime}ms`);
            console.log(`   响应头:`, res.headers);

            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                console.log(`   响应体长度: ${body.length} bytes`);
                
                // 检查是否包含 Home Assistant 特征
                const isHA = body.toLowerCase().includes('home assistant') || 
                            body.toLowerCase().includes('hass') ||
                            body.toLowerCase().includes('homeassistant');
                
                console.log(`   是否为 Home Assistant: ${isHA ? '是' : '否'}`);
                
                if (body.length < 500) {
                    console.log(`   响应内容预览: ${body.substring(0, 200)}...`);
                }
                
                resolve(true);
            });
        });

        req.on('error', (error) => {
            console.log(`❌ 连接失败: ${error.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`⏰ 连接超时`);
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// 运行测试
testDirectConnection().catch(console.error);
