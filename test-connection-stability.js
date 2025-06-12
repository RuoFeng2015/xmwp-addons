/**
 * 最终诊断：检查tunnel-proxy与tunnel-server的连接稳定性
 * 重点关注WebSocket关闭时的连接状态
 */

const net = require('net');
const WebSocket = require('ws');

class DiagnosticTunnelClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.messageBuffer = '';
        this.lastMessageTime = 0;
        this.messageCount = 0;
        this.connectionId = `diag-${Date.now()}`;
    }
    
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            
            this.socket.on('connect', () => {
                console.log(`🔌 [${this.connectionId}] 连接到tunnel-server成功`);
                this.isConnected = true;
                this.authenticate();
                
                setTimeout(() => {
                    if (this.isAuthenticated) {
                        resolve();
                    } else {
                        reject(new Error('认证超时'));
                    }
                }, 3000);
            });
            
            this.socket.on('data', (data) => {
                this.handleServerData(data);
            });
            
            this.socket.on('close', () => {
                console.log(`❌ [${this.connectionId}] 与tunnel-server连接断开`);
                this.isConnected = false;
                this.isAuthenticated = false;
            });
            
            this.socket.on('error', (error) => {
                console.log(`❌ [${this.connectionId}] 连接错误: ${error.message}`);
                reject(error);
            });
            
            this.socket.connect(3080, '43.131.243.82');
        });
    }
    
    authenticate() {
        const authMessage = {
            type: 'auth',
            username: 'admin',
            password: 'password',
            client_id: this.connectionId,
            timestamp: Date.now()
        };
        this.sendMessage(authMessage);
    }
    
    handleServerData(data) {
        this.messageBuffer += data.toString();
        const lines = this.messageBuffer.split('\n');
        this.messageBuffer = lines.pop() || '';
        
        for (const messageStr of lines) {
            if (messageStr.trim()) {
                try {
                    const message = JSON.parse(messageStr);
                    
                    if (message.type === 'auth_success') {
                        console.log(`✅ [${this.connectionId}] 认证成功`);
                        this.isAuthenticated = true;
                    }
                } catch (error) {
                    console.log(`❌ [${this.connectionId}] 解析消息失败: ${error.message}`);
                }
            }
        }
    }
    
    sendMessage(message) {
        if (!this.socket || !this.isConnected) {
            console.log(`❌ [${this.connectionId}] 连接已断开，无法发送消息: ${message.type}`);
            return false;
        }
        
        try {
            const data = JSON.stringify(message) + '\n';
            this.messageCount++;
            this.lastMessageTime = Date.now();
            
            if (message.type === 'websocket_data') {
                const decoded = Buffer.from(message.data, 'base64').toString();
                console.log(`📤 [${this.connectionId}] 发送WebSocket数据 #${this.messageCount}: ${decoded.substring(0, 50)}...`);
            } else {
                console.log(`📤 [${this.connectionId}] 发送消息 #${this.messageCount}: ${message.type}`);
            }
            
            this.socket.write(data);
            
            // 检查连接状态
            console.log(`🔍 [${this.connectionId}] 连接状态: connected=${this.isConnected}, auth=${this.isAuthenticated}`);
            
            return true;
        } catch (error) {
            console.log(`❌ [${this.connectionId}] 发送失败: ${error.message}`);
            return false;
        }
    }
    
    getConnectionInfo() {
        return {
            id: this.connectionId,
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            messageCount: this.messageCount,
            lastMessageTime: this.lastMessageTime
        };
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
        }
    }
}

async function runDiagnostic() {
    console.log('🔍 开始连接稳定性诊断...');
    
    const client = new DiagnosticTunnelClient();
    
    try {
        // 连接并认证
        await client.connect();
        console.log('✅ 连接和认证完成');
        
        // 模拟WebSocket消息流
        console.log('\n📡 开始模拟WebSocket消息流...');
        
        // 第一条消息：auth_required
        const msg1 = {
            type: 'websocket_data',
            upgrade_id: 'diagnostic-test-001',
            data: Buffer.from('{"type":"auth_required","ha_version":"2025.3.2"}').toString('base64'),
            timestamp: Date.now()
        };
        
        console.log('1️⃣ 发送第一条消息...');
        const sent1 = client.sendMessage(msg1);
        console.log(`   结果: ${sent1 ? '成功' : '失败'}`);
        
        // 短暂延迟
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 检查连接状态
        console.log('\n🔍 检查连接状态...');
        const info1 = client.getConnectionInfo();
        console.log(`   连接: ${info1.connected}, 认证: ${info1.authenticated}, 消息数: ${info1.messageCount}`);
        
        // 第二条消息：auth_invalid
        const msg2 = {
            type: 'websocket_data',
            upgrade_id: 'diagnostic-test-001',
            data: Buffer.from('{"type":"auth_invalid","message":"Invalid access token"}').toString('base64'),
            timestamp: Date.now()
        };
        
        console.log('\n2️⃣ 发送第二条消息...');
        const sent2 = client.sendMessage(msg2);
        console.log(`   结果: ${sent2 ? '成功' : '失败'}`);
        
        // 再次检查连接状态
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('\n🔍 最终连接状态...');
        const info2 = client.getConnectionInfo();
        console.log(`   连接: ${info2.connected}, 认证: ${info2.authenticated}, 消息数: ${info2.messageCount}`);
        
        // 模拟WebSocket关闭
        console.log('\n3️⃣ 模拟WebSocket关闭...');
        const closeMsg = {
            type: 'websocket_close',
            upgrade_id: 'diagnostic-test-001',
            timestamp: Date.now()
        };
        
        const sent3 = client.sendMessage(closeMsg);
        console.log(`   结果: ${sent3 ? '成功' : '失败'}`);
        
        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 最终状态
        console.log('\n📊 诊断结果:');
        const finalInfo = client.getConnectionInfo();
        console.log(`   连接ID: ${finalInfo.id}`);
        console.log(`   总消息数: ${finalInfo.messageCount}`);
        console.log(`   连接状态: ${finalInfo.connected ? '正常' : '断开'}`);
        console.log(`   最后消息时间: ${new Date(finalInfo.lastMessageTime).toISOString()}`);
        
        if (finalInfo.messageCount >= 3 && finalInfo.connected) {
            console.log('✅ 连接稳定性测试通过');
            console.log('   问题可能不在连接稳定性');
        } else {
            console.log('🚨 发现连接稳定性问题');
            console.log('   需要检查连接管理逻辑');
        }
        
    } catch (error) {
        console.log(`❌ 诊断失败: ${error.message}`);
    } finally {
        client.disconnect();
    }
}

runDiagnostic().catch(console.error);
