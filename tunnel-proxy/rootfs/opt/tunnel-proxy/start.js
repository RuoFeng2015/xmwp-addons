#!/usr/bin/env node

/**
 * 隧道代理服务启动脚本
 * 用于启动和管理内网穿透代理服务
 */

const TunnelProxyApp = require('./app')

// 启动服务
TunnelProxyApp.start().catch((error) => {
  console.error('启动失败:', error.message)
  process.exit(1)
})

// 处理进程信号
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在优雅关闭...')
  TunnelProxyApp.stop().then(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在优雅关闭...')
  TunnelProxyApp.stop().then(() => {
    process.exit(0)
  })
})
