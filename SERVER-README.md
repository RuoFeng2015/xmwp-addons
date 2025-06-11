# 内网穿透中转服务器 - 完整部署指南

基于 Node.js + Koa 框架的生产级内网穿透中转服务器实现。

## 🚀 功能特性

### 核心功能
- ✅ **多客户端支持**: 支持多个Home Assistant实例同时连接
- ✅ **HTTP/WebSocket代理**: 完整的Web应用代理支持
- ✅ **身份验证**: 基于用户名密码的客户端认证
- ✅ **路由管理**: 支持subdomain和路径路由
- ✅ **实时监控**: 完整的连接状态和流量统计
- ✅ **管理后台**: Web界面管理客户端连接

### 安全特性
- 🔒 **JWT认证**: 安全的管理后台访问控制
- 🔒 **SSL/TLS支持**: 可选的HTTPS加密传输
- 🔒 **连接限制**: 可配置的最大客户端连接数
- 🔒 **超时管理**: 自动清理非活跃连接

### 生产特性
- ⚡ **高性能**: 基于Node.js异步I/O
- 📊 **详细日志**: 分级日志记录和监控
- 🔄 **自动重连**: 客户端断线自动重连机制
- 💾 **内存管理**: 自动清理过期请求和连接

## 📋 系统要求

### 服务器要求
- **操作系统**: Linux (推荐 Ubuntu 20.04+), CentOS 7+, Windows Server
- **Node.js**: 18.0+ (推荐 LTS 版本)
- **内存**: 最少 512MB (推荐 1GB+)
- **网络**: 公网IP地址，开放指定端口
- **存储**: 100MB+ 可用空间

### 网络端口
- **8080**: 隧道连接端口 (TCP)
- **8081**: HTTP代理端口 (TCP)
- **8082**: 管理后台端口 (TCP)

## 🛠️ 安装部署

### 1. 准备服务器环境

```bash
# 更新系统 (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# 或者 (CentOS/RHEL)
sudo yum update -y

# 安装 Node.js (推荐使用 NodeSource 仓库)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 下载和配置服务端

```bash
# 创建项目目录
mkdir -p /opt/tunnel-server
cd /opt/tunnel-server

# 下载服务端文件
wget https://raw.githubusercontent.com/RuoFeng2015/xmwp-addons/main/tunnel-server.js
wget https://raw.githubusercontent.com/RuoFeng2015/xmwp-addons/main/server-package.json
wget https://raw.githubusercontent.com/RuoFeng2015/xmwp-addons/main/ecosystem.config.js

# 重命名配置文件
mv server-package.json package.json

# 安装依赖
npm install --production
```

### 3. 环境配置

```bash
# 复制环境配置模板
cp .env.example .env

# 编辑配置文件
nano .env
```

**重要配置项说明:**

```bash
# 修改管理员密码 (必须)
ADMIN_PASSWORD=your-super-secure-password

# 修改JWT密钥 (必须)
JWT_SECRET=your-random-jwt-secret-key-min-32-chars

# 调整端口 (如需要)
TUNNEL_PORT=8080
PROXY_PORT=8081
ADMIN_PORT=8082

# 设置最大客户端数
MAX_CLIENTS=10
```

### 4. 防火墙配置

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 8080/tcp
sudo ufw allow 8081/tcp
sudo ufw allow 8082/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=8081/tcp
sudo firewall-cmd --permanent --add-port=8082/tcp
sudo firewall-cmd --reload
```

### 5. 启动服务

#### 方式1: 直接启动 (测试用)
```bash
# 前台运行
node tunnel-server.js

# 后台运行
nohup node tunnel-server.js > tunnel-server.log 2>&1 &
```

#### 方式2: 使用 PM2 (推荐生产环境)
```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs tunnel-server
```

#### 方式3: 系统服务 (systemd)
```bash
# 创建服务文件
sudo nano /etc/systemd/system/tunnel-server.service
```

```ini
[Unit]
Description=Tunnel Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tunnel-server
ExecStart=/usr/bin/node tunnel-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# 启用和启动服务
sudo systemctl daemon-reload
sudo systemctl enable tunnel-server
sudo systemctl start tunnel-server

# 查看状态
sudo systemctl status tunnel-server
```

## 🔧 配置说明

### 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TUNNEL_PORT` | 8080 | 隧道连接端口 |
| `PROXY_PORT` | 8081 | HTTP代理端口 |
| `ADMIN_PORT` | 8082 | 管理后台端口 |
| `JWT_SECRET` | - | JWT签名密钥 (必须设置) |
| `ADMIN_USERNAME` | admin | 管理员用户名 |
| `ADMIN_PASSWORD` | - | 管理员密码 (必须设置) |
| `MAX_CLIENTS` | 10 | 最大客户端连接数 |
| `SSL_ENABLED` | false | 是否启用SSL |
| `SSL_KEY_PATH` | - | SSL私钥文件路径 |
| `SSL_CERT_PATH` | - | SSL证书文件路径 |
| `LOG_LEVEL` | info | 日志级别 |

### SSL/HTTPS 配置

如需启用HTTPS，请准备SSL证书文件：

```bash
# 设置环境变量
SSL_ENABLED=true
SSL_KEY_PATH=/path/to/your/private.key
SSL_CERT_PATH=/path/to/your/certificate.crt
```

**获取免费SSL证书 (Let's Encrypt):**

```bash
# 安装 Certbot
sudo apt install certbot

# 获取证书 (需要域名)
sudo certbot certonly --standalone -d your-domain.com

# 证书路径通常在
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
```

## 🖥️ 管理后台使用

### 1. 访问管理后台

在浏览器中访问: `http://your-server-ip:8082`

### 2. 登录

- **用户名**: `admin` (或你配置的用户名)
- **密码**: 你在配置文件中设置的密码

### 3. 功能介绍

#### 服务器状态
- 服务器运行时间
- 内存使用情况
- 连接统计信息

#### 客户端管理
- 查看所有连接的客户端
- 查看客户端详细信息
- 断开指定客户端连接

#### 路由管理
- 查看路由映射
- 管理subdomain路由

### 4. API接口

#### 认证接口
```bash
# 登录获取Token
curl -X POST http://your-server:8082/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

#### 状态查询
```bash
# 获取服务器状态
curl -X GET http://your-server:8082/api/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取健康检查
curl -X GET http://your-server:8082/api/health
```

## 🏠 Home Assistant 配置

### 1. 安装加载项

参考主项目的加载项安装说明。

### 2. 配置加载项

```yaml
server_host: "your-server.com"     # 你的服务器地址
server_port: 8080                  # 隧道连接端口
local_ha_port: 8123               # 本地HA端口
username: "admin"                 # 认证用户名
password: "password"              # 认证密码
client_id: "ha-home-001"          # 客户端唯一标识
proxy_port: 9001                  # 本地代理端口
log_level: "info"                 # 日志级别
```

### 3. 启动加载项

保存配置后启动加载项，查看日志确认连接状态。

### 4. 访问Home Assistant

连接成功后，可通过以下方式访问：

- **直接访问**: `http://your-server.com:8081`
- **subdomain路由** (如果配置): `http://ha-home-001.your-domain.com:8081`
- **路径路由**: `http://your-server.com:8081/ha-home-001/`

## 🔍 监控和日志

### 查看日志

```bash
# PM2 日志
pm2 logs tunnel-server

# 系统服务日志
sudo journalctl -u tunnel-server -f

# 直接运行的日志
tail -f tunnel-server.log
```

### 性能监控

```bash
# PM2 监控
pm2 monit

# 系统资源
htop
iostat -x 1
```

### 日志级别

- **error**: 错误信息
- **warn**: 警告信息  
- **info**: 一般信息
- **debug**: 调试信息

## 🚨 故障排除

### 常见问题

#### 1. 端口被占用
```bash
# 检查端口占用
netstat -tlnp | grep :8080
lsof -i :8080

# 杀死占用进程
sudo kill -9 PID
```

#### 2. 防火墙问题
```bash
# 检查防火墙状态
sudo ufw status
sudo firewall-cmd --list-all

# 临时关闭防火墙测试
sudo ufw disable
sudo systemctl stop firewalld
```

#### 3. 连接失败
- 检查服务器网络连接
- 确认端口开放
- 查看服务端日志
- 验证客户端配置

#### 4. 认证失败
- 检查用户名密码
- 确认客户端ID唯一性
- 查看服务端认证日志

### 调试模式

```bash
# 启用调试日志
export LOG_LEVEL=debug
pm2 restart tunnel-server
```

## 🔐 安全建议

### 1. 基础安全
- **更改默认密码**: 使用强密码
- **定期更新**: 保持依赖包更新
- **限制访问**: 使用防火墙限制访问IP
- **监控日志**: 定期检查访问日志

### 2. 网络安全
- **使用HTTPS**: 在生产环境启用SSL
- **反向代理**: 使用Nginx作为反向代理
- **访问控制**: 实施IP白名单
- **限速保护**: 防止DDoS攻击

### 3. 系统安全
- **用户权限**: 使用非root用户运行
- **文件权限**: 限制配置文件权限
- **备份策略**: 定期备份配置和日志
- **更新策略**: 制定安全更新计划

### Nginx 反向代理示例

```nginx
# /etc/nginx/sites-available/tunnel-server
server {
    listen 80;
    server_name your-domain.com;
    
    # 代理服务
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # 管理后台
    location /admin/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 📈 性能优化

### 1. 系统优化
```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# TCP优化
echo "net.core.somaxconn = 65536" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65536" >> /etc/sysctl.conf
sysctl -p
```

### 2. Node.js优化
```bash
# 增加内存限制
node --max-old-space-size=1024 tunnel-server.js

# 启用HTTP/2 (需要SSL)
export NODE_OPTIONS="--enable-http2"
```

### 3. 负载均衡

对于高并发场景，可以部署多个服务实例：

```bash
# PM2 集群模式
pm2 start tunnel-server.js -i max
```

## 📊 监控告警

### 1. 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:8082/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "Service is healthy"
    exit 0
else
    echo "Service is unhealthy"
    exit 1
fi
```

### 2. 监控脚本

```bash
#!/bin/bash
# monitor.sh

# 检查进程
if ! pgrep -f "tunnel-server.js" > /dev/null; then
    echo "Tunnel server is not running"
    # 重启服务
    pm2 restart tunnel-server
fi

# 检查端口
if ! netstat -tlnp | grep :8080 > /dev/null; then
    echo "Port 8080 is not listening"
fi
```

## 🚀 升级指南

### 1. 备份配置
```bash
# 备份当前配置
cp .env .env.backup
cp ecosystem.config.js ecosystem.config.js.backup
```

### 2. 更新代码
```bash
# 下载新版本
wget https://raw.githubusercontent.com/RuoFeng2015/xmwp-addons/main/tunnel-server.js -O tunnel-server.js.new

# 备份旧版本
mv tunnel-server.js tunnel-server.js.old
mv tunnel-server.js.new tunnel-server.js
```

### 3. 重启服务
```bash
# PM2 重启
pm2 restart tunnel-server

# 或系统服务重启
sudo systemctl restart tunnel-server
```

## 📞 技术支持

### 获取帮助
- **GitHub Issues**: https://github.com/RuoFeng2015/xmwp-addons/issues
- **文档**: 查看项目README和相关文档
- **日志分析**: 提供详细的错误日志

### 问题报告
提交问题时请包含：
- 服务器操作系统和版本
- Node.js版本
- 完整的错误日志
- 配置信息（去除敏感信息）
- 复现步骤

## 📝 更新日志

### v1.0.0 (2025-06-11)
- 🎉 初始版本发布
- ✨ 完整的隧道代理功能
- ✨ Web管理后台
- ✨ SSL/HTTPS支持
- ✨ 生产级部署支持

---

## 🙏 致谢

感谢所有为此项目贡献的开发者和用户！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件
