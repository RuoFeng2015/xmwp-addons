/**
 * JWT Token 解析工具
 * 用于分析隧道代理传输的token内容
 */

function parseJWT(token) {
  try {
    // JWT由三部分组成：header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // 解码header和payload（Base64URL编码）
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    return {
      header,
      payload,
      signature: parts[2]
    };
  } catch (error) {
    console.error('JWT解析失败:', error.message);
    return null;
  }
}

function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString();
}

console.log('🔍 JWT Token 内容分析');
console.log('============================================================');

// 从日志中提取的token
const tokenFromLog = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0MWQwMDA4ZTU0NmQ0YzlkYmY3NGJlNWM2NTljOGQzMyIsImlhdCI6MTc0OTgxMDE4MywiZXhwIjoxNzQ5ODExOTgzfQ.kPxpPoyDaYx1cY7mSEmJksW5x44ouU1XasIK509SsdM";

console.log('📋 分析隧道代理传输的Token:');
console.log(`Token: ${tokenFromLog.substring(0, 50)}...`);

const parsed = parseJWT(tokenFromLog);
if (parsed) {
  console.log('\n📊 Token内容:');
  console.log(`Algorithm: ${parsed.header.alg}`);
  console.log(`Type: ${parsed.header.typ}`);
  console.log(`Issuer: ${parsed.payload.iss}`);
  console.log(`Issued At: ${formatTimestamp(parsed.payload.iat)} (${parsed.payload.iat})`);
  console.log(`Expires: ${formatTimestamp(parsed.payload.exp)} (${parsed.payload.exp})`);
  
  // 检查token是否过期
  const now = Math.floor(Date.now() / 1000);
  const isExpired = parsed.payload.exp < now;
  const timeToExpiry = parsed.payload.exp - now;
  
  console.log(`\n⏰ Token状态检查:`);
  console.log(`当前时间: ${formatTimestamp(now)} (${now})`);
  console.log(`是否过期: ${isExpired ? '❌ 是' : '✅ 否'}`);
  
  if (!isExpired) {
    console.log(`剩余时间: ${Math.floor(timeToExpiry / 60)}分${timeToExpiry % 60}秒`);
  } else {
    console.log(`过期时间: ${Math.floor(-timeToExpiry / 60)}分${-timeToExpiry % 60}秒前`);
  }
  
  // 分析token的生命周期
  const tokenLifetime = parsed.payload.exp - parsed.payload.iat;
  console.log(`Token有效期: ${Math.floor(tokenLifetime / 60)}分钟`);
  
  console.log('\n🎯 分析结论:');
  if (isExpired) {
    console.log('❌ Token已过期，这是认证失败的原因！');
    console.log('💡 解决方案：需要使用更新的token或延长token有效期');
  } else {
    console.log('✅ Token仍然有效');
    console.log('🤔 认证失败可能有其他原因：');
    console.log('   1. Token在传输过程中被修改');
    console.log('   2. HA实例配置问题');
    console.log('   3. 网络时序问题');
  }
}

console.log('\n============================================================');
console.log('📋 建议下一步操作:');
console.log('1. 如果token过期，生成新的长期访问token');
console.log('2. 如果token有效，检查tunnel-proxy的token传输逻辑');
console.log('3. 比较直连和代理传输的token是否完全一致');
