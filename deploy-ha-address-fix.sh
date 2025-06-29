#!/bin/bash

# 部署HA地址修复到隧道代理
# 修复tunnel-client在HA Add-on环境中连接HA Core的地址问题

echo "🚀 部署HA地址修复到隧道代理"
echo "═══════════════════════════════════════════════════════"

# 服务器配置
SERVER="root@114.132.237.146"
REMOTE_PATH="/root/xmwp-addons"

echo "📦 准备部署文件..."

# 1. 部署修复的主机发现文件
echo "1️⃣ 部署主机发现修复..."
scp ./tunnel-proxy/rootfs/opt/tunnel-proxy/lib/ha-network-discovery.js $SERVER:$REMOTE_PATH/tunnel-proxy/rootfs/opt/tunnel-proxy/lib/

# 2. 部署测试脚本
echo "2️⃣ 部署测试脚本..."
scp ./test-ha-addon-connection.js $SERVER:$REMOTE_PATH/

# 3. 重启隧道代理服务
echo "3️⃣ 重启隧道代理服务..."
ssh $SERVER << 'EOF'
cd /root/xmwp-addons

echo "🔄 停止当前隧道代理..."
# 查找并停止tunnel-proxy进程
pkill -f "tunnel-proxy" || true
pkill -f "node.*app.js" || true

echo "⏳ 等待进程完全停止..."
sleep 3

echo "🚀 启动修复后的隧道代理..."
cd tunnel-proxy/rootfs/opt/tunnel-proxy

# 启动tunnel-proxy
nohup node app.js > tunnel-proxy.log 2>&1 &

echo "✅ 隧道代理已重启"
echo "📋 进程状态:"
ps aux | grep -E "(node|tunnel)" | grep -v grep

echo "📄 查看最新日志:"
tail -20 tunnel-proxy.log
EOF

echo ""
echo "🎉 部署完成!"
echo ""
echo "📊 部署内容:"
echo "  ✅ HA网络发现修复 (优先HA Add-on内部地址)"
echo "  ✅ 隧道代理服务已重启"
echo "  ✅ HA Add-on连接测试脚本已部署"
echo ""
echo "🔍 下一步验证:"
echo "  1. 检查隧道代理日志，确认HA连接成功"
echo "  2. 运行隧道链路测试: node test-tunnel-chain.js" 
echo "  3. 测试iOS应用连接"
echo ""
echo "📞 如需检查服务器状态:"
echo "  ssh $SERVER 'cd $REMOTE_PATH && tail -50 tunnel-proxy/rootfs/opt/tunnel-proxy/tunnel-proxy.log'"
