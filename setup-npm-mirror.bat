@echo off
REM npm镜像源配置脚本 - 针对中国网络环境优化

echo 🌐 配置npm镜像源...

REM 配置淘宝镜像源
echo 设置淘宝镜像源...
npm config set registry https://registry.npmmirror.com

REM 配置其他常用镜像
echo 配置其他镜像源...
npm config set disturl https://npmmirror.com/dist
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set sass_binary_site https://npmmirror.com/mirrors/node-sass/
npm config set phantomjs_cdnurl https://npmmirror.com/mirrors/phantomjs/
npm config set chromedriver_cdnurl https://npmmirror.com/mirrors/chromedriver
npm config set operadriver_cdnurl https://npmmirror.com/mirrors/operadriver
npm config set fse_binary_host_mirror https://npmmirror.com/mirrors/fsevents

echo ✅ npm镜像源配置完成！

echo.
echo 📋 当前配置：
npm config get registry
npm config get disturl

echo.
echo 🚀 使用方法：
echo   npm install           # 使用淘宝镜像安装
echo   npm run install:reset # 恢复官方镜像

echo.
echo 💡 提示：如果需要恢复官方镜像源，请运行：
echo   npm config set registry https://registry.npmjs.org/

pause
