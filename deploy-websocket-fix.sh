#!/bin/bash

# WebSocket iOS 兼容性修复部署脚本
echo "🚀 开始部署 WebSocket iOS 兼容性修复..."

# 更新服务器上的 websocket-utils.js
echo "📂 复制修复后的 websocket-utils.js 到生产服务器..."
scp tunnel-server/src/utils/websocket-utils.js root@114.132.237.146:/opt/tunnel-server/src/utils/

# 重启服务
echo "🔄 重启生产服务器上的 tunnel-server..."
ssh root@114.132.237.146 "cd /opt/tunnel-server && pm2 restart tunnel-server"

echo "✅ 部署完成！WebSocket 响应头已修复，移除了导致 iOS 兼容性问题的 Sec-WebSocket-Version 头。"
echo ""
echo "🔍 修复内容："
echo "   - 移除了 WebSocket 响应中的 'Sec-WebSocket-Version: 13' 头"
echo "   - 现在严格遵循 RFC 6455 标准，只包含必需的响应头"
echo "   - 这应该解决 iOS Starscream WSError 错误1 的问题"
echo ""
echo "📋 测试建议："
echo "   1. 用 iOS 应用重新尝试连接"
echo "   2. 观察是否还有 Starscream.WSError 错误"
echo "   3. 检查 WebSocket 认证流程是否正常进行"
