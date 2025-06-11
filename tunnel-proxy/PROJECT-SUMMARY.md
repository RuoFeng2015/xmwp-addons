# Home Assistant 内网穿透代理加载项

## 项目概述

这是一个专为 Home Assistant 开发的内网穿透代理加载项，基于您的需求实现：

✅ **支持 2023 及以上版本**  
✅ **支持 10 个用户并发**  
✅ **自建中转服务器架构**  
✅ **HTTP 和 WebSocket 代理**  
✅ **用户名密码身份验证**  
✅ **无需 SSL/TLS 加密**（可选配置）

## 技术架构

### 核心技术栈
- **后端**: Node.js + Koa 框架
- **网络通信**: TCP Socket + HTTP Proxy
- **身份验证**: JWT Token
- **数据存储**: 内存变量（无持久化数据库）
- **容器化**: Docker + Home Assistant Add-on

### 系统架构
```
[Home Assistant] <---> [加载项代理] <---> [中转服务器] <---> [外网用户]
```

## 文件结构说明

```
tunnel-proxy/
├── config.yaml              # 加载项配置文件
├── Dockerfile               # Docker 构建文件
├── build.yaml               # 多架构构建配置
├── README.md                # 用户使用说明
├── CHANGELOG.md             # 版本更新日志
├── DOCS.md                  # 详细安装部署指南
├── server-example.md        # 中转服务器示例代码
├── icon-info.md            # 图标说明文件
├── data/                   # 数据目录（运行时）
└── rootfs/                 # 根文件系统
    ├── etc/
    │   └── services.d/
    │       └── tunnel-proxy/
    │           ├── run      # 服务启动脚本
    │           └── finish   # 服务停止脚本
    └── opt/
        └── tunnel-proxy/
            ├── package.json     # Node.js 依赖配置
            ├── app.js          # 主应用程序
            ├── tunnel-client.js # 隧道客户端模块
            └── public/
                └── index.html  # Web 管理界面
```

## 功能特性

### 🔐 安全认证
- JWT Token 身份验证
- 用户名密码登录
- 客户端唯一标识
- 会话超时管理

### 🌐 代理功能
- HTTP 请求代理
- WebSocket 连接代理
- 多用户并发支持
- 智能连接路由

### 📊 监控管理
- 实时连接状态
- Web 管理界面
- 详细日志记录
- 心跳检测机制

### 🔄 自动恢复
- 断线自动重连
- 健康状态检查
- 过期连接清理
- 错误恢复机制

## 部署步骤

### 1. 部署中转服务器
参考 `server-example.md` 在你的服务器上部署中转服务

### 2. 安装加载项
将项目添加到 Home Assistant 加载项仓库

### 3. 配置参数
设置服务器地址、认证信息等参数

### 4. 启动服务
启动加载项，建立隧道连接

## 配置示例

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

## API 接口

### 认证接口
- `POST /api/auth/login` - 用户登录
- `GET /api/status` - 获取状态（需认证）
- `GET /api/config` - 获取配置（需认证）
- `GET /api/health` - 健康检查

### 管理界面
- `GET /` - 重定向到管理界面
- `GET /index.html` - Web 管理界面

## 性能指标

- **并发用户**: 最多 10 个
- **连接超时**: 5 分钟
- **心跳间隔**: 30 秒
- **重连间隔**: 5 秒
- **最大重连**: 10 次

## 系统要求

### Home Assistant
- Home Assistant OS 2023+
- 可用内存 ≥ 512MB
- 网络连接稳定

### 中转服务器
- Node.js 18+
- 公网 IP 地址
- 开放指定端口
- 稳定网络连接

## 安全建议

1. **强密码策略**: 使用复杂密码，定期更换
2. **访问控制**: 限制访问来源 IP 范围
3. **日志监控**: 定期检查访问日志和异常
4. **服务器安全**: 保持服务器系统更新
5. **数据加密**: 考虑在敏感环境中启用 TLS

## 故障排除

常见问题和解决方案详见 `DOCS.md` 文件。

## 技术支持

- **GitHub Issues**: https://github.com/RuoFeng2015/xmwp-addons/issues
- **文档**: 查看项目中的详细文档
- **日志**: 通过加载项日志排查问题

## 许可证

MIT License - 详见 LICENSE 文件

## 作者

ruofeng <ruofeng@126.com>

---

**注意**: 这是一个基础实现版本，在生产环境使用前请充分测试，并根据实际需求进行安全加固。
