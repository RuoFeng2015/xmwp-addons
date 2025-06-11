#!/bin/bash

# 内网穿透服务器部署脚本
# 用途: 自动化部署和配置隧道服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查root权限
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warn "建议不要使用root用户运行此脚本"
        read -p "是否继续? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检查系统要求
check_requirements() {
    log_step "检查系统要求..."
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        log_info "请先安装 Node.js 18+ 版本"
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2)
    local major_version=$(echo $node_version | cut -d'.' -f1)
    
    if [[ $major_version -lt 18 ]]; then
        log_error "Node.js 版本过低 (当前: $node_version, 需要: 18+)"
        exit 1
    fi
    
    log_info "Node.js 版本检查通过: $node_version"
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    
    log_info "npm 版本: $(npm -v)"
}

# 安装依赖
install_dependencies() {
    log_step "安装项目依赖..."
    
    if [[ ! -f "package.json" ]]; then
        if [[ -f "server-package.json" ]]; then
            cp server-package.json package.json
            log_info "已复制 server-package.json 为 package.json"
        else
            log_error "未找到 package.json 文件"
            exit 1
        fi
    fi
    
    npm install --production
    log_info "依赖安装完成"
}

# 配置环境
setup_environment() {
    log_step "配置环境..."
    
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            log_info "已复制 .env.example 为 .env"
        else
            log_warn "未找到 .env.example 文件，创建默认配置"
            cat > .env << EOF
# 隧道服务器环境配置
TUNNEL_PORT=8080
PROXY_PORT=8081  
ADMIN_PORT=8082
JWT_SECRET=tunnel-server-secret-$(date +%s)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
MAX_CLIENTS=10
SSL_ENABLED=false
LOG_LEVEL=info
EOF
        fi
        
        log_warn "请编辑 .env 文件修改配置，特别是管理员密码!"
        log_warn "配置文件位置: $(pwd)/.env"
    else
        log_info "环境配置文件已存在"
    fi
}

# 配置防火墙
setup_firewall() {
    log_step "配置防火墙..."
    
    # 读取端口配置
    source .env
    
    local ports=($TUNNEL_PORT $PROXY_PORT $ADMIN_PORT)
    
    if command -v ufw &> /dev/null; then
        log_info "检测到 UFW 防火墙"
        for port in "${ports[@]}"; do
            if ! ufw status | grep -q "$port/tcp"; then
                sudo ufw allow $port/tcp
                log_info "已开放端口: $port/tcp"
            fi
        done
    elif command -v firewall-cmd &> /dev/null; then
        log_info "检测到 firewalld 防火墙"
        for port in "${ports[@]}"; do
            sudo firewall-cmd --permanent --add-port=$port/tcp
            log_info "已开放端口: $port/tcp"
        done
        sudo firewall-cmd --reload
    else
        log_warn "未检测到防火墙，请手动开放端口: ${ports[*]}"
    fi
}

# 安装PM2
install_pm2() {
    log_step "安装 PM2..."
    
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
        log_info "PM2 安装完成"
    else
        log_info "PM2 已安装: $(pm2 -v)"
    fi
}

# 启动服务
start_service() {
    log_step "启动服务..."
    
    # 检查服务文件
    if [[ ! -f "tunnel-server.js" ]]; then
        log_error "未找到 tunnel-server.js 文件"
        exit 1
    fi
    
    # 检查是否已经运行
    if pm2 list | grep -q "tunnel-server"; then
        log_info "服务已运行，重启中..."
        pm2 restart tunnel-server
    else
        if [[ -f "ecosystem.config.js" ]]; then
            pm2 start ecosystem.config.js
        else
            pm2 start tunnel-server.js --name tunnel-server
        fi
        log_info "服务启动完成"
    fi
    
    # 设置开机自启
    pm2 startup --hp $HOME
    pm2 save
    
    log_info "已设置开机自启"
}

# 验证部署
verify_deployment() {
    log_step "验证部署..."
    
    source .env
    
    # 等待服务启动
    sleep 5
    
    # 检查端口
    local ports=($TUNNEL_PORT $PROXY_PORT $ADMIN_PORT)
    for port in "${ports[@]}"; do
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            log_info "端口 $port 正常监听"
        else
            log_error "端口 $port 未监听"
        fi
    done
    
    # 检查健康状态
    if command -v curl &> /dev/null; then
        local health_url="http://localhost:$ADMIN_PORT/api/health"
        if curl -s --connect-timeout 5 "$health_url" | grep -q '"status":"ok"'; then
            log_info "健康检查通过"
        else
            log_warn "健康检查失败，请查看日志: pm2 logs tunnel-server"
        fi
    fi
}

# 显示部署信息
show_deployment_info() {
    log_step "部署完成!"
    
    source .env
    
    local server_ip=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    
    echo
    echo "==================== 服务信息 ===================="
    echo "隧道连接地址: $server_ip:$TUNNEL_PORT"
    echo "HTTP代理地址: $server_ip:$PROXY_PORT" 
    echo "管理后台地址: http://$server_ip:$ADMIN_PORT"
    echo "管理员账号: $ADMIN_USERNAME"
    echo "管理员密码: $ADMIN_PASSWORD"
    echo "=================================================="
    echo
    echo "常用命令:"
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs tunnel-server"
    echo "  重启服务: pm2 restart tunnel-server"
    echo "  停止服务: pm2 stop tunnel-server"
    echo
    echo "配置文件: $(pwd)/.env"
    echo "服务文件: $(pwd)/tunnel-server.js"
    echo
    log_warn "重要提醒:"
    echo "1. 请修改 .env 文件中的管理员密码"
    echo "2. 确保防火墙已开放相应端口"
    echo "3. 定期备份配置文件"
}

# 主函数
main() {
    echo "======================================="
    echo "   内网穿透服务器自动部署脚本 v1.0"
    echo "======================================="
    echo
    
    check_root
    check_requirements
    install_dependencies
    setup_environment
    
    # 询问是否配置防火墙
    read -p "是否配置防火墙开放端口? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        setup_firewall
    fi
    
    install_pm2
    start_service
    verify_deployment
    show_deployment_info
    
    log_info "部署完成! 请查看上方信息配置客户端。"
}

# 错误处理
trap 'log_error "脚本执行失败，请查看错误信息"; exit 1' ERR

# 运行主函数
main "$@"
