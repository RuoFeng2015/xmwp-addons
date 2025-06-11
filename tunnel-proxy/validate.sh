#!/bin/bash
# 验证插件依赖和配置的测试脚本

echo "🔍 验证Home Assistant插件配置..."

# 检查关键文件是否存在
echo "检查关键文件..."
files=(
    "config.yaml"
    "Dockerfile" 
    "rootfs/opt/tunnel-proxy/package.json"
    "rootfs/opt/tunnel-proxy/app.js"
    "rootfs/etc/services.d/tunnel-proxy/run"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file 存在"
    else
        echo "❌ $file 不存在"
    fi
done

# 验证package.json语法
echo -e "\n检查package.json语法..."
if node -e "JSON.parse(require('fs').readFileSync('rootfs/opt/tunnel-proxy/package.json', 'utf8'))" 2>/dev/null; then
    echo "✅ package.json 语法正确"
else
    echo "❌ package.json 语法错误"
fi

# 验证config.yaml语法
echo -e "\n检查config.yaml语法..."
if python3 -c "import yaml; yaml.safe_load(open('config.yaml'))" 2>/dev/null; then
    echo "✅ config.yaml 语法正确"
else
    echo "❌ config.yaml 语法错误"
fi

# 检查依赖版本兼容性
echo -e "\n检查依赖版本..."
echo "Node.js版本要求: >= 18.0.0"
echo "当前系统Node.js版本: $(node --version 2>/dev/null || echo '未安装')"

# 显示插件信息
echo -e "\n插件信息："
echo "名称: $(grep 'name:' config.yaml | cut -d'"' -f2)"
echo "版本: $(grep 'version:' config.yaml | cut -d'"' -f2)"
echo "架构支持: $(grep -A5 'arch:' config.yaml | grep -E '^\s+-' | tr -d ' -')"

echo -e "\n🎉 验证完成！"
