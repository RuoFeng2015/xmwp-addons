/**
 * 测试latin1编码处理压缩响应体
 */
const http = require('http');
const zlib = require('zlib');

console.log('🧪 测试latin1编码处理压缩响应体');
console.log('=====================================\n');

function testCurrentResponse() {
  const options = {
    hostname: '110.41.20.134',
    port: 3081,
    path: '/ha-client-001/',
    method: 'GET',
    headers: {
      'User-Agent': 'Latin1-Test/1.0',
      'Accept': 'text/html'
    }
  };

  console.log('发送测试请求...\n');

  const req = http.request(options, (res) => {
    console.log(`状态: ${res.statusCode} ${res.statusMessage}`);
    console.log(`Content-Encoding: ${res.headers['content-encoding']}`);
    console.log(`Content-Length: ${res.headers['content-length']}\n`);

    let rawBody = Buffer.alloc(0);

    res.on('data', chunk => {
      rawBody = Buffer.concat([rawBody, chunk]);
    });

    res.on('end', () => {
      const bodyText = rawBody.toString();

      console.log('响应体分析:');
      console.log(`  原始Buffer长度: ${rawBody.length} 字节`);
      console.log(`  字符串长度: ${bodyText.length} 字符`);

      // 测试不同的编码方式
      console.log('\n测试不同解码方式:');

      // 方法1: 直接使用原始Buffer（当前服务器返回的）
      console.log('1. 直接使用原始Buffer:');
      try {
        if (res.headers['content-encoding'] === 'deflate') {
          const decompressed1 = zlib.inflateSync(rawBody);
          const html1 = decompressed1.toString();
          console.log(`   解压成功: ${html1.length} 字符`);
          console.log(`   HTML有效: ${html1.toLowerCase().includes('<!doctype html') ? '✅' : '❌'}`);

          if (html1.toLowerCase().includes('<!doctype html')) {
            console.log(`   HTML开头: ${html1.substring(0, 100)}...`);
            console.log('\n🎉 找到解决方案！直接使用原始Buffer即可');
            return;
          }
        }
      } catch (error) {
        console.log(`   失败: ${error.message}`);
      }

      // 方法2: 模拟当前错误的字符串转换 + latin1修复
      console.log('\n2. 模拟字符串损坏后用latin1修复:');
      try {
        // 模拟当前隧道客户端的错误转换
        const damagedString = rawBody.toString(); // 这会损坏二进制数据
        console.log(`   损坏后字符串长度: ${damagedString.length}`);

        // 尝试用latin1恢复
        const recoveredBuffer = Buffer.from(damagedString, 'latin1');
        console.log(`   恢复后Buffer长度: ${recoveredBuffer.length}`);

        if (res.headers['content-encoding'] === 'deflate') {
          const decompressed2 = zlib.inflateSync(recoveredBuffer);
          const html2 = decompressed2.toString();
          console.log(`   解压成功: ${html2.length} 字符`);
          console.log(`   HTML有效: ${html2.toLowerCase().includes('<!doctype html') ? '✅' : '❌'}`);

          if (html2.toLowerCase().includes('<!doctype html')) {
            console.log(`   HTML开头: ${html2.substring(0, 100)}...`);
            console.log('\n🎉 Latin1方法有效！');
          }
        }
      } catch (error) {
        console.log(`   失败: ${error.message}`);
      }

      // 方法3: 测试其他编码
      console.log('\n3. 测试binary编码:');
      try {
        const binaryBuffer = Buffer.from(bodyText, 'binary');
        console.log(`   Binary Buffer长度: ${binaryBuffer.length}`);

        if (res.headers['content-encoding'] === 'deflate') {
          const decompressed3 = zlib.inflateSync(binaryBuffer);
          const html3 = decompressed3.toString();
          console.log(`   解压成功: ${html3.length} 字符`);
          console.log(`   HTML有效: ${html3.toLowerCase().includes('<!doctype html') ? '✅' : '❌'}`);

          if (html3.toLowerCase().includes('<!doctype html')) {
            console.log(`   HTML开头: ${html3.substring(0, 100)}...`);
            console.log('\n🎉 Binary方法有效！');
          }
        }
      } catch (error) {
        console.log(`   失败: ${error.message}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`请求失败: ${error.message}`);
  });

  req.end();
}

testCurrentResponse();
