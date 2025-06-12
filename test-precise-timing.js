/**
 * 精确测试WebSocket消息时序问题
 * 模拟HA发送auth_invalid后立即关闭连接的情况
 */

const WebSocket = require('ws');

async function testPreciseTimingIssue() {
    console.log('🔍 测试WebSocket消息时序问题...');
    
    // 模拟tunnel-proxy的WebSocket处理逻辑
    const wsUrl = 'ws://192.168.6.170:8123/api/websocket';
    const ws = new WebSocket(wsUrl);
    
    const receivedMessages = [];
    const messageQueue = [];
    let isProcessing = false;
    
    // 模拟tunnel-client的发送函数
    function mockTunnelClientSend(message) {
        if (message.type === 'websocket_data') {
            const decoded = Buffer.from(message.data, 'base64').toString();
            console.log(`📤 [模拟] tunnel-client发送: ${decoded}`);
        } else {
            console.log(`📤 [模拟] tunnel-client发送: ${message.type}`);
        }
        return true;
    }
    
    // 消息处理队列（确保顺序处理）
    async function processMessage(data) {
        messageQueue.push(data);
        
        if (isProcessing) return;
        isProcessing = true;
        
        while (messageQueue.length > 0) {
            const messageData = messageQueue.shift();
            const message = JSON.parse(messageData.toString());
            receivedMessages.push(message);
            
            console.log(`📥 [队列处理] 收到消息 #${receivedMessages.length}: ${message.type}`);
            
            // 模拟转发到tunnel-server
            const forwardMessage = {
                type: 'websocket_data',
                upgrade_id: 'test-timing-' + Date.now(),
                data: messageData.toString('base64'),
                timestamp: Date.now()
            };
            
            // 立即发送，不等待
            mockTunnelClientSend(forwardMessage);
            
            // 模拟网络延迟
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        
        isProcessing = false;
    }
    
    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('✅ WebSocket连接建立');
            
            // 设置消息处理器
            ws.on('message', async (data) => {
                await processMessage(data);
            });
            
            // 发送无效认证
            setTimeout(() => {
                const authMessage = {
                    type: 'auth',
                    access_token: 'invalid_token_timing_test'
                };
                console.log('📤 发送无效认证消息');
                ws.send(JSON.stringify(authMessage));
            }, 100);
        });
        
        ws.on('close', async (code, reason) => {
            console.log(`🔒 WebSocket连接关闭: code=${code}`);
            
            // 给消息队列一些时间完成处理
            console.log('⏳ 等待消息队列处理完成...');
            await new Promise(resolve => setTimeout(resolve, 200));
            
            console.log('\n--- 最终结果 ---');
            console.log(`📊 总共收到 ${receivedMessages.length} 条消息`);
            
            receivedMessages.forEach((msg, i) => {
                console.log(`${i + 1}. ${msg.type}`);
            });
            
            const hasAuthRequired = receivedMessages.some(m => m.type === 'auth_required');
            const hasAuthInvalid = receivedMessages.some(m => m.type === 'auth_invalid');
            
            console.log(`\n✅ 收到auth_required: ${hasAuthRequired}`);
            console.log(`❓ 收到auth_invalid: ${hasAuthInvalid}`);
            
            if (hasAuthInvalid) {
                console.log('✅ 时序测试通过：能够接收到auth_invalid消息');
                console.log('   问题不在WebSocket消息接收时序');
            } else {
                console.log('🚨 时序测试失败：没有收到auth_invalid消息');
                console.log('   需要检查消息队列处理逻辑');
            }
            
            resolve();
        });
        
        ws.on('error', (error) => {
            console.log(`❌ WebSocket错误: ${error.message}`);
            resolve();
        });
        
        // 超时保护
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log('⏰ 测试超时');
                ws.close();
            }
        }, 10000);
    });
}

testPreciseTimingIssue().catch(console.error);
