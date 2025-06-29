#!/usr/bin/env node

/**
 * 测试WebSocket响应头生成和iOS兼容性
 */

const crypto = require('crypto');

// 模拟WebSocket Accept计算
function createWebSocketAccept(webSocketKey) {
    return crypto.createHash('sha1')
        .update(webSocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
}

// 测试iOS兼容的WebSocket响应头生成
function createStrictWebSocketResponse(headers = {}) {
    const websocketKey = headers['sec-websocket-key'] || 'dGhlIHNhbXBsZSBub25jZQ==';
    const websocketAccept = createWebSocketAccept(websocketKey);

    console.log(`🔧 [iOS修复] WebSocket密钥交换:`);
    console.log(`   Client Key: ${websocketKey}`);
    console.log(`   Accept Key: ${websocketAccept}`);

    // 严格按照RFC 6455和iOS期望生成响应头
    const responseHeaders = {};
    
    // 必需的WebSocket升级头（严格遵循RFC 6455）
    responseHeaders['Upgrade'] = 'websocket';
    responseHeaders['Connection'] = 'Upgrade';
    responseHeaders['Sec-WebSocket-Accept'] = websocketAccept;
    
    // iOS Safari/原生应用兼容性头
    responseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    responseHeaders['Pragma'] = 'no-cache';
    responseHeaders['Expires'] = '0';
    
    // 安全头（iOS应用偏好）
    responseHeaders['X-Content-Type-Options'] = 'nosniff';
    responseHeaders['X-Frame-Options'] = 'DENY';
    
    // 移除可能导致iOS问题的头
    // 不包含 Sec-WebSocket-Extensions（可能导致协商失败）
    // 不包含 Sec-WebSocket-Protocol（除非明确请求）

    console.log(`🔧 [iOS修复] 最终响应头:`);
    Object.entries(responseHeaders).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });

    return {
        headers: responseHeaders,
        accept: websocketAccept
    };
}

// 测试不同的WebSocket Key
console.log('========== iOS WebSocket响应头兼容性测试 ==========\n');

// 测试1：标准WebSocket Key
console.log('测试1：标准WebSocket Key');
createStrictWebSocketResponse({
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='
});

console.log('\n' + '='.repeat(50) + '\n');

// 测试2：来自实际iOS日志的Key
console.log('测试2：实际iOS WebSocket Key');
createStrictWebSocketResponse({
    'sec-websocket-key': 'vIBbxTlaQ1quzORzgfK4lw=='
});

console.log('\n' + '='.repeat(50) + '\n');

// 测试3：验证Accept计算
console.log('测试3：验证WebSocket Accept计算');
const testKey = 'vIBbxTlaQ1quzORzgfK4lw==';
const expectedAccept = 'cx8uNkHujQpvYNkWWCd4kQW/9Ng=';
const calculatedAccept = createWebSocketAccept(testKey);

console.log(`输入Key: ${testKey}`);
console.log(`期望Accept: ${expectedAccept}`);
console.log(`计算Accept: ${calculatedAccept}`);
console.log(`计算正确: ${expectedAccept === calculatedAccept ? '✅ 是' : '❌ 否'}`);

console.log('\n' + '='.repeat(50) + '\n');

// 测试4：检查HTTP响应格式
console.log('测试4：完整HTTP响应格式');
const { headers } = createStrictWebSocketResponse({
    'sec-websocket-key': 'vIBbxTlaQ1quzORzgfK4lw=='
});

let httpResponse = 'HTTP/1.1 101 Switching Protocols\r\n';
Object.entries(headers).forEach(([key, value]) => {
    httpResponse += `${key}: ${value}\r\n`;
});
httpResponse += '\r\n';

console.log('完整HTTP响应:');
console.log(httpResponse.replace(/\r\n/g, '\\r\\n\n'));

console.log('\n========== 测试完成 ==========');
