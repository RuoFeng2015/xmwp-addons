# 🔑 Home Assistant WebSocket连接最终解决方案

## 📋 问题总结
**WebSocket连接"过早关闭"不是技术故障，而是Home Assistant的正常安全机制。**

当浏览器使用无效或缺失的访问令牌时，HA会：
1. ✅ 建立WebSocket连接
2. ✅ 发送 `auth_required` 消息  
3. ✅ 接收浏览器的认证消息
4. ❌ 验证访问令牌失败
5. ✅ 发送 `auth_invalid` 消息
6. 🔴 **立即关闭连接**（安全机制）

## 🎯 解决步骤

### 步骤1: 生成新的访问令牌

1. **打开Home Assistant Web界面**：
   ```
   http://192.168.6.170:8123
   ```

2. **登录您的账户**

3. **进入用户配置**：
   - 点击左下角的用户头像
   - 选择 "配置" 或 "Profile"

4. **创建长期访问令牌**：
   - 向下滚动找到 "长期访问令牌" 部分
   - 点击 "创建令牌"
   - 输入令牌名称（例如："隧道代理访问"）
   - 点击 "确定" 或 "Create"

5. **复制令牌**：
   - **重要**：立即复制生成的令牌（这是唯一显示的机会）
   - 令牌格式类似：`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 步骤2: 配置浏览器使用新令牌

**根据您的应用架构，有两种配置方式：**

#### 方式A: 如果应用需要配置文件
在 `options.json` 中添加：
```json
{
  "server_host": "43.131.243.82",
  "server_port": 3080,
  "local_ha_port": 8123,
  "username": "admin",
  "password": "password",
  "client_id": "ha-client-001",
  "proxy_port": 19001,
  "log_level": "debug",
  "access_token": "您刚生成的完整令牌"
}
```

#### 方式B: 如果是浏览器自动认证
确保：
1. 浏览器已正确登录Home Assistant
2. 清除浏览器缓存和Cookie
3. 重新登录Home Assistant
4. 然后通过隧道代理访问

## ✅ 验证修复

使用以下测试验证修复效果：

<function_calls>
<invoke name="run_in_terminal">
<parameter name="command">cd /d E:\HA\xmwp-addons && node -e "
const WebSocket = require('ws');

console.log('🔍 验证WebSocket认证修复...');

const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');

ws.on('open', () => {
  console.log('✅ WebSocket连接成功');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log(`📥 收到: ${message.type}`);
  
  if (message.type === 'auth_required') {
    console.log('🔐 发送认证令牌...');
    const authMessage = {
      type: 'auth',
      access_token: process.argv[1] || 'test_token'
    };
    ws.send(JSON.stringify(authMessage));
  } else if (message.type === 'auth_ok') {
    console.log('✅ 认证成功！WebSocket连接已修复！');
    ws.close();
  } else if (message.type === 'auth_invalid') {
    console.log('❌ 认证失败：请检查令牌是否正确');
    ws.close();
  }
});

ws.on('close', (code) => {
  console.log(`🔴 连接关闭: ${code}`);
});

setTimeout(() => ws.close(), 10000);
" "YOUR_NEW_TOKEN_HERE"
