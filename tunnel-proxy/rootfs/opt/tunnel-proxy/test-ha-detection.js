#!/usr/bin/env node

/**
 * 快速测试各个主机的 HA 检测逻辑
 */

const http = require('http');

async function testHADetection() {
    console.log('🧪 测试各主机的 HA 检测逻辑...\n');

    const hostsToTest = [
        '172.30.32.1:8123',
        '192.168.6.170:8123',
        'homeassistant.local:8123'
    ];

    for (const hostPort of hostsToTest) {
        const [host, port] = hostPort.split(':');
        console.log(`🔍 测试 ${hostPort}...`);
        
        try {
            const response = await makeHttpRequest(host, parseInt(port));
            console.log(`   状态码: ${response.statusCode}`);
            console.log(`   Content-Type: ${response.headers['content-type'] || '未知'}`);
            console.log(`   Server: ${response.headers.server || '未知'}`);
            
            // 检查响应内容的前500字符
            const preview = (response.body || '').substring(0, 500);
            console.log(`   内容预览: ${preview.replace(/\s+/g, ' ').trim()}`);
            
            // 检查是否包含 HA 特征
            const content = (response.body || '').toLowerCase();
            const hasHA = content.includes('home assistant') || 
                         content.includes('homeassistant') ||
                         content.includes('hass-frontend') ||
                         content.includes('home-assistant-main');
            
            console.log(`   包含HA特征: ${hasHA ? '是' : '否'}`);
            console.log('');
            
        } catch (error) {
            console.log(`   错误: ${error.message}`);
            console.log('');
        }
    }
}

function makeHttpRequest(host, port) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: '/',
            method: 'GET',
            timeout: 5000,
            headers: {
                'User-Agent': 'HA-Test/1.0'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk.toString();
                if (data.length > 5120) { // 限制到5KB
                    req.destroy();
                }
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.end();
    });
}

testHADetection().catch(console.error);
