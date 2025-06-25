# 内网穿透服务二级域名部署指南

## 🎯 部署概述

本指南将帮助您完成内网穿透服务从传统IP访问模式到二级域名模式的完整部署和配置。

## ✅ 配置验证结果

根据自动验证脚本，当前配置状态：

- ✅ **Nginx配置**: 14项检查通过，配置完整
- ✅ **端口配置**: 代理端口3081和管理端口3082配置一致
- ✅ **域名配置**: wzzhk.club域名已正确配置
- ✅ **WebSocket支持**: Home Assistant WebSocket完全支持
- ⚠️ **SSL证书**: 需要手动验证证书文件存在性

## 📋 部署前准备清单

### 1. 域名和DNS配置
- [ ] 域名 `wzzhk.club` 已注册并指向服务器IP `110.41.20.134`
- [ ] 腾讯云DNS控制台配置完成
- [ ] 通配符DNS记录 `*.wzzhk.club` 指向服务器IP
- [ ] 腾讯云API密钥已获取并配置正确权限

### 2. SSL证书配置
- [ ] 通配符SSL证书已申请 (`*.wzzhk.club`)
- [ ] 证书文件存在于 `/www/server/panel/vhost/cert/wzzhk.club/`
  - `fullchain.pem` (证书链)
  - `privkey.pem` (私钥)

### 3. 服务器环境
- [ ] Nginx已安装并运行
- [ ] Node.js环境已配置
- [ ] 防火墙已开放端口：80, 443, 3080, 3081, 3082

## 🚀 部署步骤

### 步骤1: 配置环境变量

```bash
cd tunnel-server
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键参数：

```env
# 启用域名模式
DOMAIN_MODE=true

# 域名配置
BASE_DOMAIN=wzzhk.club
SERVER_IP=110.41.20.134

# 腾讯云DNS API配置
TENCENT_SECRET_ID=你的API_ID
TENCENT_SECRET_KEY=你的API_KEY
TENCENT_REGION=ap-guangzhou

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的安全密码
JWT_SECRET=你的JWT密钥
```

### 步骤2: 安装依赖

```bash
cd tunnel-server
npm install
```

### 步骤3: 测试域名配置

```bash
# 运行配置向导（推荐）
npm run setup:domain

# 或手动测试
node test-domain-mode.js
```

### 步骤4: 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start

# 使用PM2管理（推荐）
npm install -g pm2
pm2 start ecosystem.config.js
```

### 步骤5: 验证Nginx配置

```bash
# 验证配置语法
sudo nginx -t

# 重载配置
sudo nginx -s reload
```

## 🔧 配置文件详解

### Nginx配置关键部分

#### 1. 二级域名通配符匹配
```nginx
# 匹配所有 *.wzzhk.club 二级域名
server_name ~^(?<subdomain>[^.]+)\.wzzhk\.club$;

# 代理到隧道服务
proxy_pass http://127.0.0.1:3081;
```

#### 2. WebSocket支持
```nginx
# WebSocket升级头
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# Home Assistant特殊处理
location /api/websocket {
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

#### 3. SSL配置
```nginx
# 通配符证书
ssl_certificate /www/server/panel/vhost/cert/wzzhk.club/fullchain.pem;
ssl_certificate_key /www/server/panel/vhost/cert/wzzhk.club/privkey.pem;
```

### 服务端配置关键部分

#### 1. 域名分配机制
```javascript
// 用户ID + 4位随机字母
// 例如: ha001 → ha001abcd.wzzhk.club
const domain = await domainManager.allocateDomain(userId);
```

#### 2. 腾讯云DNS自动管理
```javascript
// 自动创建A记录
await tencentDns.createRecord(subdomain, serverIp);

// 自动删除记录
await tencentDns.deleteRecord(recordId);
```

## 🧪 测试验证

### 1. 运行配置验证
```bash
node verify-nginx-config.js
```

### 2. 测试域名分配
```bash
node test-domain-mode.js
```

### 3. 测试客户端连接
```bash
# 使用测试用户ID连接
curl -X POST http://localhost:3080/auth \
  -H "Content-Type: application/json" \
  -d '{"userId": "ha001", "password": "your_password"}'
```

### 4. 验证域名访问
访问分配的二级域名，例如：
- `https://ha001abcd.wzzhk.club`

## 📊 监控和管理

### 1. 管理后台
访问管理后台：`https://wzzhk.club/admin`

功能包括：
- 查看活跃连接
- 管理域名分配
- 清理过期域名
- 系统状态监控

### 2. API接口

```bash
# 查询域名分配状态
curl http://localhost:3082/api/domains

# 手动分配域名
curl -X POST http://localhost:3082/api/domains/allocate \
  -H "Content-Type: application/json" \
  -d '{"userId": "ha002"}'

# 释放域名
curl -X DELETE http://localhost:3082/api/domains/ha002abcd
```

### 3. 日志监控

```bash
# 查看服务日志
tail -f tunnel-server/tunnel-proxy.log

# 查看Nginx日志
tail -f /www/wwwlogs/tunnel-proxy.log
tail -f /www/wwwlogs/tunnel-proxy-error.log
```

## 🚨 故障排除

### 常见问题

1. **SSL证书问题**
   ```bash
   # 检查证书有效性
   openssl x509 -in /www/server/panel/vhost/cert/wzzhk.club/fullchain.pem -text -noout
   ```

2. **DNS解析问题**
   ```bash
   # 测试DNS解析
   nslookup ha001test.wzzhk.club
   ```

3. **端口占用问题**
   ```bash
   # 检查端口占用
   netstat -tulpn | grep :3081
   ```

4. **腾讯云API问题**
   ```bash
   # 测试API连接
   node -e "require('./tunnel-server/src/utils/tencent-dns.js').testConnection()"
   ```

## 🔄 升级和维护

### 定期维护任务

1. **证书续期**: 配置自动续期脚本
2. **域名清理**: 系统自动清理过期域名
3. **日志轮转**: 配置日志文件轮转
4. **性能监控**: 监控并发连接数和响应时间

### 扩展配置

1. **负载均衡**: 多服务器部署时的负载均衡配置
2. **缓存优化**: Redis缓存客户端状态
3. **安全加固**: IP白名单、频率限制等

## 📝 部署检查清单

部署完成后，请确认以下项目：

- [ ] 服务成功启动（端口3080, 3081, 3082）
- [ ] Nginx配置已重载
- [ ] SSL证书工作正常
- [ ] 测试域名可以正常分配和访问
- [ ] 管理后台可以正常访问
- [ ] 腾讯云DNS API工作正常
- [ ] 客户端可以成功连接并获得域名
- [ ] WebSocket连接正常（Home Assistant功能）

## 📞 技术支持

如遇到问题，请：

1. 查看日志文件确定错误原因
2. 运行 `node verify-nginx-config.js` 检查配置
3. 运行 `node test-domain-mode.js` 测试域名功能
4. 检查防火墙和网络连接

---

**部署完成后，您的内网穿透服务将支持：**
- 🌐 动态二级域名访问 (ha001abcd.wzzhk.club)
- 🔒 HTTPS和SSL支持
- 🔄 WebSocket完全支持
- 🎛️ 可视化管理后台
- 🚀 自动化域名管理
- 📊 实时监控和日志
