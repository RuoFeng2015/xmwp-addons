const jwt = require('jsonwebtoken');

// 生产环境的令牌
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI2MjkwNDRmZjlkODg0Mzc2YjE5NTk1ZDAzNDM4Y2E1NCIsImlhdCI6MTc0OTc3ODYyMCwiZXhwIjoxNzQ5NzgwNDIwfQ.us-mXzCeYcv4NcEoE-Jc5I_NAk3WFP3qr4KE6uiHEHo";

console.log('🔍 分析生产环境访问令牌');
console.log('=' .repeat(60));

try {
    // 解码JWT令牌（不验证签名）
    const decoded = jwt.decode(token, { complete: true });
    
    if (decoded) {
        console.log('\n📋 JWT头部:');
        console.log(JSON.stringify(decoded.header, null, 2));
        
        console.log('\n📋 JWT载荷:');
        console.log(JSON.stringify(decoded.payload, null, 2));
        
        console.log('\n📅 时间信息:');
        const iat = decoded.payload.iat;
        const exp = decoded.payload.exp;
        const now = Math.floor(Date.now() / 1000);
        
        console.log(`签发时间 (iat): ${iat} = ${new Date(iat * 1000).toLocaleString()}`);
        console.log(`过期时间 (exp): ${exp} = ${new Date(exp * 1000).toLocaleString()}`);
        console.log(`当前时间 (now): ${now} = ${new Date(now * 1000).toLocaleString()}`);
        
        const remainingTime = exp - now;
        console.log(`\n⏰ 令牌状态:`);
        if (remainingTime > 0) {
            console.log(`✅ 令牌仍然有效，剩余时间: ${remainingTime}秒 (${Math.round(remainingTime/60)}分钟)`);
        } else {
            console.log(`❌ 令牌已过期，过期时间: ${Math.abs(remainingTime)}秒前 (${Math.round(Math.abs(remainingTime)/60)}分钟前)`);
        }
        
        const validDuration = exp - iat;
        console.log(`📏 令牌有效期: ${validDuration}秒 (${Math.round(validDuration/60)}分钟)`);
        
        console.log(`\n🔑 令牌发行者 (iss): ${decoded.payload.iss}`);
        
        // 检查这是否是一个短期令牌
        if (validDuration <= 3600) { // 1小时或更短
            console.log('\n⚠️  这看起来是一个短期访问令牌！');
            console.log('💡 建议使用长期访问令牌 (Long-lived Access Token)');
        } else {
            console.log('\n✅ 这是一个长期访问令牌');
        }
        
    } else {
        console.log('❌ 无法解码JWT令牌');
    }
    
} catch (error) {
    console.error('❌ 解码令牌时发生错误:', error.message);
}

console.log('\n' + '='.repeat(60));
console.log('📖 解决方案:');
console.log('1. 在Home Assistant中创建新的长期访问令牌');
console.log('2. 访问: http://你的HA地址:8123/profile');
console.log('3. 滚动到页面底部的"长期访问令牌"部分');
console.log('4. 点击"创建令牌"按钮');
console.log('5. 输入令牌名称（例如："隧道代理"）');
console.log('6. 复制生成的新令牌');
console.log('7. 在浏览器中替换旧的访问令牌');
console.log('=' .repeat(60));
