#!/bin/bash

# WebSocket iOS 兼容性修复 + 日志优化部署脚本
echo "🚀 开始部署 WebSocket iOS 兼容性修复和日志优化..."

# 更新服务器上的关键文件
echo "📂 复制修复后的文件到生产服务器..."
scp tunnel-server/src/utils/websocket-utils.js root@114.132.237.146:/opt/tunnel-server/src/utils/
scp tunnel-server/src/servers/proxy-server.js root@114.132.237.146:/opt/tunnel-server/src/servers/
scp tunnel-server/src/core/client-manager.js root@114.132.237.146:/opt/tunnel-server/src/core/
scp tunnel-server/src/utils/domain-manager.js root@114.132.237.146:/opt/tunnel-server/src/utils/

# 设置生产环境日志级别为info，避免debug日志过多
echo "⚙️ 设置生产环境日志级别..."
ssh root@114.132.237.146 "cd /opt/tunnel-server && export LOG_LEVEL=info"

# 重启服务
echo "🔄 重启生产服务器上的 tunnel-server..."
ssh root@114.132.237.146 "cd /opt/tunnel-server && pm2 restart tunnel-server"

echo "✅ 部署完成！"
echo ""
echo "🔍 修复内容："
echo "   1. WebSocket兼容性修复："
echo "      - 移除了 WebSocket 响应中的 'Sec-WebSocket-Version: 13' 头"
echo "      - 现在严格遵循 RFC 6455 标准，只包含必需的响应头"
echo "      - 这应该解决 iOS Starscream WSError 错误1 的问题"
echo ""
echo "   2. 日志优化："
echo "      - 减少重复的域名查找日志输出"
echo "      - 详细日志只在LOG_LEVEL=debug时显示"
echo "      - 生产环境使用info级别，减少噪音"
echo ""
echo "📋 测试建议："
echo "   1. 用 iOS 应用重新尝试连接"
echo "   2. 观察是否还有 Starscream.WSError 错误"
echo "   3. 检查 WebSocket 认证流程是否正常进行"
echo "   4. 日志输出应该更加简洁"
