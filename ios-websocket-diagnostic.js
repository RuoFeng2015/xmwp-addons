#!/usr/bin/env node

/**
 * iOS WebSocket连接诊断工具
 * 专门用于诊断iOS Starscream库的WebSocket连接问题
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

function createWebSocketAccept(key) {
    return crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
}

function simulateIOSWebSocketUpgrade() {
    console.log('🔍 [iOS诊断] 模拟iOS WebSocket升级请求\n');
    
    // 创建一个测试服务器
    const server = http.createServer();
    
    server.on('upgrade', (request, socket, head) => {
        console.log('📨 [服务器] 收到WebSocket升级请求');
        console.log('   URL:', request.url);
        console.log('   Headers:');
        
        Object.entries(request.headers).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
        });
        
        // 检查必需的头
        const key = request.headers['sec-websocket-key'];
        const version = request.headers['sec-websocket-version'];
        const upgrade = request.headers['upgrade'];
        const connection = request.headers['connection'];
        
        if (!key || !version || upgrade !== 'websocket' || !connection.includes('Upgrade')) {
            console.log('❌ [服务器] WebSocket头信息验证失败');
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
        }
        
        console.log('✅ [服务器] WebSocket头信息验证通过');
        
        // 生成标准的iOS兼容响应
        const accept = createWebSocketAccept(key);
        
        // 最小化的响应头 - 只包含RFC 6455要求的必需头
        let response = 'HTTP/1.1 101 Switching Protocols\r\n';
        response += 'Upgrade: websocket\r\n';
        response += 'Connection: Upgrade\r\n';
        response += `Sec-WebSocket-Accept: ${accept}\r\n`;
        response += '\r\n';
        
        console.log('📤 [服务器] 发送WebSocket升级响应:');
        console.log(response.replace(/\r\n/g, '\\r\\n\n'));
        
        try {
            socket.write(response);
            console.log('✅ [服务器] 升级响应发送成功');
            
            // 等待客户端数据
            socket.on('data', (data) => {
                console.log(`📥 [服务器] 收到客户端数据: ${data.length} 字节`);
                console.log(`   十六进制: ${data.toString('hex')}`);
                
                // 尝试解析WebSocket帧
                try {
                    if (data.length >= 2) {
                        const firstByte = data[0];
                        const secondByte = data[1];
                        
                        const fin = (firstByte & 0x80) === 0x80;
                        const opcode = firstByte & 0x0F;
                        const masked = (secondByte & 0x80) === 0x80;
                        const payloadLen = secondByte & 0x7F;
                        
                        console.log(`🔍 [帧解析] FIN: ${fin}, OPCODE: ${opcode}, MASKED: ${masked}, LEN: ${payloadLen}`);
                        
                        if (opcode === 1) { // 文本帧
                            console.log('📝 [帧解析] 这是一个文本帧');
                        } else if (opcode === 2) { // 二进制帧
                            console.log('🔢 [帧解析] 这是一个二进制帧');
                        } else if (opcode === 8) { // 关闭帧
                            console.log('🔴 [帧解析] 这是一个关闭帧');
                        } else if (opcode === 9) { // Ping帧
                            console.log('💓 [帧解析] 这是一个Ping帧');
                        } else if (opcode === 10) { // Pong帧
                            console.log('💖 [帧解析] 这是一个Pong帧');
                        }
                    }
                } catch (parseError) {
                    console.log(`❌ [帧解析] 解析失败: ${parseError.message}`);
                }
            });
            
            socket.on('close', () => {
                console.log('🔌 [服务器] 客户端连接关闭');
            });
            
            socket.on('error', (error) => {
                console.log(`❌ [服务器] Socket错误: ${error.message}`);
            });
            
            // 发送测试消息
            setTimeout(() => {
                console.log('📤 [服务器] 发送测试消息');
                const testMessage = JSON.stringify({
                    type: 'auth_required',
                    ha_version: '2025.3.2'
                });
                
                // 创建WebSocket文本帧
                const payload = Buffer.from(testMessage, 'utf8');
                const payloadLength = payload.length;
                
                let frame;
                if (payloadLength < 126) {
                    frame = Buffer.allocUnsafe(2 + payloadLength);
                    frame[0] = 0x81; // FIN=1, OPCODE=1 (文本帧)
                    frame[1] = payloadLength;
                    payload.copy(frame, 2);
                } else {
                    // 处理更长的消息
                    frame = Buffer.allocUnsafe(4 + payloadLength);
                    frame[0] = 0x81;
                    frame[1] = 126;
                    frame.writeUInt16BE(payloadLength, 2);
                    payload.copy(frame, 4);
                }
                
                console.log(`   消息内容: ${testMessage}`);
                console.log(`   帧长度: ${frame.length} 字节`);
                console.log(`   帧数据: ${frame.toString('hex')}`);
                
                try {
                    socket.write(frame);
                    console.log('✅ [服务器] 测试消息发送成功');
                } catch (writeError) {
                    console.log(`❌ [服务器] 测试消息发送失败: ${writeError.message}`);
                }
            }, 1000);
            
        } catch (writeError) {
            console.log(`❌ [服务器] 升级响应发送失败: ${writeError.message}`);
        }
    });
    
    server.listen(8899, () => {
        console.log('🚀 [测试服务器] 启动在端口 8899');
        console.log('📱 [说明] 请将iOS应用连接到 ws://localhost:8899/api/websocket');
        console.log('⏱️  [说明] 测试将在30秒后自动结束\n');
        
        // 30秒后关闭服务器
        setTimeout(() => {
            console.log('\n⏰ [测试] 30秒测试时间结束');
            server.close();
            process.exit(0);
        }, 30000);
    });
    
    server.on('error', (error) => {
        console.log(`❌ [测试服务器] 启动失败: ${error.message}`);
        process.exit(1);
    });
}

// 运行诊断
console.log('🍎 iOS WebSocket连接诊断工具');
console.log('================================\n');

simulateIOSWebSocketUpgrade();
