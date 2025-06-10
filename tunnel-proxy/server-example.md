# 中转服务器部署示例

这里提供一个简单的中转服务器实现示例，你需要在你的服务器上运行这个代码。

## 安装依赖

```bash
npm init -y
npm install ws express http-proxy-middleware
```

## 服务器代码 (server.js)

```javascript
const net = require('net');
const http = require('http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');

class TunnelServer {
    constructor(options = {}) {
        this.port = options.port || 8080;
        this.clients = new Map(); // 存储客户端连接
        this.proxies = new Map(); // 存储代理映射
        this.server = null;
        this.webServer = null;
    }

    start() {
        // 创建TCP服务器用于隧道连接
        this.server = net.createServer((socket) => {
            console.log('新的客户端连接');
            this.handleClientConnection(socket);
        });

        // 创建HTTP服务器用于代理
        const app = express();
        
        // 代理中间件
        app.use('/', (req, res, next) => {
            const clientId = req.headers['x-client-id'] || 'default';
            const client = this.clients.get(clientId);
            
            if (!client || !client.authenticated) {
                res.status(502).json({ error: '客户端未连接或未认证' });
                return;
            }

            // 这里可以实现具体的代理逻辑
            // 将请求转发给相应的客户端
            next();
        });

        this.webServer = http.createServer(app);

        // 启动服务器
        this.server.listen(this.port, () => {
            console.log(`隧道服务器启动在端口 ${this.port}`);
        });

        this.webServer.listen(this.port + 1, () => {
            console.log(`Web代理服务器启动在端口 ${this.port + 1}`);
        });
    }

    handleClientConnection(socket) {
        const clientInfo = {
            socket: socket,
            authenticated: false,
            clientId: null,
            lastHeartbeat: Date.now()
        };

        socket.on('data', (data) => {
            this.handleClientMessage(clientInfo, data);
        });

        socket.on('close', () => {
            console.log('客户端断开连接');
            if (clientInfo.clientId) {
                this.clients.delete(clientInfo.clientId);
            }
        });

        socket.on('error', (error) => {
            console.error('客户端连接错误:', error.message);
        });
    }

    handleClientMessage(clientInfo, data) {
        try {
            const messages = data.toString().split('\n').filter(msg => msg.trim());
            
            for (const messageStr of messages) {
                const message = JSON.parse(messageStr);
                
                switch (message.type) {
                    case 'auth':
                        this.handleAuth(clientInfo, message);
                        break;
                    case 'heartbeat':
                        this.handleHeartbeat(clientInfo, message);
                        break;
                    case 'heartbeat_ack':
                        clientInfo.lastHeartbeat = Date.now();
                        break;
                    default:
                        console.log('未知消息类型:', message.type);
                }
            }
        } catch (error) {
            console.error('处理客户端消息失败:', error.message);
        }
    }

    handleAuth(clientInfo, message) {
        // 简单的用户验证逻辑，实际应用中应该使用更安全的验证
        const validUsers = {
            'admin': 'password'
        };

        if (validUsers[message.username] === message.password) {
            clientInfo.authenticated = true;
            clientInfo.clientId = message.client_id;
            this.clients.set(message.client_id, clientInfo);
            
            const response = {
                type: 'auth_success',
                timestamp: Date.now()
            };
            
            clientInfo.socket.write(JSON.stringify(response) + '\n');
            console.log(`客户端 ${message.client_id} 认证成功`);
        } else {
            const response = {
                type: 'auth_failed',
                reason: '用户名或密码错误',
                timestamp: Date.now()
            };
            
            clientInfo.socket.write(JSON.stringify(response) + '\n');
            console.log('客户端认证失败');
        }
    }

    handleHeartbeat(clientInfo, message) {
        clientInfo.lastHeartbeat = Date.now();
        
        const response = {
            type: 'heartbeat',
            timestamp: Date.now()
        };
        
        clientInfo.socket.write(JSON.stringify(response) + '\n');
    }

    // 定期检查客户端连接状态
    startHealthCheck() {
        setInterval(() => {
            const now = Date.now();
            for (const [clientId, client] of this.clients.entries()) {
                if (now - client.lastHeartbeat > 60000) { // 60秒超时
                    console.log(`客户端 ${clientId} 超时，移除连接`);
                    client.socket.destroy();
                    this.clients.delete(clientId);
                }
            }
        }, 30000); // 30秒检查一次
    }
}

// 启动服务器
const server = new TunnelServer({ port: 8080 });
server.start();
server.startHealthCheck();

console.log('中转服务器已启动');
```

## 使用方法

1. 在你的服务器上创建上述代码文件
2. 运行 `node server.js`
3. 在Home Assistant加载项中配置服务器地址和认证信息
4. 启动加载项即可建立隧道连接

## 安全建议

- 使用更强的身份验证机制
- 启用HTTPS/TLS加密
- 限制客户端连接数量
- 添加访问日志和监控
- 定期更新依赖包

## 端口说明

- 8080: 隧道连接端口
- 8081: Web代理端口

根据你的实际需求调整端口配置。
