/**
 * 完整测试tunnel系统的WebSocket消息流
 * 模拟：浏览器 → tunnel-server → tunnel-proxy → HA → tunnel-proxy → tunnel-server → 浏览器
 */

const WebSocket = require('ws');
const net = require('net');

async function testCompleteMessageFlow() {
    console.log('🔍 测试完整的tunnel WebSocket消息流...');
    
    // 第一步：模拟tunnel-proxy连接到HA
    console.log('\n1️⃣ 模拟tunnel-proxy连接到HA...');
    
    const haWs = new WebSocket('ws://192.168.6.170:8123/api/websocket');
    const receivedMessages = [];
    const forwardedMessages = [];
    
    await new Promise((resolve, reject) => {
        haWs.on('open', () => {
            console.log('✅ tunnel-proxy → HA 连接成功');
            
            // 设置消息处理器（模拟tunnel-proxy的实际做法）
            haWs.on('message', (data) => {
                const message = JSON.parse(data.toString());
                receivedMessages.push(message);
                
                console.log(`📥 tunnel-proxy收到HA消息 #${receivedMessages.length}:`, message);
                
                // 模拟转发给tunnel-server
                const forwardMessage = {
                    type: 'websocket_data',
                    upgrade_id: 'test-12345',
                    data: data.toString('base64'),
                    timestamp: Date.now()
                };
                forwardedMessages.push(forwardMessage);
                
                console.log(`📤 tunnel-proxy转发消息 #${forwardedMessages.length} 到tunnel-server`);
                
                // 模拟发送认证消息
                if (message.type === 'auth_required') {
                    setTimeout(() => {
                        const authMsg = {
                            type: 'auth',
                            access_token: 'invalid_token_for_test'
                        };
                        console.log('📤 tunnel-proxy发送认证到HA:', authMsg);
                        haWs.send(JSON.stringify(authMsg));
                    }, 100);
                }
            });
            
            resolve();
        });
        
        haWs.on('error', reject);
        
        setTimeout(() => reject(new Error('连接超时')), 5000);
    });
    
    // 第二步：等待认证过程完成
    console.log('\n2️⃣ 等待认证过程完成...');
    
    await new Promise(resolve => {
        haWs.on('close', () => {
            console.log('🔒 HA WebSocket连接关闭');
            resolve();
        });
        
        // 10秒后强制结束
        setTimeout(() => {
            if (haWs.readyState === WebSocket.OPEN) {
                console.log('⏰ 强制关闭HA连接');
                haWs.close();
            }
            resolve();
        }, 10000);
    });
    
    // 第三步：分析结果
    console.log('\n3️⃣ 分析结果...');
    console.log(`📊 tunnel-proxy收到 ${receivedMessages.length} 条消息`);
    console.log(`📊 tunnel-proxy转发 ${forwardedMessages.length} 条消息`);
    
    console.log('\n--- 收到的消息详情 ---');
    receivedMessages.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.type}: ${JSON.stringify(msg).substring(0, 100)}...`);
    });
    
    console.log('\n--- 转发的消息详情 ---');
    forwardedMessages.forEach((msg, i) => {
        const decoded = Buffer.from(msg.data, 'base64').toString();
        console.log(`${i + 1}. ${decoded}`);
    });
    
    // 检查关键消息
    const hasAuthRequired = receivedMessages.some(m => m.type === 'auth_required');
    const hasAuthInvalid = receivedMessages.some(m => m.type === 'auth_invalid');
    
    console.log('\n--- 关键检查 ---');
    console.log(`✅ 收到auth_required: ${hasAuthRequired}`);
    console.log(`❓ 收到auth_invalid: ${hasAuthInvalid}`);
    console.log(`📊 总消息数: ${receivedMessages.length}`);
    
    if (!hasAuthInvalid && receivedMessages.length === 1) {
        console.log('🚨 问题确认：只收到auth_required，没有收到auth_invalid！');
        console.log('   这表明HA在发送auth_invalid后立即关闭了连接');
        console.log('   需要检查tunnel-proxy的消息处理时序');
    } else if (hasAuthInvalid) {
        console.log('✅ 收到了auth_invalid消息，说明tunnel-proxy的消息处理正常');
        console.log('   问题可能在tunnel-proxy到tunnel-server的通信');
    }
}

testCompleteMessageFlow().catch(console.error);
