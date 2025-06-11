# 🚀 Home Assistant 内网穿透代理 - 完整安装指南

## 📋 版本信息
- **当前版本**: 1.0.4
- **修复**: Docker构建问题
- **状态**: 生产就绪

## 🛠️ 安装步骤

### 步骤1：添加加载项仓库
1. 进入 Home Assistant
2. 前往 **设置 → 加载项、备份和督导程序 → 加载项商店**
3. 点击右上角 **⋮** 菜单
4. 选择 **仓库**
5. 添加仓库URL：`https://github.com/RuoFeng2015/xmwp-addons`

### 步骤2：安装加载项
1. 刷新加载项商店页面
2. 在 **本地加载项** 部分找到 **内网穿透代理**
3. 点击进入加载项详情页面
4. 点击 **安装** 按钮
5. 等待安装完成（可能需要5-10分钟）

### 步骤3：配置加载项
```yaml
server_host: "tunnel.yourdomain.com"  # 您的中转服务器地址
server_port: 3080                     # 中转服务器端口
local_ha_port: 8123                   # 本地HA端口
username: "admin"                     # 用户名
password: "your_secure_password"      # 安全密码
client_id: "ha-home-001"              # 客户端标识
proxy_port: 9001                      # 本地代理端口
log_level: "info"                     # 日志级别
```

### 步骤4：启动服务
1. 配置完成后，点击 **启动**
2. 等待服务启动（约30秒）
3. 检查 **日志** 标签页确认运行状态

## ⚡ 常见问题解决

### 问题1：Docker构建失败
如果遇到之前的构建错误，请按以下顺序尝试：

1. **清理Docker缓存**（SSH到HA）：
   ```bash
   docker system prune -f
   ha supervisor restart
   ```

2. **重启督导程序**：
   ```bash
   ha supervisor reload
   ```

3. **重新安装**：
   - 删除加载项
   - 等待2分钟
   - 重新安装

### 问题2：网络连接问题
1. 检查中转服务器是否运行
2. 确认防火墙设置
3. 验证域名解析

### 问题3：启动失败
1. 检查配置参数是否正确
2. 查看详细日志信息
3. 确认端口没有被占用

## 🔍 验证安装

### 检查服务状态
1. 在加载项页面查看 **状态** 是否为 **正在运行**
2. 检查 **日志** 是否有错误信息
3. 访问 `http://your-ha-ip:9001` 测试代理服务

### 检查网络连接
```bash
# SSH到Home Assistant
curl -v http://localhost:9001/health
```

### 检查中转服务器连接
查看日志中是否有类似信息：
```
✅ 已连接到中转服务器: tunnel.yourdomain.com:3080
✅ 代理服务启动在端口 9001
```

## 📊 性能监控

### 实时监控
- **CPU使用率**: 正常 < 5%
- **内存使用**: 正常 < 100MB
- **网络延迟**: 正常 < 100ms

### 日志级别说明
- **debug**: 详细调试信息
- **info**: 一般信息（推荐）
- **warn**: 警告信息
- **error**: 仅错误信息

## 🎯 使用场景

### 外网访问Home Assistant
1. 配置好代理后，通过以下地址访问：
   - `http://your-server.com:3081/your-client-id/`
   - 替换为您的实际服务器地址和客户端ID

### WebSocket连接
- Home Assistant App可以正常连接
- 实时数据推送正常工作
- 语音助手集成正常

### API调用
- REST API调用通过代理正常工作
- Webhook接收正常
- 第三方集成正常

## 🔧 故障排除资源

- **[详细故障排除指南](INSTALLATION-TROUBLESHOOTING.md)**
- **[配置文档](DOCS.md)**
- **[更新日志](CHANGELOG.md)**

## 📞 获取支持

如果遇到问题：
1. 查看日志获取错误信息
2. 参考故障排除文档
3. 在GitHub Issues中提交问题

---

## ✅ 验收清单

安装完成后，请确认：
- [ ] 加载项状态显示"正在运行"
- [ ] 日志中没有ERROR级别的错误
- [ ] 能够通过代理地址访问HA
- [ ] WebSocket连接正常
- [ ] 移动端App可以连接

**祝您使用愉快！** 🎉
