/**
 * 腾讯云DNS管理模块
 * 负责动态创建和删除二级域名
 */

const crypto = require('crypto');
const https = require('https');
const Logger = require('../core/logger');
const { CONFIG } = require('../core/config');

class TencentCloudDNS {
  constructor() {
    this.secretId = CONFIG.TENCENT_SECRET_ID;
    this.secretKey = CONFIG.TENCENT_SECRET_KEY;
    this.domain = CONFIG.BASE_DOMAIN; // wzzhk.club
    this.region = CONFIG.TENCENT_REGION || 'ap-guangzhou';
    this.endpoint = 'dnspod.tencentcloudapi.com';
    this.service = 'dnspod';
    this.version = '2021-03-23';
  }

  /**
   * 生成腾讯云API签名
   */
  generateSignature(params, timestamp) {
    const method = 'POST';
    const uri = '/';
    const query = '';
    const headers = `content-type:application/json; charset=utf-8\nhost:${this.endpoint}\n`;
    const signedHeaders = 'content-type;host';
    const payload = JSON.stringify(params);

    // 拼接规范请求串
    const canonicalRequest = `${method}\n${uri}\n${query}\n${headers}\n${signedHeaders}\n${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // 拼接待签名字符串
    const algorithm = 'TC3-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10);
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // 计算签名
    const secretDate = crypto.createHmac('sha256', `TC3${this.secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(this.service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    return signature;
  }

  /**
   * 发送腾讯云API请求
   */
  async sendRequest(action, params) {
    return new Promise((resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(params, timestamp);

      const authorization = `TC3-HMAC-SHA256 Credential=${this.secretId}/${new Date(timestamp * 1000).toISOString().substr(0, 10)}/${this.service}/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

      const postData = JSON.stringify(params);

      const options = {
        hostname: this.endpoint,
        port: 443,
        path: '/',
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': this.endpoint,
          'X-TC-Action': action,
          'X-TC-Timestamp': timestamp,
          'X-TC-Version': this.version,
          'X-TC-Region': this.region
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.Response.Error) {
              reject(new Error(response.Response.Error.Message));
            } else {
              resolve(response.Response);
            }
          } catch (error) {
            reject(new Error('解析响应失败: ' + error.message));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('请求失败: ' + error.message));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 创建DNS记录
   */
  async createRecord(subdomain, ip) {
    try {
      Logger.info(`创建DNS记录: ${subdomain}.${this.domain} -> ${ip}`);

      const params = {
        Domain: this.domain,
        SubDomain: subdomain,
        RecordType: 'A',
        RecordLine: '默认',
        Value: ip,
        TTL: 600 // 10分钟TTL，便于快速更新
      };

      const result = await this.sendRequest('CreateRecord', params);
      Logger.info(`DNS记录创建成功: ${subdomain}.${this.domain}, RecordId: ${result.RecordId}`);

      return {
        success: true,
        recordId: result.RecordId,
        subdomain: subdomain,
        fullDomain: `${subdomain}.${this.domain}`
      };
    } catch (error) {
      Logger.error(`创建DNS记录失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除DNS记录
   */
  async deleteRecord(recordId) {
    try {
      Logger.info(`删除DNS记录: RecordId ${recordId}`);

      const params = {
        Domain: this.domain,
        RecordId: recordId
      };

      await this.sendRequest('DeleteRecord', params);
      Logger.info(`DNS记录删除成功: RecordId ${recordId}`);

      return { success: true };
    } catch (error) {
      Logger.error(`删除DNS记录失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 查询DNS记录
   */
  async listRecords(subdomain = null) {
    try {
      const params = {
        Domain: this.domain,
        RecordType: 'A'
      };

      if (subdomain) {
        params.Subdomain = subdomain;
      }

      const result = await this.sendRequest('DescribeRecordList', params);
      return {
        success: true,
        records: result.RecordList || []
      };
    } catch (error) {
      Logger.error(`查询DNS记录失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        records: []
      };
    }
  }

  /**
   * 验证域名是否可用
   */
  async isDomainAvailable(subdomain) {
    const result = await this.listRecords(subdomain);
    return result.success && result.records.length === 0;
  }
}

module.exports = TencentCloudDNS;
