# iOS Home Assistant App 调试检查清单

## 🎉 技术链路状态
- ✅ OAuth认证完成（token交换成功，347字节响应）
- ✅ WebSocket连接和认证成功
- ✅ CORS头已正确添加
- ✅ 响应解压缩正常工作
- ❌ **问题：iOS App认证后未发起HA API请求**

## 🔍 核心问题
iOS App在OAuth认证成功后，没有发起任何 `/api/config`、`/api/states`、`/api/services` 等关键API请求，只有一个异常的 `GET /get` (404)请求。

## 需要检查的iOS端问题

### 1. iOS App网络日志
在iOS设备上检查Home Assistant App的网络请求：
- 设置 → 隐私与安全 → 分析与改进 → 分析数据
- 查找Home Assistant相关的崩溃日志
- 使用Xcode Devices查看实时日志

### 2. 可能的前端拦截原因

#### 2.1 CORS策略问题
虽然我们已添加CORS头，但iOS可能对某些情况更严格：
```
当前CORS设置: access-control-allow-origin: *
iOS可能需要: access-control-allow-origin: https://ha-client-001.wzzhk.club
```

#### 2.2 SSL/TLS证书问题
```
iOS对HTTPS证书要求很严格
检查: https://ha-client-001.wzzhk.club 的证书是否有效
可能需要: 完整的证书链
```

#### 2.3 Content-Security-Policy
```
Home Assistant可能设置了CSP头
iOS Safari引擎可能因CSP拒绝请求
```

### 3. App配置问题

#### 3.1 App内部URL配置
```
检查App内是否正确保存了:
- 服务器URL: https://ha-client-001.wzzhk.club
- Access Token: 已获取到的token
```

#### 3.2 网络权限
```
iOS App可能需要特殊的网络权限配置
检查Info.plist中的网络设置
```

### 4. 临时调试方案

#### 4.1 强制严格CORS Origin
修改tunnel-proxy，将CORS Origin设置为具体域名而非通配符

#### 4.2 添加预检请求支持
确保所有OPTIONS请求都能正确响应

#### 4.3 模拟浏览器行为
添加更多浏览器兼容的响应头

## 🎯 立即执行的调试步骤

### 第一步：在iOS设备上测试域名访问
1. 在iOS Safari中访问：`https://ha-client-001.wzzhk.club`
2. 检查是否出现SSL证书警告
3. 检查是否能正常显示Home Assistant登录页面

### 第二步：检查iOS App的网络日志
1. 连接iPhone到Mac，打开Xcode
2. Window → Devices and Simulators → 选择你的设备
3. Open Console，筛选 "Home Assistant" 或 "homeassistant"
4. 重新尝试添加服务器，观察实时日志

### 第三步：尝试手动API测试
在iOS Safari中测试API端点：
```
https://ha-client-001.wzzhk.club/api/config
https://ha-client-001.wzzhk.club/api/states
```

### 第四步：重置App状态
1. 完全删除Home Assistant App
2. 重新安装
3. 重新尝试添加服务器

### 第五步：检查HA实例设置
检查Home Assistant实例是否有特殊的安全设置：
- `configuration.yaml` 中的 `http` 配置
- 是否启用了 `use_x_forwarded_for`
- 是否有IP白名单限制

## 🔧 高级调试选项

### 临时启用更详细的代理日志
如果需要，我们可以为代理添加更多调试信息，包括：
- 所有HTTP请求的完整头部
- 响应体的前几行内容
- iOS User-Agent的详细分析

### 网络抓包分析
使用Charles Proxy或类似工具：
1. 配置iOS设备使用代理
2. 抓取Home Assistant App的所有网络请求
3. 分析是否有被拦截或失败的请求
