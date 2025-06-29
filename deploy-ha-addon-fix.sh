#!/bin/bash

# 修复HA Add-on配置和网络发现部署脚本
# 修复connection_type缺失导致的启动错误

echo "🚀 开始部署HA Add-on配置修复..."

# 服务器配置
SERVER_IP="114.132.237.146"
SERVER_USER="root"
REMOTE_PATH="/root/xmwp-addons"

# 本地路径
LOCAL_TUNNEL_PROXY="./tunnel-proxy"

echo "📋 部署内容:"
echo "   - 修复options.json配置文件（添加connection_type字段）"
echo "   - 更新HA网络发现逻辑（支持Add-on内部网络）"
echo "   - 目标服务器: $SERVER_IP"

# 1. 上传修复后的配置文件
echo "📤 上传修复后的配置文件..."
scp -r "$LOCAL_TUNNEL_PROXY/rootfs/opt/tunnel-proxy/data/options.json" \
    "$SERVER_USER@$SERVER_IP:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/data/"

if [ $? -eq 0 ]; then
    echo "✅ options.json 上传成功"
else
    echo "❌ options.json 上传失败"
    exit 1
fi

# 2. 上传修复后的网络发现代码
echo "📤 上传修复后的网络发现代码..."
scp -r "$LOCAL_TUNNEL_PROXY/rootfs/opt/tunnel-proxy/lib/ha-network-discovery.js" \
    "$SERVER_USER@$SERVER_IP:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/lib/"

if [ $? -eq 0 ]; then
    echo "✅ ha-network-discovery.js 上传成功"
else
    echo "❌ ha-network-discovery.js 上传失败"
    exit 1
fi

# 3. 上传其他关键文件
echo "📤 上传其他关键代码文件..."

# 配置管理器
scp "$LOCAL_TUNNEL_PROXY/rootfs/opt/tunnel-proxy/lib/config.js" \
    "$SERVER_USER@$SERVER_IP:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/lib/"

# HTTP代理处理器
scp "$LOCAL_TUNNEL_PROXY/rootfs/opt/tunnel-proxy/lib/http-proxy-handler.js" \
    "$SERVER_USER@$SERVER_IP:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/lib/"

# WebSocket处理器
scp "$LOCAL_TUNNEL_PROXY/rootfs/opt/tunnel-proxy/lib/websocket-handler.js" \
    "$SERVER_USER@$SERVER_IP:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/lib/"

# 4. 重启HA Add-on服务（如果已在运行）
echo "🔄 检查并重启HA Add-on服务..."
ssh "$SERVER_USER@$SERVER_IP" << 'EOF'
# 检查HA Add-on容器是否在运行
CONTAINER_ID=$(docker ps | grep tunnel-proxy | awk '{print $1}')

if [ ! -z "$CONTAINER_ID" ]; then
    echo "🛑 发现运行中的tunnel-proxy容器: $CONTAINER_ID"
    echo "🔄 重启容器以应用配置修复..."
    docker restart $CONTAINER_ID
    
    # 等待容器重启
    sleep 5
    
    # 检查容器状态
    if docker ps | grep -q tunnel-proxy; then
        echo "✅ tunnel-proxy容器重启成功"
        echo "📋 查看容器日志:"
        docker logs --tail=20 $CONTAINER_ID
    else
        echo "❌ tunnel-proxy容器重启失败"
        echo "📋 查看失败日志:"
        docker logs --tail=20 $CONTAINER_ID
    fi
else
    echo "ℹ️ 未发现运行中的tunnel-proxy容器"
fi
EOF

echo ""
echo "🎉 配置修复部署完成！"
echo ""
echo "📋 修复内容总结:"
echo "   ✅ 添加了缺失的connection_type字段"
echo "   ✅ 配置了正确的server_domain"
echo "   ✅ 更新了HA Add-on内部网络发现逻辑"
echo "   ✅ 优化了网络地址优先级顺序"
echo ""
echo "🔍 下一步建议:"
echo "   1. 检查HA Add-on是否成功启动"
echo "   2. 监控连接到局域网HA实例的状态"
echo "   3. 测试iOS应用的认证流程"
echo ""
echo "🏃‍♂️ 运行隧道链路测试验证修复:"
echo "   node test-tunnel-chain.js"
