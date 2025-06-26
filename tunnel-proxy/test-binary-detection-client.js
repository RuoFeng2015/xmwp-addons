/**
 * 客户端二进制检测功能测试脚本
 * 测试 tunnel-manager.js 中的二进制检测方法，确保与服务端一致
 */

const TunnelManager = require('./rootfs/opt/tunnel-proxy/lib/tunnel-manager');

/**
 * 测试用例集合
 */
const testCases = [
  // 明确的文本数据
  {
    name: '纯ASCII文本',
    data: Buffer.from('Hello World!', 'utf8'),
    expectedBinary: false
  },
  {
    name: 'UTF-8中文文本',
    data: Buffer.from('你好世界！这是一个测试', 'utf8'),
    expectedBinary: false
  },
  {
    name: 'JSON数据',
    data: Buffer.from('{"type":"auth","message":"hello"}', 'utf8'),
    expectedBinary: false
  },
  {
    name: '包含换行的文本',
    data: Buffer.from('Line 1\nLine 2\r\nLine 3\tTabbed', 'utf8'),
    expectedBinary: false
  },

  // 明确的二进制数据
  {
    name: 'PNG图片头',
    data: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01, 0x02]),
    expectedBinary: true
  },
  {
    name: 'JPEG图片头',
    data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]),
    expectedBinary: true
  },
  {
    name: '包含空字节',
    data: Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00, 0x57, 0x6F, 0x72, 0x6C, 0x64]),
    expectedBinary: true
  },
  {
    name: 'ZIP文件头',
    data: Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]),
    expectedBinary: true
  },

  // 边界情况
  {
    name: '空Buffer',
    data: Buffer.alloc(0),
    expectedBinary: false
  },
  {
    name: '大量控制字符',
    data: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F]),
    expectedBinary: true
  },
  {
    name: '混合数据（主要是文本）',
    data: Buffer.concat([
      Buffer.from('Hello World! '),
      Buffer.from([0x01, 0x02]), // 少量控制字符
      Buffer.from(' More text here')
    ]),
    expectedBinary: false // 控制字符比例不高
  }
];

/**
 * 运行所有测试用例
 */
async function runTests() {
  console.log('🧪 开始客户端二进制检测测试...\n');

  const tunnelManager = new TunnelManager();
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];

    try {
      // 测试同步方法
      const syncResult = tunnelManager.isBinaryWebSocketMessage(testCase.data);

      // 测试异步方法
      const asyncResult = await tunnelManager.isBinaryWebSocketMessageAsync(testCase.data);

      console.log(`📋 测试 ${i + 1}: ${testCase.name}`);
      console.log(`   数据长度: ${testCase.data.length} bytes`);
      console.log(`   期望结果: ${testCase.expectedBinary ? '二进制' : '文本'}`);
      console.log(`   同步检测: ${syncResult ? '二进制' : '文本'} ${syncResult === testCase.expectedBinary ? '✅' : '❌'}`);
      console.log(`   异步检测: ${asyncResult ? '二进制' : '文本'} ${asyncResult === testCase.expectedBinary ? '✅' : '❌'}`);
      console.log(`   同步异步一致性: ${syncResult === asyncResult ? '✅' : '❌'}`);

      if (syncResult === testCase.expectedBinary && asyncResult === testCase.expectedBinary && syncResult === asyncResult) {
        passed++;
        console.log(`   结果: ✅ 通过\n`);
      } else {
        failed++;
        console.log(`   结果: ❌ 失败\n`);
      }

    } catch (error) {
      console.log(`   错误: ${error.message}`);
      console.log(`   结果: ❌ 异常\n`);
      failed++;
    }
  }

  console.log(`\n📊 测试结果汇总:`);
  console.log(`✅ 通过: ${passed}/${testCases.length}`);
  console.log(`❌ 失败: ${failed}/${testCases.length}`);
  console.log(`📈 成功率: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 所有测试通过！客户端二进制检测功能正常。');
  } else {
    console.log('\n⚠️  有测试失败，需要检查代码实现。');
  }

  return failed === 0;
}

/**
 * 比较服务端和客户端的检测结果一致性
 */
async function compareWithServer() {
  console.log('\n🔄 进行服务端与客户端一致性测试...\n');

  // 这里只是示例框架，实际运行时需要服务端代码
  console.log('💡 提示：确保服务端和客户端使用相同的 isbinaryfile 库版本');
  console.log('💡 提示：同步方法是快速启发式检测，异步方法使用专业库检测');
  console.log('💡 提示：对于WebSocket实时数据，优先使用同步方法以保证性能');
}

// 运行测试
if (require.main === module) {
  runTests()
    .then(() => compareWithServer())
    .catch(error => {
      console.error('测试执行失败:', error);
      process.exit(1);
    });
}

module.exports = { runTests, testCases };
