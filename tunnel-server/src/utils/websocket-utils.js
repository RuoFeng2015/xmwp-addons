/**
 * WebSocket处理工具模块
 * 提供WebSocket帧解析、创建等功能
 */

const Logger = require('../core/logger');

/**
 * WebSocket工具类
 */
class WebSocketUtils {  /**
   * 创建WebSocket帧
   * @param {Buffer} payload 消息负载
   * @param {number} opcode 操作码 (1=文本帧, 2=二进制帧)
   * @returns {Buffer} WebSocket帧
   */
  static createWebSocketFrame(payload, opcode = null) {
    const payloadLength = payload.length;

    // 智能判断帧类型
    let frameOpcode = opcode;
    if (frameOpcode === null) {
      frameOpcode = this.determineFrameType(payload);
    }

    let frame;
    const firstByte = 0x80 | frameOpcode; // FIN=1, RSV=000, OPCODE

    if (payloadLength < 126) {
      // 短帧：2字节头 + 负载
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[0] = firstByte;
      frame[1] = payloadLength; // MASK=0, 负载长度
      payload.copy(frame, 2);
    } else if (payloadLength < 65536) {
      // 中等帧：4字节头 + 负载
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[0] = firstByte;
      frame[1] = 126; // MASK=0, 扩展长度标志
      frame.writeUInt16BE(payloadLength, 2); // 16位长度
      payload.copy(frame, 4);
    } else {
      // 长帧：10字节头 + 负载
      frame = Buffer.allocUnsafe(10 + payloadLength);
      frame[0] = firstByte;
      frame[1] = 127; // MASK=0, 扩展长度标志
      frame.writeUInt32BE(0, 2); // 64位长度的高32位（设为0）
      frame.writeUInt32BE(payloadLength, 6); // 64位长度的低32位
      payload.copy(frame, 10);
    }

    // 验证帧的完整性
    const expectedLength = payloadLength + (payloadLength < 126 ? 2 : payloadLength < 65536 ? 4 : 10);
    if (frame.length !== expectedLength) {
      throw new Error(`WebSocket帧长度不匹配: 期望 ${expectedLength}, 实际 ${frame.length}`);
    }

    return frame;
  }

  /**
   * 智能判断WebSocket帧类型
   * @param {Buffer} payload 消息负载
   * @returns {number} 帧类型 (1=文本帧, 2=二进制帧)
   */
  static determineFrameType(payload) {
    // 检查是否为有效的UTF-8文本
    if (this.isValidUTF8Buffer(payload)) {
      // 进一步检查是否包含过多的控制字符
      const hasExcessiveControlChars = this.hasExcessiveControlCharacters(payload);
      return hasExcessiveControlChars ? 2 : 1; // 控制字符过多时使用二进制帧
    }
    
    return 2; // 无法解析为UTF-8时使用二进制帧
  }

  /**
   * 检查Buffer是否为有效的UTF-8
   * @param {Buffer} buffer 要检查的Buffer
   * @returns {boolean} 是否为有效的UTF-8
   */
  static isValidUTF8Buffer(buffer) {
    try {
      const text = buffer.toString('utf8');
      // 检查是否包含替换字符（�），这通常表示UTF-8解码失败
      if (text.includes('\uFFFD')) {
        return false;
      }
      
      // 尝试重新编码验证
      const reencoded = Buffer.from(text, 'utf8');
      return reencoded.equals(buffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查是否包含过多的控制字符
   * @param {Buffer} buffer 要检查的Buffer
   * @returns {boolean} 是否包含过多的控制字符
   */
  static hasExcessiveControlCharacters(buffer) {
    let controlCharCount = 0;
    const sampleSize = Math.min(buffer.length, 512); // 检查前512字节
    
    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      
      // 允许的控制字符：换行、回车、制表符
      if (byte === 0x0A || byte === 0x0D || byte === 0x09) {
        continue;
      }
      
      // 空字节表示二进制
      if (byte === 0x00) {
        return true;
      }
      
      // 其他控制字符计数（0-31，除了已允许的）
      if (byte < 32) {
        controlCharCount++;
      }
    }
    
    // 如果控制字符超过20%，认为应该使用二进制帧
    const controlCharRatio = controlCharCount / sampleSize;
    return controlCharRatio > 0.2;
  }

  /**
   * 解析WebSocket帧，提取消息内容
   * @param {Buffer} buffer 原始帧数据
   * @returns {Buffer[]} 解析出的消息数组
   */
  static parseWebSocketFrames(buffer) {
    const messages = [];
    let offset = 0;

    while (offset < buffer.length) {
      try {
        if (offset + 2 > buffer.length) break;

        const firstByte = buffer[offset];
        const secondByte = buffer[offset + 1];

        // 检查FIN位和操作码
        const fin = (firstByte & 0x80) === 0x80;
        const opcode = firstByte & 0x0F;

        // 处理文本帧(1)、二进制帧(2)和关闭帧(8)
        if (opcode !== 1 && opcode !== 2 && opcode !== 8) {
          // 跳过ping/pong等控制帧
          offset += 2;
          continue;
        }

        // 获取负载长度
        const masked = (secondByte & 0x80) === 0x80;
        let payloadLength = secondByte & 0x7F;

        offset += 2;

        // 处理扩展长度
        if (payloadLength === 126) {
          if (offset + 2 > buffer.length) break;
          payloadLength = buffer.readUInt16BE(offset);
          offset += 2;
        } else if (payloadLength === 127) {
          if (offset + 8 > buffer.length) break;
          // 简化处理，只读取低32位（大多数情况下足够）
          offset += 4; // 跳过高32位
          payloadLength = buffer.readUInt32BE(offset);
          offset += 4;
        }

        // 处理掩码
        let maskKey = null;
        if (masked) {
          if (offset + 4 > buffer.length) break;
          maskKey = buffer.slice(offset, offset + 4);
          offset += 4;
        }

        // 检查负载数据是否完整
        if (offset + payloadLength > buffer.length) break;

        // 提取负载数据
        let payload = buffer.slice(offset, offset + payloadLength);

        // 如果有掩码，进行解码
        if (masked && maskKey) {
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskKey[i % 4];
          }
        }

        // 只有完整帧才添加到消息列表
        if (fin) {
          messages.push(payload);
        }

        offset += payloadLength;
      } catch (error) {
        Logger.error(`解析WebSocket帧时出错: ${error.message}`);
        break;
      }
    }

    return messages;
  }

  /**
   * 创建WebSocket Accept值
   * @param {string} webSocketKey 客户端提供的WebSocket Key
   * @returns {string} WebSocket Accept值
   */
  static createWebSocketAccept(webSocketKey) {
    const crypto = require('crypto');
    return crypto.createHash('sha1')
      .update(webSocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
  }

  /**
   * 检查是否为认证相关消息
   * @param {Buffer} messageData 消息数据
   * @returns {Object} 解析结果 {isAuthMessage, messageType, parsedMessage}
   */
  static analyzeMessage(messageData) {
    let isAuthMessage = false;
    let messageType = null;
    let parsedMessage = null;

    try {
      parsedMessage = JSON.parse(messageData.toString());
      messageType = parsedMessage.type;

      if (['auth_required', 'auth_ok', 'auth_invalid'].includes(parsedMessage.type)) {
        isAuthMessage = true;
      }
    } catch (e) {
      // 不是JSON消息，忽略解析错误
    }

    return {
      isAuthMessage,
      messageType,
      parsedMessage
    };
  }

  /**
   * 强制刷新WebSocket连接的缓冲区
   * @param {Socket} socket WebSocket连接
   */
  static flushWebSocket(socket) {
    if (!socket || !socket.writable) return;

    // 强制刷新TCP缓冲区
    if (typeof socket._flush === 'function') {
      socket._flush();
    }

    // 发送一个空的ping帧来确保数据被推送
    setImmediate(() => {
      if (socket.writable) {
        const pingFrame = Buffer.from([0x89, 0x00]); // Ping frame with no payload
        socket.write(pingFrame);
      }
    });
  }

  /**
   * 创建WebSocket响应头
   * @param {string} webSocketKey 客户端WebSocket Key
   * @param {Object} additionalHeaders 额外的响应头
   * @returns {string} 完整的响应头字符串
   */
  static createWebSocketResponseHeaders(webSocketKey, additionalHeaders = {}) {
    const websocketAccept = this.createWebSocketAccept(webSocketKey);

    let responseHeaders = 'HTTP/1.1 101 Switching Protocols\r\n';
    responseHeaders += 'Upgrade: websocket\r\n';  // 必须是小写 'websocket'
    responseHeaders += 'Connection: Upgrade\r\n';  // 必须包含 'Upgrade'
    responseHeaders += `Sec-WebSocket-Accept: ${websocketAccept}\r\n`;

    // 只添加最基本的必需头信息，遵循RFC 6455标准

    // 记录响应头以便调试
    Logger.info(`📤 [WebSocketUtils] 生成的响应头:\n${responseHeaders.replace(/\r\n/g, '\\r\\n\n')}`);

    responseHeaders += '\r\n';
    return responseHeaders;
  }
}

module.exports = WebSocketUtils;
