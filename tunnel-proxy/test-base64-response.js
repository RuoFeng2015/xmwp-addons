/**
 * 测试base64响应体处理
 */
const http = require('http');
const zlib = require('zlib');

console.log('🧪 测试base64响应体处理');
console.log('=====================================\n');

// 创建一个测试HTML内容
const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>Hello World</h1>
    <p>This is a test page to verify base64 encoding/decoding.</p>
</body>
</html>`;

console.log('1. 原始HTML内容:');
console.log(testHtml);
console.log(`   长度: ${testHtml.length} 字符\n`);

// 压缩内容
const compressed = zlib.deflateSync(testHtml);
console.log('2. Deflate压缩后:');
console.log(`   长度: ${compressed.length} 字节`);
console.log(`   前20字节: ${compressed.slice(0, 20).toString('hex')}\n`);

// 转换为base64
const base64 = compressed.toString('base64');
console.log('3. Base64编码:');
console.log(`   长度: ${base64.length} 字符`);
console.log(`   前50字符: ${base64.substring(0, 50)}...\n`);

// 模拟隧道传输过程
console.log('4. 模拟隧道传输:');
console.log('   客户端 -> 服务器 (base64编码)');

// 服务器端解码
try {
    const decodedBuffer = Buffer.from(base64, 'base64');
    console.log(`   解码后长度: ${decodedBuffer.length} 字节`);
    
    // 解压
    const decompressed = zlib.inflateSync(decodedBuffer);
    const finalHtml = decompressed.toString();
    
    console.log('5. 最终结果:');
    console.log(`   解压后长度: ${finalHtml.length} 字符`);
    console.log(`   内容匹配: ${finalHtml === testHtml ? '✅' : '❌'}`);
    
    if (finalHtml === testHtml) {
        console.log('\n🎉 Base64处理测试成功！');
        console.log('现在测试是否能在实际HTTP请求中工作...\n');
        
        // 创建一个简单的HTTP服务器来测试
        const server = http.createServer((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Encoding': 'deflate',
                'Content-Length': compressed.length
            });
            res.end(compressed);
        });
        
        server.listen(0, () => {
            const port = server.address().port;
            console.log(`测试服务器启动在端口 ${port}`);
            
            // 测试请求
            const options = {
                hostname: 'localhost',
                port: port,
                path: '/',
                method: 'GET'
            };
            
            const testReq = http.request(options, (testRes) => {
                let responseBody = Buffer.alloc(0);
                
                testRes.on('data', chunk => {
                    responseBody = Buffer.concat([responseBody, chunk]);
                });
                
                testRes.on('end', () => {
                    console.log(`收到响应: ${testRes.statusCode}`);
                    console.log(`响应长度: ${responseBody.length} 字节`);
                    
                    // 模拟客户端处理
                    const base64Response = responseBody.toString('base64');
                    console.log(`Base64编码长度: ${base64Response.length} 字符`);
                    
                    // 模拟服务器处理
                    const decodedResponse = Buffer.from(base64Response, 'base64');
                    const finalDecompressed = zlib.inflateSync(decodedResponse);
                    const finalText = finalDecompressed.toString();
                    
                    console.log(`最终解压结果匹配: ${finalText === testHtml ? '✅' : '❌'}`);
                    
                    server.close();
                    
                    if (finalText === testHtml) {
                        console.log('\n✅ HTTP测试成功！Base64处理方案可行');
                    } else {
                        console.log('\n❌ HTTP测试失败');
                    }
                });
            });
            
            testReq.end();
        });
        
    } else {
        console.log('\n❌ Base64处理测试失败');
    }
    
} catch (error) {
    console.error(`解码失败: ${error.message}`);
}
