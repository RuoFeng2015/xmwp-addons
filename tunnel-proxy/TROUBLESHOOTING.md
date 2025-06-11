# 🔧 Home Assistant 加载项安装故障排除

## 问题诊断

### 原始错误
```
安装加载项失败
Can't install ghcr.io/ruofeng2015/tunnel-proxy:1.0.0: 500 Server Error for http+docker://localhost/v1.47/images/create?tag=1.0.0&fromImage=ghcr.io%2Fruofeng2015%2Ftunnel-proxy&platform=linux%2Farm64: Internal Server Error ("Head "https://ghcr.io/v2/ruofeng2015/tunnel-proxy/manifests/1.0.0": denied")
```

### 问题原因
1. **Docker 镜像不存在**: 配置文件中指定的镜像 `ghcr.io/ruofeng2015/tunnel-proxy:1.0.0` 不存在
2. **访问被拒绝**: GitHub Container Registry 访问权限问题

## 解决方案

### ✅ 已修复的问题

1. **移除镜像引用**
   - 从 `config.yaml` 中移除了 `image` 配置
   - 现在使用本地 Dockerfile 构建

2. **优化 Dockerfile**
   - 修复了依赖安装问题
   - 使用 `npm install` 而不是 `npm ci`
   - 添加了必要的权限设置

3. **版本更新**
   - 将版本从 `1.0.0` 更新到 `1.0.1`
   - 修改启动方式为手动启动

4. **添加 .dockerignore**
   - 排除开发文件和不必要的文件
   - 减小镜像体积

## 安装步骤

### 1. 准备工作
确保您的 Home Assistant 环境满足以下要求：
- Home Assistant OS 2023.x 或更新版本
- 有足够的磁盘空间进行构建

### 2. 添加仓库
1. 进入 **设置** > **加载项** > **加载项商店**
2. 点击右上角的 **⋮** 菜单
3. 选择 **仓库**
4. 添加仓库地址：`https://github.com/RuoFeng2015/xmwp-addons`

### 3. 安装加载项
1. 刷新加载项商店
2. 找到 "内网穿透代理" 加载项
3. 点击 **安装**
4. 等待构建完成（首次安装可能需要几分钟）

### 4. 配置加载项
```yaml
server_host: "your-server.com"
server_port: 3080
local_ha_port: 8123
username: "admin"
password: "your_secure_password"
client_id: "ha-home-001"
proxy_port: 9001
log_level: "info"
```

### 5. 启动加载项
1. 保存配置
2. 点击 **启动**
3. 查看日志确认启动状态

## 常见问题

### Q1: 构建失败
**症状**: Docker 构建过程中出错
**解决**: 
- 检查网络连接
- 清理 Docker 缓存
- 重新尝试安装

### Q2: 依赖安装失败
**症状**: npm 安装依赖时出错
**解决**:
- 确保有足够的磁盘空间
- 检查 npm 镜像源设置
- 重新构建加载项

### Q3: 权限问题
**症状**: 服务无法启动，权限错误
**解决**:
- 检查文件权限设置
- 确认启动脚本可执行

## 调试技巧

### 查看构建日志
1. 在加载项页面点击 **日志** 标签
2. 选择 **构建日志** 查看详细信息

### 查看运行时日志
1. 启动加载项后
2. 在 **日志** 标签查看运行状态
3. 根据错误信息进行调试

### 手动测试
如果需要手动测试，可以：
1. SSH 连接到 Home Assistant
2. 进入加载项容器
3. 手动执行相关命令

## 联系支持

如果问题仍然存在，请：
1. 收集完整的错误日志
2. 记录您的环境信息
3. 在 GitHub 仓库提交 Issue

**GitHub 仓库**: https://github.com/RuoFeng2015/xmwp-addons/issues
