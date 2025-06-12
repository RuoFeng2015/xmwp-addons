/**
 * 手动解析JWT token并检查有效性
 */

// 从日志中提取的token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI3MGI2ZGZkZTgzZmE0NjRjOTk3MmZjMmE3NDI1NTRlMiIsImlhdCI6MTc0OTcyMDIxNiwiZXhwIjoxNzQ5NzIyMDE2fQ.7K4WfZsQ_f38DIVykc2qyGHe9XEdRgo1MdAV9IamqrQ";

console.log('🔍 手动分析JWT Token...');
console.log('='.repeat(60));

try {
  // JWT token由三部分组成，用.分隔
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.log('❌ Token格式错误：不是有效的JWT格式');
    process.exit(1);
  }

  // 解码payload部分（第二部分）
  const payload = parts[1];
  // 添加padding如果需要
  const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
  const decodedPayload = Buffer.from(paddedPayload, 'base64').toString('utf8');

  console.log('📊 Token payload:');
  console.log(decodedPayload);

  const decoded = JSON.parse(decodedPayload);

  console.log('\n📅 Token详细信息:');
  console.log(`   发行者(iss): ${decoded.iss}`);
  console.log(`   发行时间(iat): ${new Date(decoded.iat * 1000).toISOString()}`);
  console.log(`   过期时间(exp): ${new Date(decoded.exp * 1000).toISOString()}`);
  console.log(`   当前时间: ${new Date().toISOString()}`);

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now > decoded.exp;

  console.log(`\n⏰ 时间分析:`);
  console.log(`   当前时间戳: ${now}`);
  console.log(`   Token过期时间戳: ${decoded.exp}`);
  console.log(`   时间差: ${now - decoded.exp} 秒`);
  console.log(`   是否过期: ${isExpired ? '❌ 是' : '✅ 否'}`);

  if (isExpired) {
    const expiredSeconds = now - decoded.exp;
    const expiredHours = Math.floor(expiredSeconds / 3600);
    const expiredMinutes = Math.floor((expiredSeconds % 3600) / 60);
    console.log(`   过期时长: ${expiredHours}小时${expiredMinutes}分钟`);
    console.log('\n❌ Token已过期！这就是HA拒绝连接的原因！');
  } else {
    const remainingSeconds = decoded.exp - now;
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    console.log(`   剩余时间: ${remainingMinutes}分钟`);
    console.log('\n✅ Token仍然有效');
  }

} catch (error) {
  console.log(`❌ Token解析失败: ${error.message}`);
}

console.log('\n🔍 问题根因分析:');
console.log('基于日志时序分析:');
console.log('1. tunnel-proxy成功连接到HA ✅');
console.log('2. HA发送auth_required消息 ✅');
console.log('3. 浏览器发送认证消息 ✅');
console.log('4. HA收到认证消息但立即关闭连接 ❌');
console.log('5. 这表明token被HA认为无效');

console.log('\n💡 立即解决方案:');
console.log('1. 登录HA Web界面: http://192.168.6.170:8123');
console.log('2. 进入 配置 → 用户 → 长期访问令牌');
console.log('3. 创建新的长期访问令牌');
console.log('4. 更新应用配置中的token');

console.log('\n🎯 验证方法:');
console.log('使用新token重新测试WebSocket连接，应该能看到:');
console.log('- auth_required消息');
console.log('- auth_ok响应（而不是立即关闭）');
console.log('- WebSocket连接保持活跃');
