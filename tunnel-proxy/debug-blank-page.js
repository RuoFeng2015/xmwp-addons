/**
 * 调试空白页面问题 - 检查响应内容
 */
const http = require('http');

console.log('🔍 调试浏览器空白页面问题');
console.log('=====================================\n');

function makeRequest() {
  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-HK;q=0.8,zh-TW;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1'
    }
  };

  console.log('📤 发送请求...');
  console.log(`   URL: http://${options.hostname}:${options.port}${options.path}`);
  console.log(`   Headers: ${JSON.stringify(options.headers, null, 2)}\n`);

  const req = http.request(options, (res) => {
    console.log('📥 收到响应:');
    console.log(`   状态: ${res.statusCode} ${res.statusMessage}`);
    console.log(`   响应头:`);
    
    Object.entries(res.headers).forEach(([key, value]) => {
      console.log(`     ${key}: ${value}`);
    });

    let rawBody = Buffer.alloc(0);
    let bodyText = '';

    res.on('data', chunk => {
      rawBody = Buffer.concat([rawBody, chunk]);
    });

    res.on('end', () => {
      console.log(`\n📊 响应分析:`);
      console.log(`   原始字节数: ${rawBody.length}`);
      
      // 检查内容编码
      const contentEncoding = res.headers['content-encoding'];
      if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
        console.log(`   内容编码: ${contentEncoding}`);
        
        const zlib = require('zlib');
        try {
          if (contentEncoding === 'gzip') {
            bodyText = zlib.gunzipSync(rawBody).toString();
          } else if (contentEncoding === 'deflate') {
            bodyText = zlib.inflateSync(rawBody).toString();
          }
          console.log(`   解压后字节数: ${bodyText.length}`);
        } catch (error) {
          console.log(`   ❌ 解压失败: ${error.message}`);
          bodyText = rawBody.toString();
        }
      } else {
        bodyText = rawBody.toString();
      }

      console.log(`\n📝 响应体内容:`);
      if (bodyText.length === 0) {
        console.log('   ❌ 响应体为空！这就是空白页面的原因');
      } else if (bodyText.length < 200) {
        console.log(`   内容: ${bodyText}`);
      } else {
        console.log(`   前200字符: ${bodyText.substring(0, 200)}...`);
        
        // 检查是否是HTML
        if (bodyText.toLowerCase().includes('<!doctype html') || 
            bodyText.toLowerCase().includes('<html')) {
          console.log('   ✅ 检测到HTML内容');
          
          // 检查关键HTML元素
          const hasTitle = bodyText.toLowerCase().includes('<title');
          const hasBody = bodyText.toLowerCase().includes('<body');
          const hasHead = bodyText.toLowerCase().includes('<head');
          
          console.log(`   HTML结构检查:`);
          console.log(`     <head>: ${hasHead ? '✅' : '❌'}`);
          console.log(`     <title>: ${hasTitle ? '✅' : '❌'}`);
          console.log(`     <body>: ${hasBody ? '✅' : '❌'}`);
        } else {
          console.log('   ⚠️ 不是HTML内容');
        }
      }

      // 检查可能的问题
      console.log(`\n🔧 诊断结果:`);
      
      if (res.statusCode !== 200) {
        console.log(`   ❌ 状态码错误: ${res.statusCode}`);
      } else {
        console.log(`   ✅ 状态码正常: 200`);
      }
      
      if (bodyText.length === 0) {
        console.log('   ❌ 空响应体导致空白页面');
        console.log('   建议: 检查隧道客户端是否正确返回响应体');
      } else if (bodyText.length < 100) {
        console.log('   ⚠️ 响应体过小，可能不完整');
      } else {
        console.log('   ✅ 响应体大小正常');
      }

      const contentType = res.headers['content-type'];
      if (!contentType || !contentType.includes('text/html')) {
        console.log(`   ⚠️ Content-Type可能有问题: ${contentType || '未设置'}`);
      } else {
        console.log(`   ✅ Content-Type正常: ${contentType}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ 请求失败: ${error.message}`);
  });

  req.end();
}

makeRequest();
