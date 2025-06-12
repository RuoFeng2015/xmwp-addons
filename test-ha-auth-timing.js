const WebSocket = require('ws');

async function testHAAuthTiming() {
    console.log('🔄 测试HA WebSocket认证时序...');
    
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    
    let messageCount = 0;
    const startTime = Date.now();
    
    function logWithTime(message) {
        const elapsed = Date.now() - startTime;
        console.log(`[${elapsed}ms] ${message}`);
    }
    
    ws.on('open', () => {
        logWithTime('✅ WebSocket连接已建立');
    });
    
    ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());
        logWithTime(`📥 收到消息 #${messageCount}: ${JSON.stringify(message)}`);
        
        if (message.type === 'auth_required') {
            // 发送无效的认证消息
            const invalidAuth = {
                type: 'auth',
                access_token: 'invalid_token_123'
            };
            logWithTime(`📤 发送无效认证: ${JSON.stringify(invalidAuth)}`);
            ws.send(JSON.stringify(invalidAuth));
        }
    });
    
    ws.on('close', (code, reason) => {
        logWithTime(`🔒 WebSocket连接关闭: code=${code}, reason=${reason.toString()}`);
        logWithTime(`📊 总共收到 ${messageCount} 条消息`);
    });
    
    ws.on('error', (error) => {
        logWithTime(`❌ WebSocket错误: ${error.message}`);
    });
    
    // 10秒后自动关闭测试
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            logWithTime('⏰ 测试超时，主动关闭连接');
            ws.close();
        }
    }, 10000);
}

testHAAuthTiming().catch(console.error);
