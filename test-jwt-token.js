const jwt = require('jsonwebtoken');

/**
 * 解析JWT token验证是否过期
 */
function parseJWTToken() {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIyMjQ0NGNmZGRmZWY0N2NhYjE4OWI0NjlkNTkyNzk3NCIsImlhdCI6MTc0OTY5ODE2MywiZXhwIjoxNzQ5Njk5OTYzfQ.hcuBjkn0_gjdjakg6EGk57YPbBSJaaWffNpQBsoiSCw";

  try {
    // 解码JWT (不验证签名)
    const decoded = jwt.decode(token);
    console.log('🔍 JWT Token 内容:');
    console.log('  发行者 (iss):', decoded.iss);
    console.log('  发行时间 (iat):', decoded.iat, '→', new Date(decoded.iat * 1000).toISOString());
    console.log('  过期时间 (exp):', decoded.exp, '→', new Date(decoded.exp * 1000).toISOString());

    const now = Math.floor(Date.now() / 1000);
    console.log('  当前时间:', now, '→', new Date(now * 1000).toISOString());

    if (decoded.exp < now) {
      console.log('❌ Token已过期！过期时间:', Math.floor((now - decoded.exp) / 60), '分钟前');
    } else {
      console.log('✅ Token仍然有效，剩余时间:', Math.floor((decoded.exp - now) / 60), '分钟');
    }

  } catch (error) {
    console.error('❌ 解析JWT失败:', error.message);
  }
}

parseJWTToken();
