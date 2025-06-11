# 安装和部署指南

## 1. 准备工作

### 1.1 服务器要求
- 一台具有公网IP的服务器
- 支持Node.js运行环境
- 开放3080端口（或你指定的端口）

### 1.2 Home Assistant 要求
- Home Assistant OS 2023及以上版本
- 已安装Add-on Store

## 2. 部署中转服务器

### 2.1 在服务器上创建项目目录
```bash
mkdir tunnel-server
cd tunnel-server
```

### 2.2 初始化项目
```bash
npm init -y
npm install ws express http-proxy-middleware
```

### 2.3 创建服务器代码
参考 `server-example.md` 中的示例代码创建 `server.js` 文件。

### 2.4 启动服务器
```bash
node server.js
```

### 2.5 使用 PM2 保持服务运行（推荐）
```bash
npm install -g pm2
pm2 start server.js --name tunnel-server
pm2 startup
pm2 save
```

## 3. 安装 Home Assistant 加载项

### 3.1 方法一：通过加载项商店
1. 打开 Home Assistant
2. 进入 **Supervisor** > **Add-on Store**
3. 点击右上角菜单，选择 **Repositories**
4. 添加仓库地址: `https://github.com/RuoFeng2015/xmwp-addons`
5. 找到 "内网穿透代理" 加载项并安装

### 3.2 方法二：手动安装
1. 将整个 `tunnel-proxy` 文件夹复制到 `/config/addons/` 目录
2. 重启 Home Assistant
3. 在加载项页面找到 "内网穿透代理"

## 4. 配置加载项

### 4.1 基本配置
在加载项配置页面填入以下信息：

```yaml
server_host: "your-server.com"  # 你的服务器地址
server_port: 3080               # 服务器端口
local_ha_port: 8123            # 本地HA端口
username: "admin"              # 登录用户名
password: "your_secure_password"  # 登录密码
client_id: "ha-home-001"       # 客户端唯一标识
proxy_port: 9001               # 代理服务端口
log_level: "info"              # 日志级别
```

### 4.2 配置说明

| 配置项 | 必填 | 说明 | 默认值 |
|--------|------|------|--------|
| server_host | 是 | 中转服务器地址 | - |
| server_port | 是 | 中转服务器端口 | 3080 |
| local_ha_port | 否 | 本地HA端口 | 8123 |
| username | 是 | 登录用户名 | admin |
| password | 是 | 登录密码 | password |
| client_id | 是 | 客户端标识 | ha-client-001 |
| proxy_port | 否 | 代理服务端口 | 9001 |
| log_level | 否 | 日志级别 | info |

## 5. 启动和使用

### 5.1 启动加载项
1. 保存配置
2. 启动加载项
3. 查看日志确认连接状态

### 5.2 访问管理界面
在浏览器中访问: `http://your-ha-ip:9001`

### 5.3 通过隧道访问 HA
配置完成后，你可以通过中转服务器访问你的 Home Assistant：
`http://your-server.com:3081/your-client-id/`

## 6. 故障排除

### 6.1 连接失败
- 检查服务器地址和端口是否正确
- 确认服务器防火墙已开放相应端口
- 检查网络连接是否正常

### 6.2 认证失败
- 检查用户名密码是否正确
- 确认客户端ID唯一性
- 查看服务器端日志

### 6.3 代理不工作
- 检查本地HA端口配置
- 确认HA服务正常运行
- 查看加载项日志

### 6.4 常见错误代码

| 错误代码 | 说明 | 解决方法 |
|----------|------|----------|
| ECONNREFUSED | 连接被拒绝 | 检查服务器地址和端口 |
| ETIMEDOUT | 连接超时 | 检查网络连接和防火墙 |
| AUTH_FAILED | 认证失败 | 检查用户名密码 |

## 7. 安全建议

### 7.1 密码安全
- 使用强密码
- 定期更换密码
- 不要使用默认密码

### 7.2 网络安全
- 使用HTTPS（如果支持）
- 限制访问IP范围
- 启用访问日志

### 7.3 监控
- 定期检查连接日志
- 监控异常访问
- 设置告警机制

## 8. 更新和维护

### 8.1 更新加载项
1. 在加载项页面点击更新
2. 重新配置（如需要）
3. 重启加载项

### 8.2 更新服务器代码
1. 备份当前配置
2. 更新服务器代码
3. 重启服务器服务

### 8.3 备份配置
定期备份以下文件：
- 加载项配置
- 服务器配置
- 日志文件（如需要）

## 9. 性能优化

### 9.1 服务器优化
- 使用SSD硬盘
- 增加内存配置
- 优化网络带宽

### 9.2 加载项优化
- 调整日志级别
- 优化心跳间隔
- 清理过期连接

## 10. 技术支持

如有问题，请在GitHub仓库提交Issue：
https://github.com/RuoFeng2015/xmwp-addons/issues

提交问题时请包含：
- 详细错误描述
- 加载项日志
- 配置信息（去除敏感信息）
- 环境信息
