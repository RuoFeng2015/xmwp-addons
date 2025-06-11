# 🔧 Home Assistant 插件安装问题排除指南

## 常见错误及解决方案

### 1. 网络访问错误

#### 错误信息：
```
Head "https://ghcr.io/v2/hassio-addons/base-aarch64/manifests/15.0.1": denied
```

#### 原因：
- GitHub Container Registry (ghcr.io) 网络访问受限
- 防火墙或代理设置阻止访问
- DNS解析问题

#### 解决方案：

##### 方案A：重启Home Assistant督导程序
```bash
# SSH连接到Home Assistant
ha supervisor restart
```

##### 方案B：清理Docker缓存
```bash
# 清理Docker缓存
docker system prune -f
docker image prune -f
```

##### 方案C：手动设置DNS
在Home Assistant的网络设置中添加：
- 主DNS：8.8.8.8
- 备用DNS：1.1.1.1

##### 方案D：使用代理
如果您有HTTP代理，在Home Assistant中配置：
```yaml
# configuration.yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
```

### 2. 架构不匹配错误

#### 错误信息：
```
platform linux/arm64 does not match target platform linux/amd64
```

#### 解决方案：
确认您的设备架构并使用对应的插件版本：

- **树莓派 4/4B/CM4**: aarch64
- **x86_64 PC**: amd64  
- **老版树莓派**: armv7
- **其他ARM设备**: armhf

### 3. 依赖安装失败

#### 错误信息：
```
npm ERR! network request failed
```

#### 解决方案：
1. **检查网络连接**
2. **等待重试** - 有时是临时网络问题
3. **重启Home Assistant**

### 4. 权限错误

#### 错误信息：
```
permission denied
```

#### 解决方案：
```bash
# SSH到Home Assistant
chmod +x /usr/share/hassio/addons/local/tunnel-proxy/rootfs/etc/services.d/tunnel-proxy/run
```

## 🚀 快速修复步骤

### 步骤1：重启督导程序
```bash
ha supervisor restart
```

### 步骤2：清理系统
```bash
ha supervisor reload
docker system prune -f
```

### 步骤3：重新安装
1. 删除插件
2. 重启Home Assistant
3. 重新添加插件仓库
4. 安装插件

### 步骤4：检查日志
```bash
# 查看督导程序日志
ha supervisor logs

# 查看插件日志  
ha addons logs tunnel-proxy
```

## 🌐 网络问题专门解决方案

### 如果ghcr.io完全无法访问

1. **使用本地构建**：
   - 将Dockerfile.alpine重命名为Dockerfile
   - 重新安装插件

2. **使用Docker Hub镜像**：
   - 已在build.yaml中配置homeassistant官方镜像
   - 重启后重试安装

3. **手动下载镜像**：
```bash
# SSH到Home Assistant
docker pull homeassistant/amd64-base:latest
docker tag homeassistant/amd64-base:latest local/addon-base:latest
```

## 📞 获取帮助

如果以上方案都无法解决问题：

1. **收集日志信息**：
   ```bash
   ha supervisor info > supervisor-info.txt
   ha supervisor logs > supervisor-logs.txt
   ha addons logs tunnel-proxy > addon-logs.txt
   ```

2. **检查系统状态**：
   ```bash
   ha core info
   ha host info
   ha network info
   ```

3. **提供系统信息**：
   - Home Assistant版本
   - 督导程序版本
   - 设备型号和架构
   - 网络环境描述

## ⚡ 预防措施

1. **定期更新**：
   - 保持Home Assistant最新版本
   - 定期重启系统

2. **网络优化**：
   - 配置稳定的DNS
   - 确保网络连接稳定

3. **资源管理**：
   - 定期清理Docker缓存
   - 监控系统资源使用

---

**注意**：如果问题持续存在，可能是临时的网络问题，请稍后重试或联系网络管理员检查防火墙设置。
