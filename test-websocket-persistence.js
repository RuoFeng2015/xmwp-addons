/**
 * WebSocket连接持久性测试
 * 测试WebSocket连接是否会在10秒后自动关闭
 */

const WebSocket = require('ws');

function testWebSocketPersistence() {
    console.log('🔄 开始WebSocket持久性测试...');
    console.log('📋 测试内容：验证WebSocket连接是否会在10秒后自动关闭');
    console.log('⏱️  预期：连接应该保持稳定超过10秒\n');

    // 尝试连接到代理服务器的WebSocket
    const wsUrl = 'ws://localhost:3081/api/websocket';
    
    console.log(`🔗 尝试连接: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    let startTime = Date.now();
    let pingInterval;
    let connectionDuration = 0;

    ws.on('open', () => {
        console.log('✅ WebSocket连接已建立');
        startTime = Date.now();
        
        // 每秒发送ping消息并记录连接时间
        pingInterval = setInterval(() => {
            connectionDuration = Math.floor((Date.now() - startTime) / 1000);
            console.log(`⏱️  连接持续时间: ${connectionDuration}秒`);
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
            
            // 测试30秒后自动结束
            if (connectionDuration >= 30) {
                console.log('\n🎉 测试成功！WebSocket连接已稳定保持30秒');
                console.log('✅ 修复生效：10秒超时问题已解决');
                clearInterval(pingInterval);
                ws.close();
            }
        }, 1000);
    });

    ws.on('close', (code, reason) => {
        const finalDuration = Math.floor((Date.now() - startTime) / 1000);
        console.log(`\n❌ WebSocket连接已关闭`);
        console.log(`📊 连接持续时间: ${finalDuration}秒`);
        console.log(`🔢 关闭代码: ${code}`);
        console.log(`📝 关闭原因: ${reason || '无'}`);
        
        if (finalDuration >= 9 && finalDuration <= 11) {
            console.log('⚠️  警告：连接在约10秒后关闭，可能仍存在超时问题');
        } else if (finalDuration >= 30) {
            console.log('✅ 成功：连接稳定保持超过30秒');
        } else {
            console.log(`ℹ️  信息：连接在${finalDuration}秒后关闭`);
        }
        
        clearInterval(pingInterval);
    });

    ws.on('error', (error) => {
        console.log(`❌ WebSocket错误: ${error.message}`);
        
        if (error.message.includes('502')) {
            console.log('ℹ️  这可能是正常的，因为没有Home Assistant客户端连接');
            console.log('💡 我们主要测试的是连接超时问题');
        }
        
        clearInterval(pingInterval);
    });

    ws.on('pong', () => {
        console.log(`🏓 收到pong响应 (${connectionDuration}秒)`);
    });

    // 防止测试无限运行
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            console.log('\n⏰ 测试超时（60秒），主动关闭连接');
            ws.close();
        }
        clearInterval(pingInterval);
    }, 60000);
}

// 运行测试
testWebSocketPersistence();
