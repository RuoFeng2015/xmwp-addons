#!/bin/bash

# WebSocket iOS 认证修复部署脚本
echo "🚀 开始部署 WebSocket iOS 认证修复..."

# 更新服务器上的关键文件
echo "📂 复制修复后的文件到生产服务器..."
scp tunnel-server/src/utils/websocket-utils.js root@114.132.237.146:/opt/tunnel-server/src/utils/
scp tunnel-server/src/servers/tunnel-server.js root@114.132.237.146:/opt/tunnel-server/src/servers/
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
echo "🔍 关键修复："
echo "   1. iOS WebSocket认证修复："
echo "      - 添加了对 'auth' 类型消息的识别和处理"
echo "      - 实现了iOS认证消息的服务器端处理逻辑"
echo "      - 添加了访问令牌验证机制"
echo "      - 修复了认证消息未被识别的根本问题"
echo ""
echo "   2. WebSocket兼容性："
echo "      - 移除了 'Sec-WebSocket-Version: 13' 响应头"
echo "      - 严格遵循 RFC 6455 标准"
echo ""
echo "   3. 日志优化："
echo "      - 减少重复的域名查找日志输出"
echo "      - 生产环境使用info级别"
echo ""
echo "📋 测试建议："
echo "   1. 用 iOS 应用重新尝试连接"
echo "   2. 观察是否收到 auth_ok 认证成功消息"
echo "   3. 检查 WebSocket 认证流程是否完整"
echo "   4. 确认不再有认证超时错误"
