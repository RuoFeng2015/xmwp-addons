# WebSocket连接问题排查指南

## 🔍 问题现象

用户报告通过隧道代理访问Home Assistant时，WebSocket连接会"过早关闭"，导致浏览器显示连接错误。

## 🎯 问题根本原因

**这不是bug，而是Home Assistant的正常安全机制。**

当WebSocket认证失败时，Home Assistant会：
1. ✅ 建立WebSocket连接
2. ✅ 发送 `auth_required` 消息
3. ✅ 接收客户端的认证消息
4. ❌ 验证访问令牌失败
5. ✅ 发送 `auth_invalid` 消息
6. 🔴 **立即关闭连接**（安全机制）

## 🔧 解决方案

### 方案1: 生成有效的访问令牌

1. 登录Home Assistant Web界面
2. 点击左下角的用户名 → "个人资料"
3. 向下滚动到"长期访问令牌"部分
4. 点击"创建令牌"
5. 输入令牌名称（如"隧道代理访问"）
6. 复制生成的令牌
7. 在浏览器中重新连接时使用此令牌

### 方案2: 确保浏览器正确认证

- 如果您通过浏览器访问HA，确保已正确登录
- 清除浏览器缓存和Cookie，重新登录
- 检查浏览器是否保存了正确的认证信息

## 📊 验证方法

### 检查日志

在tunnel-proxy日志中查找以下信息：

```
✅ WebSocket连接建立成功: 192.168.6.170:8123
🔐 HA要求WebSocket认证: upgrade-xxx
❌ WebSocket认证失败: upgrade-xxx - 请检查浏览器中的访问令牌是否有效
💡 提示：需要在HA中生成长期访问令牌，并在浏览器中正确配置
🔴 WebSocket连接关闭: 192.168.6.170, 代码: 1000, 原因: 无
```

### 使用测试脚本

运行以下命令测试直接连接：

```bash
node debug-auth-behavior.js
```

## 🚀 技术细节

### WebSocket认证流程

```
浏览器 <-> tunnel-proxy <-> Home Assistant

1. 浏览器请求WebSocket升级
2. tunnel-proxy建立到HA的WebSocket连接
3. HA发送: {"type":"auth_required","ha_version":"xxx"}
4. 浏览器发送: {"type":"auth","access_token":"xxx"}
5. tunnel-proxy转发认证消息到HA
6. HA验证令牌:
   - 有效: {"type":"auth_ok"} + 连接保持
   - 无效: {"type":"auth_invalid"} + 立即关闭连接
```

### 日志分析

- **连接建立**: `WebSocket连接建立成功`
- **认证要求**: `HA要求WebSocket认证`
- **认证失败**: `WebSocket认证失败`
- **连接关闭**: `WebSocket连接关闭: 代码: 1000`

关闭代码含义：
- `1000`: 正常关闭（通常是认证失败后的安全关闭）
- `1006`: 异常关闭（网络问题）

## 📝 开发者说明

此问题已通过以下方式解决：

1. **增强日志**: 添加了详细的WebSocket认证状态日志
2. **用户提示**: 在认证失败时提供明确的解决建议
3. **关闭原因分析**: 解释不同关闭代码的含义

## ✅ 验证修复

1. 启动tunnel-server和tunnel-proxy
2. 使用无效令牌连接，确认收到认证失败提示
3. 使用有效令牌连接，确认连接保持稳定
4. 检查日志输出是否清晰明了

---

**结论**: WebSocket"过早关闭"是Home Assistant的正常安全行为，用户需要配置有效的访问令牌即可解决。
