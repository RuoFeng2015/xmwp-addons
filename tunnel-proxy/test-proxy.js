const http = require('http');

// 测试代理功能的脚本
async function testProxy() {
    console.log('🔍 测试内网穿透代理功能...\n');

    // 测试配置
    const serverHost = '110.41.20.134';
    const proxyPort = 3081;
    const clientId = 'ha-client-001';
    
    const testUrl = `http://${serverHost}:${proxyPort}/${clientId}`;
    
    console.log(`测试目标: ${testUrl}`);
    console.log('期望结果: 能够访问到Home Assistant界面\n');

    try {
        // 创建HTTP请求
        const options = {
            hostname: serverHost,
            port: proxyPort,
            path: `/${clientId}`,
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'TunnelProxy-Test/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        };

        const startTime = Date.now();
        
        const req = http.request(options, (res) => {
            const responseTime = Date.now() - startTime;
            
            console.log(`✅ 响应状态: ${res.statusCode}`);
            console.log(`⏱️  响应时间: ${responseTime}ms`);
            console.log(`📋 响应头:`);
            Object.entries(res.headers).forEach(([key, value]) => {
                console.log(`   ${key}: ${value}`);
            });

            let body = '';
            res.on('data', chunk => {
                body += chunk.toString();
            });

            res.on('end', () => {
                console.log(`\n📄 响应内容长度: ${body.length} 字节`);
                
                if (res.statusCode === 200) {
                    if (body.includes('Home Assistant') || body.includes('homeassistant')) {
                        console.log('🎉 测试成功: 成功访问到Home Assistant!');
                    } else {
                        console.log('⚠️  响应正常但内容不是Home Assistant');
                        console.log('前100字符:', body.substring(0, 100));
                    }
                } else if (res.statusCode === 504) {
                    console.log('❌ 测试失败: 网关超时 (客户端可能未响应)');
                } else {
                    console.log(`⚠️  意外状态码: ${res.statusCode}`);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ 请求失败: ${error.message}`);
            
            if (error.code === 'ECONNREFUSED') {
                console.log('💡 建议: 检查服务器是否运行在指定端口');
            } else if (error.code === 'ENOTFOUND') {
                console.log('💡 建议: 检查服务器地址是否正确');
            } else if (error.code === 'ETIMEDOUT') {
                console.log('💡 建议: 检查网络连接或增加超时时间');
            }
        });

        req.on('timeout', () => {
            console.log('❌ 请求超时');
            req.destroy();
        });

        req.end();

    } catch (error) {
        console.log(`❌ 测试异常: ${error.message}`);
    }
}

// 主函数
async function main() {
    console.log('📡 内网穿透代理测试工具 v1.0.5\n');
    
    await testProxy();
    
    console.log('\n📝 测试说明:');
    console.log('- 如果看到"测试成功"，说明代理功能正常工作');
    console.log('- 如果看到"网关超时"，说明客户端可能未正确处理请求');
    console.log('- 请确保Home Assistant插件已启动并连接到服务器');
    console.log('- 检查服务器端日志了解详细信息');
}

if (require.main === module) {
    main();
}
