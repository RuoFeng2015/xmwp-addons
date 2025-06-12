const WebSocket = require('ws');

async function testEventOrder() {
    console.log('🔍 测试WebSocket事件触发顺序...');
    
    const ws = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    
    let messageEvents = [];
    let eventOrder = [];
    
    ws.on('open', () => {
        eventOrder.push('OPEN');
        console.log('[OPEN] WebSocket连接已建立');
        
        // 在open事件中设置message监听器（模拟tunnel-proxy的做法）
        ws.on('message', (data) => {
            eventOrder.push('MESSAGE');
            const message = JSON.parse(data.toString());
            messageEvents.push(message);
            console.log(`[MESSAGE] 收到消息: ${JSON.stringify(message)}`);
            
            if (message.type === 'auth_required') {
                // 发送无效认证
                const invalidAuth = {
                    type: 'auth',
                    access_token: 'invalid_token_123'
                };
                console.log(`[SEND] 发送无效认证`);
                ws.send(JSON.stringify(invalidAuth));
            }
        });
    });
    
    ws.on('close', (code, reason) => {
        eventOrder.push('CLOSE');
        console.log(`[CLOSE] WebSocket连接关闭: code=${code}`);
        
        setTimeout(() => {
            console.log('\n--- 事件顺序 ---');
            eventOrder.forEach((event, i) => {
                console.log(`${i + 1}. ${event}`);
            });
            
            console.log('\n--- 收到的消息 ---');
            messageEvents.forEach((msg, i) => {
                console.log(`${i + 1}. ${JSON.stringify(msg)}`);
            });
            
            console.log(`\n📊 总共收到 ${messageEvents.length} 条消息`);
            
            // 关键问题：是否收到了auth_invalid消息？
            const hasAuthInvalid = messageEvents.some(msg => msg.type === 'auth_invalid');
            console.log(`❓ 是否收到auth_invalid: ${hasAuthInvalid}`);
        }, 100);
    });
    
    ws.on('error', (error) => {
        eventOrder.push('ERROR');
        console.log(`[ERROR] WebSocket错误: ${error.message}`);
    });
    
    // 10秒后自动关闭测试
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            console.log('[TIMEOUT] 测试超时，主动关闭连接');
            ws.close();
        }
    }, 10000);
}

testEventOrder().catch(console.error);
