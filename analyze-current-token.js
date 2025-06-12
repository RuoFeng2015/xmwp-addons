/**
 * 检查JWT token有效性和HA认证问题
 */

const jwt = require('jsonwebtoken');

// 从日志中提取的token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI3MGI2ZGZkZTgzZmE0NjRjOTk3MmZjMmE3NDI1NTRlMiIsImlhdCI6MTc0OTcyMDIxNiwiZXhwIjoxNzQ5NzIyMDE2fQ.7K4WfZsQ_f38DIVykc2qyGHe9XEdRgo1MdAV9IamqrQ";

console.log('🔍 分析JWT Token有效性...');
console.log('='.repeat(60));

try {
  const decoded = jwt.decode(token);
  console.log('📊 Token信息:');
  console.log(`   发行者(iss): ${decoded.iss}`);
  console.log(`   发行时间(iat): ${new Date(decoded.iat * 1000).toISOString()}`);
  console.log(`   过期时间(exp): ${new Date(decoded.exp * 1000).toISOString()}`);
  console.log(`   当前时间: ${new Date().toISOString()}`);

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now > decoded.exp;

  console.log(`\n⏰ 时间检查:`);
  console.log(`   当前时间戳: ${now}`);
  console.log(`   Token过期时间戳: ${decoded.exp}`);
  console.log(`   是否过期: ${isExpired ? '❌ 是' : '✅ 否'}`);

  if (isExpired) {
    const expiredHours = Math.floor((now - decoded.exp) / 3600);
    const expiredMinutes = Math.floor(((now - decoded.exp) % 3600) / 60);
    console.log(`   过期时长: ${expiredHours}小时${expiredMinutes}分钟`);
  } else {
    const remainingMinutes = Math.floor((decoded.exp - now) / 60);
    console.log(`   剩余时间: ${remainingMinutes}分钟`);
  }

} catch (error) {
  console.log(`❌ Token解析失败: ${error.message}`);
}

console.log('\n🔍 从日志分析的问题:');
console.log('1. HA收到认证消息但没有发送响应');
console.log('2. HA直接关闭了WebSocket连接');
console.log('3. 这通常表示token无效或过期');

console.log('\n💡 解决方案:');
console.log('1. 生成新的长期访问令牌');
console.log('2. 确认token格式正确');
console.log('3. 检查HA的认证配置');
