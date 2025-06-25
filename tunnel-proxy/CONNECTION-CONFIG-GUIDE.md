# 内网穿透代理 - 连接配置说明

## 新功能：连接方式选择

从版本 1.3.0 开始，支持两种连接方式：

### 1. IP 连接方式 (推荐用于固定IP)
```yaml
connection_type: "ip"
server_host: "114.132.237.146"
server_domain: "tunnel.wzzhk.club"  # 备用域名，可选
```

### 2. 域名连接方式 (推荐用于动态IP)
```yaml
connection_type: "domain"
server_host: "114.132.237.146"      # 备用IP，可选  
server_domain: "tunnel.wzzhk.club"
```

## 配置参数说明

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `connection_type` | 选择 | 连接方式：`ip` 或 `domain` | `"ip"` |
| `server_host` | 字符串 | 服务器IP地址 | `"114.132.237.146"` |
| `server_domain` | 字符串 | 服务器域名 | `"tunnel.wzzhk.club"` |
| `server_port` | 数字 | 服务器端口 | `3080` |
| `local_ha_port` | 数字 | 本地HA端口 | `8123` |
| `username` | 字符串 | 服务器认证用户名 | `"admin"` |
| `password` | 字符串 | 服务器认证密码 | `"password"` |
| `client_id` | 字符串 | 客户端唯一标识 | `"ha-client-001"` |
| `proxy_port` | 数字 | 本地代理端口 | `9001` |
| `log_level` | 选择 | 日志级别：`debug`/`info`/`warn`/`error` | `"info"` |

## 使用场景

### IP 连接方式
- ✅ 服务器有固定公网IP
- ✅ 网络环境稳定
- ✅ 直接连接，延迟更低

### 域名连接方式  
- ✅ 服务器IP可能变化
- ✅ 使用DDNS动态域名
- ✅ 便于记忆和管理
- ✅ 支持负载均衡

## 配置示例

### 完整配置示例
```yaml
# 使用IP连接
connection_type: "ip"
server_host: "114.132.237.146" 
server_domain: "tunnel.wzzhk.club"
server_port: 3080
local_ha_port: 8123
username: "admin"
password: "your-password"
client_id: "ha-client-001"
proxy_port: 9001
log_level: "info"
```

## 故障排查

### 连接失败问题
1. **检查网络连通性**
   ```bash
   # 测试IP连接
   ping 114.132.237.146
   
   # 测试域名解析
   nslookup tunnel.wzzhk.club
   ```

2. **检查端口开放**
   ```bash
   telnet 114.132.237.146 3080
   ```

3. **检查防火墙设置**
   - 确保服务器防火墙开放3080端口
   - 检查云服务商安全组规则

### 日志分析
- 设置 `log_level: "debug"` 获取详细日志
- 查看连接方式信息：`连接方式: IP连接: 114.132.237.146:3080`

## 升级说明

从旧版本升级时，会自动添加默认配置：
- `connection_type` 默认为 `"ip"`
- `server_domain` 使用 `server_host` 的值

## 技术支持

如有问题，请提供以下信息：
1. 配置参数（隐去敏感信息）
2. 完整错误日志
3. 网络环境描述
