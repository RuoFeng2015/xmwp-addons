# HA 加载项日志优化修复报告

## 修复时间
2025年6月28日

## 问题描述
HA加载项在连接成功时出现以下问题：
1. **undefined地址显示**: 日志中显示"最佳地址: undefined:8123"
2. **重复连接日志**: 同一主机的连接成功消息重复输出，造成日志刷屏

## 问题分析

### 问题1: undefined地址显示
- **位置**: `/lib/health-checker.js` 第115行
- **原因**: 代码使用了 `this.tunnelManager.lastSuccessfulHost`，但 TunnelManager 类中没有直接的 `lastSuccessfulHost` 属性
- **正确调用**: 应该通过 `this.tunnelManager.hostDiscovery.getLastSuccessfulHost()` 方法获取

### 问题2: 重复连接日志
- **位置**: `/lib/http-proxy-handler.js` `handleProxyRequest` 方法
- **原因**: 每次HTTP请求都会输出连接成功日志，没有去重机制
- **影响**: 在活跃使用时会产生大量重复日志

## 修复方案

### 修复1: health-checker.js
```javascript
// 修复前
Logger.info(
  `✅ 本地Home Assistant连接正常 (最佳地址: ${this.tunnelManager.lastSuccessfulHost}:${config.local_ha_port})`
)

// 修复后  
const lastSuccessfulHost = this.tunnelManager.hostDiscovery.getLastSuccessfulHost()
Logger.info(
  `✅ 本地Home Assistant连接正常 (最佳地址: ${lastSuccessfulHost || 'unknown'}:${config.local_ha_port})`
)
```

### 修复2: http-proxy-handler.js
1. **添加日志去重机制**:
   - 添加 `lastSuccessLogTime` Map 记录每个主机上次成功日志时间
   - 设置30秒冷却期，避免短时间内重复输出相同主机的连接成功日志

2. **新增 logConnectionSuccess 方法**:
   ```javascript
   logConnectionSuccess(hostname) {
     const now = Date.now()
     const lastLogTime = this.lastSuccessLogTime.get(hostname)
     
     if (!lastLogTime || (now - lastLogTime) > this.logCooldownPeriod) {
       Logger.info(`✅ 成功连接到 Home Assistant: ${hostname}`)
       this.lastSuccessLogTime.set(hostname, now)
     } else {
       Logger.debug(`✅ 连接成功 (已去重): ${hostname}`)
     }
   }
   ```

## 修复效果
1. **解决undefined显示**: 现在会正确显示最佳地址或"unknown"
2. **减少日志重复**: 相同主机的连接成功日志在30秒内只显示一次
3. **保持调试信息**: 在debug模式下仍可看到所有连接信息

## 测试建议
重启HA加载项后，观察日志输出：
- 首次连接时应正常显示连接成功日志
- 后续30秒内对同一主机的请求不会重复输出连接成功日志
- "最佳地址"应显示正确的IP地址而不是undefined

## 文件变更
- `/lib/health-checker.js`: 修复lastSuccessfulHost访问方式
- `/lib/http-proxy-handler.js`: 添加日志去重机制和logConnectionSuccess方法
