const http = require('http');

// 测试正确的代理端口访问
async function testCorrectProxy() {
    console.log('🔍 测试正确的代理端口访问...\n');

    const testUrl = 'http://localhost:3081/ha-client-001';
    console.log(`测试URL: ${testUrl}`);
    console.log('说明: 使用3081端口（HTTP代理），不是3080端口（TCP隧道）\n');

    try {
        const options = {
            hostname: 'localhost',
            port: 3081,
            path: '/ha-client-001',
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'TunnelProxy-Test/1.0.5',
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
                    console.log('🎉 成功: 收到正常响应!');
                    if (body.includes('Home Assistant') || body.includes('homeassistant')) {
                        console.log('🏠 确认: 这是Home Assistant的响应');
                    }
                } else if (res.statusCode === 502) {
                    console.log('⚠️  状态: 等待客户端连接 (502 Bad Gateway是正常的)');
                    console.log('💡 说明: 请确保Home Assistant插件已启动并连接到服务器');
                } else if (res.statusCode === 504) {
                    console.log('❌ 超时: 代理请求超时');
                } else {
                    console.log(`⚠️  状态码: ${res.statusCode}`);
                }
                
                if (body && body.length < 500) {
                    console.log('\n📝 响应内容预览:');
                    console.log(body);
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ 请求失败: ${error.message}`);
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

// 运行测试
testCorrectProxy();
