/**
 * 基于成熟第三方插件的简化隧道代理
 * 使用 http-proxy-middleware 和 ws 库
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const http = require('http');
const net = require('net');

// 配置
const CONFIG = {
  PROXY_PORT: 8080,
  HA_HOST: '192.168.6.170',
  HA_PORT: 8123,
  TUNNEL_SERVER_HOST: 'your-server.com',
  TUNNEL_SERVER_PORT: 3080,
  CLIENT_ID: 'simple-ha-proxy'
};

class SimpleTunnelProxy {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.tunnelConnection = null;
    this.isConnected = false;
  }

  /**
   * 启动代理服务
   */
  start() {
    this.setupHttpProxy();
    this.setupWebSocketProxy();
    this.connectToTunnelServer();

    this.server = http.createServer(this.app);

    // 设置WebSocket服务器
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/api/websocket'
    });

    this.setupWebSocketHandling();

    this.server.listen(CONFIG.PROXY_PORT, () => {
      console.log(`🚀 简化隧道代理启动在端口 ${CONFIG.PROXY_PORT}`);
      console.log(`📍 转发到: ${CONFIG.HA_HOST}:${CONFIG.HA_PORT}`);
    });
  }

  /**
   * 设置HTTP代理（使用http-proxy-middleware）
   */
  setupHttpProxy() {
    const proxyOptions = {
      target: `http://${CONFIG.HA_HOST}:${CONFIG.HA_PORT}`,
      changeOrigin: true,
      ws: false, // WebSocket单独处理
      timeout: 30000,
      proxyTimeout: 30000,
      logLevel: 'debug',

      onError: (err, req, res) => {
        console.error(`❌ HTTP代理错误: ${err.message}`);
        res.status(500).json({ error: 'Proxy Error', message: err.message });
      },

      onProxyReq: (proxyReq, req, res) => {
        console.log(`📤 HTTP请求: ${req.method} ${req.url}`);
      },

      onProxyRes: (proxyRes, req, res) => {
        console.log(`📥 HTTP响应: ${proxyRes.statusCode} ${req.url}`);
      }
    };

    // 设置HTTP代理
    this.app.use('/', createProxyMiddleware(proxyOptions));
  }

  /**
   * 设置WebSocket代理处理
   */
  setupWebSocketProxy() {
    // 不使用express的WebSocket升级，而是直接处理
  }

  /**
   * 设置WebSocket处理
   */
  setupWebSocketHandling() {
    this.wss.on('connection', (browserWs, request) => {
      console.log(`🔗 浏览器WebSocket连接建立`);

      // 创建到HA的WebSocket连接
      const haWsUrl = `ws://${CONFIG.HA_HOST}:${CONFIG.HA_PORT}/api/websocket`;
      const haWs = new WebSocket(haWsUrl);

      // HA WebSocket连接成功
      haWs.on('open', () => {
        console.log(`✅ 连接到HA WebSocket成功: ${haWsUrl}`);
      });

      // HA发送消息到浏览器
      haWs.on('message', (data) => {
        try {
          const message = data.toString();
          console.log(`📥 HA->浏览器: ${message}`);

          // 直接转发给浏览器
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(message);
            console.log(`📤 已转发到浏览器`);
          }
        } catch (error) {
          console.error(`❌ HA消息转发失败: ${error.message}`);
        }
      });

      // 浏览器发送消息到HA
      browserWs.on('message', (data) => {
        try {
          const message = data.toString();
          console.log(`📥 浏览器->HA: ${message}`);

          // 直接转发给HA
          if (haWs.readyState === WebSocket.OPEN) {
            haWs.send(message);
            console.log(`📤 已转发到HA`);
          }
        } catch (error) {
          console.error(`❌ 浏览器消息转发失败: ${error.message}`);
        }
      });

      // 处理连接关闭
      browserWs.on('close', (code, reason) => {
        console.log(`🔴 浏览器WebSocket关闭: ${code} ${reason}`);
        if (haWs.readyState === WebSocket.OPEN) {
          haWs.close();
        }
      });

      haWs.on('close', (code, reason) => {
        console.log(`🔴 HA WebSocket关闭: ${code} ${reason}`);
        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.close();
        }
      });

      // 处理错误
      browserWs.on('error', (error) => {
        console.error(`❌ 浏览器WebSocket错误: ${error.message}`);
      });

      haWs.on('error', (error) => {
        console.error(`❌ HA WebSocket错误: ${error.message}`);
        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.close(1002, 'HA Connection Error');
        }
      });
    });
  }

  /**
   * 连接到隧道服务器（可选）
   */
  connectToTunnelServer() {
    // 如果需要外网访问，连接到隧道服务器
    console.log(`📡 连接到隧道服务器: ${CONFIG.TUNNEL_SERVER_HOST}:${CONFIG.TUNNEL_SERVER_PORT}`);
    // 这里可以添加隧道连接逻辑
  }

  /**
   * 停止服务
   */
  stop() {
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
    if (this.tunnelConnection) {
      this.tunnelConnection.destroy();
    }
    console.log('🛑 简化隧道代理已停止');
  }
}

// 启动服务
const proxy = new SimpleTunnelProxy();
proxy.start();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 收到停止信号，正在关闭服务...');
  proxy.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在关闭服务...');
  proxy.stop();
  process.exit(0);
});

module.exports = SimpleTunnelProxy;
