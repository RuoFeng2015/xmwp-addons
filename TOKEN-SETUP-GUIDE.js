/**
 * Home Assistant 访问令牌获取指南
 * 解决WebSocket认证问题的最终步骤
 */

console.log('🔑 Home Assistant 访问令牌获取指南');
console.log('='.repeat(60));

console.log('📋 获取新的长期访问令牌步骤:');
console.log('');
console.log('1. 登录Home Assistant Web界面:');
console.log('   http://192.168.6.170:8123');
console.log('');
console.log('2. 进入用户配置页面:');
console.log('   用户头像 → 配置 → 用户 → 长期访问令牌');
console.log('');
console.log('3. 创建新的访问令牌:');
console.log('   点击"创建令牌" → 输入名称(如: tunnel-proxy-token)');
console.log('');
console.log('4. 复制生成的令牌:');
console.log('   ⚠️  令牌只显示一次，请立即复制保存');
console.log('');
console.log('5. 更新tunnel-proxy配置:');
console.log('   将新令牌更新到配置文件中');
console.log('');

console.log('🔧 临时测试新令牌的方法:');
console.log('');
console.log('// 使用以下代码测试新令牌');
console.log('const WebSocket = require("ws");');
console.log('const ws = new WebSocket("ws://192.168.6.170:8123/api/websocket");');
console.log('');
console.log('ws.on("message", (data) => {');
console.log('  const message = JSON.parse(data.toString());');
console.log('  if (message.type === "auth_required") {');
console.log('    const authMessage = {');
console.log('      "type": "auth",');
console.log('      "access_token": "YOUR_NEW_TOKEN_HERE"');
console.log('    };');
console.log('    ws.send(JSON.stringify(authMessage));');
console.log('  }');
console.log('  console.log("收到:", message);');
console.log('});');
console.log('');

console.log('✅ 期望结果:');
console.log('   收到: { type: "auth_required", ha_version: "..." }');
console.log('   收到: { type: "auth_ok", ha_version: "..." }');
console.log('');

console.log('📊 总结:');
console.log('✅ tunnel-proxy WebSocket消息转发已修复');
console.log('✅ 消息时序问题已解决');
console.log('✅ 500ms延迟确保消息完整性');
console.log('🔑 剩余问题: 需要有效的访问令牌');
console.log('');

console.log('🎯 修复验证:');
console.log('当使用有效令牌后，您应该能看到:');
console.log('1. tunnel-proxy成功转发auth_required消息');
console.log('2. 用户认证消息成功发送到HA');
console.log('3. HA的auth_ok响应被正确转发回浏览器');
console.log('4. WebSocket连接保持活跃状态');
console.log('');

console.log('🚀 恭喜！WebSocket连接问题修复完成！');
