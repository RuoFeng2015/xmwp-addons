# Home Assistant 内网穿透代理加载项

基于自建中转服务器的 Home Assistant 内网穿透解决方案，支持 HTTP 和 WebSocket 代理。

## 功能特性

- ✅ 支持 HTTP 代理访问
- ✅ 支持 WebSocket 代理（实时通信）
- ✅ 用户名密码身份验证
- ✅ 支持多用户并发（最多10个用户）
- ✅ 自建中转服务器支持
- ✅ 安全的代理隧道
- ✅ 实时连接状态监控

## 配置说明

### 基本配置

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `server_host` | string | 是 | - | 中转服务器地址 |
| `server_port` | int | 是 | 3080 | 中转服务器端口 |
| `local_ha_port` | int | 是 | 8123 | 本地 HA 端口 |
| `username` | string | 是 | admin | 登录用户名 |
| `password` | string | 是 | password | 登录密码 |
| `client_id` | string | 是 | ha-client-001 | 客户端唯一标识 |
| `proxy_port` | int | 否 | 9001 | 代理服务端口 |
| `log_level` | string | 否 | info | 日志级别 |

### 配置示例

```yaml
server_host: "tunnel.example.com"
server_port: 3080
local_ha_port: 8123
username: "admin"
password: "your_secure_password"
client_id: "ha-home-001"
proxy_port: 9001
log_level: "info"
```

## 🔧 安装故障排除

如果在安装过程中遇到网络问题（如 `ghcr.io` 访问被拒绝），请查看详细的故障排除指南：

**[📖 安装故障排除指南](INSTALLATION-TROUBLESHOOTING.md)**

常见问题：
- GitHub Container Registry 访问受限
- 网络连接超时
- 镜像下载失败
- 架构不匹配

## 使用方法

1. 在加载项商店中安装此加载项
2. 配置中转服务器信息和认证信息
3. 启动加载项
4. 通过中转服务器访问你的 Home Assistant

## 安全建议

- 使用强密码
- 定期更换密码
- 确保中转服务器的安全性
- 监控访问日志

## 故障排除

### 常见问题

1. **连接失败**
   - 检查服务器地址和端口是否正确
   - 确认网络连接正常
   - 查看日志了解详细错误信息

2. **认证失败**
   - 检查用户名密码是否正确
   - 确认客户端ID唯一性

3. **代理不工作**
   - 检查本地 HA 端口配置
   - 确认 HA 服务正常运行

## 更新日志

### v1.0.0
- 初始版本发布
- 支持基本的 HTTP/WebSocket 代理功能
- 用户名密码认证
- 多用户支持

## 技术支持

如有问题，请在 GitHub 仓库中提交 Issue：
https://github.com/RuoFeng2015/xmwp-addons/issues
