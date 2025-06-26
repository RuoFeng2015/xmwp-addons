/**
 * Home Assistant 网络发现模块
 * 使用多种方法智能扫描局域网中的 Home Assistant 实例
 */

const os = require('os');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const Logger = require('./logger');

class HANetworkDiscovery {
  constructor() {
    this.discoveredHosts = new Map(); // 存储发现的主机信息
    this.scanResults = [];
    this.commonPorts = [8123, 8443, 443, 80, 3000, 8080, 8000];
    this.haIndicators = [
      'Home Assistant',
      'hass',
      'homeassistant',
      'hassio',
      'supervisor'
    ];
  }

  /**
   * 主要的发现方法 - 组合多种扫描技术
   */
  async discoverHomeAssistant() {
    Logger.info('🔍 开始智能搜索局域网中的 Home Assistant 实例...');

    const results = {
      discovered: [],
      methods: {
        networkScan: [],
        mDNS: [],
        commonHosts: [],
        ping: []
      },
      recommendedHost: null,
      scanTime: Date.now()
    };

    // 并行执行多种发现方法
    try {
      const [networkHosts, mDNSHosts, commonHosts, pingHosts] = await Promise.allSettled([
        this.scanLocalNetwork(),
        this.discoverViaMDNS(),
        this.checkCommonHosts(),
        this.pingKnownHosts()
      ]);

      // 收集所有结果
      if (networkHosts.status === 'fulfilled') {
        results.methods.networkScan = networkHosts.value;
      }
      if (mDNSHosts.status === 'fulfilled') {
        results.methods.mDNS = mDNSHosts.value;
      }
      if (commonHosts.status === 'fulfilled') {
        results.methods.commonHosts = commonHosts.value;
      }
      if (pingHosts.status === 'fulfilled') {
        results.methods.ping = pingHosts.value;
      }

      // 合并和去重结果
      const allHosts = [
        ...results.methods.networkScan,
        ...results.methods.mDNS,
        ...results.methods.commonHosts,
        ...results.methods.ping
      ];

      results.discovered = this.deduplicateAndRank(allHosts);
      results.recommendedHost = this.selectBestHost(results.discovered);

      Logger.info(`✅ 发现 ${results.discovered.length} 个可能的 Home Assistant 实例`);
      if (results.recommendedHost) {
        Logger.info(`🎯 推荐使用: ${results.recommendedHost.host}:${results.recommendedHost.port}`);
      }

      return results;

    } catch (error) {
      Logger.error(`网络发现过程出错: ${error.message}`);
      return results;
    }
  }

  /**
   * 扫描本地网络段
   */
  async scanLocalNetwork() {
    Logger.info('📡 扫描本地网络段...');
    const hosts = [];

    try {
      const networkInterfaces = this.getLocalNetworkRanges();

      for (const range of networkInterfaces) {
        Logger.info(`🔍 扫描网段: ${range.network}`);
        const rangeHosts = await this.scanNetworkRange(range);
        hosts.push(...rangeHosts);
      }

    } catch (error) {
      Logger.warn(`网络扫描失败: ${error.message}`);
    }

    return hosts;
  }

  /**
   * 获取本地网络范围
   */
  getLocalNetworkRanges() {
    const ranges = [];
    const interfaces = os.networkInterfaces();

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1') {
          const network = this.calculateNetworkRange(addr.address, addr.netmask);
          if (network) {
            ranges.push({
              interface: name,
              network: network,
              gateway: addr.address
            });
          }
        }
      }
    }

    return ranges;
  }

  /**
   * 计算网络范围
   */
  calculateNetworkRange(ip, netmask) {
    try {
      const ipParts = ip.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);

      // 计算网络地址
      const networkParts = ipParts.map((part, i) => part & maskParts[i]);

      // 计算广播地址
      const broadcastParts = networkParts.map((part, i) => part | (255 - maskParts[i]));

      // 计算 CIDR
      const cidr = maskParts.reduce((acc, part) => {
        return acc + part.toString(2).split('1').length - 1;
      }, 0);

      return {
        network: `${networkParts.join('.')}.0`,
        broadcast: broadcastParts.join('.'),
        cidr: cidr,
        range: `${networkParts.join('.')}.1-${broadcastParts.join('.')}`
      };
    } catch (error) {
      Logger.warn(`计算网络范围失败: ${error.message}`);
      return null;
    }
  }
  /**
   * 扫描网络范围内的主机
   */
  async scanNetworkRange(networkInfo) {
    const hosts = [];

    try {
      // 修复：正确处理网络信息对象
      const networkStr = typeof networkInfo.network === 'string' ?
        networkInfo.network :
        `${networkInfo.network.network || '192.168.1.0'}`;

      const baseIP = networkStr.substring(0, networkStr.lastIndexOf('.'));

      // 并发扫描常见的主机地址
      const scanPromises = [];
      const commonLastOctets = [1, 2, 100, 101, 102, 150, 170, 200, 254]; // 常见的路由器和设备IP

      for (const octet of commonLastOctets) {
        const targetIP = `${baseIP}.${octet}`;
        scanPromises.push(this.checkHostForHA(targetIP));
      }

      // 等待所有扫描完成
      const results = await Promise.allSettled(scanPromises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          hosts.push(result.value);
        }
      }
    } catch (error) {
      Logger.warn(`扫描网络范围失败: ${error.message}`);
    }

    return hosts;
  }

  /**
   * 通过 mDNS/Bonjour 发现服务
   */
  async discoverViaMDNS() {
    Logger.info('🌐 通过 mDNS/Bonjour 发现服务...');
    const hosts = [];

    try {
      // 尝试使用系统命令发现 mDNS 服务
      const services = await this.queryMDNSServices();

      for (const service of services) {
        if (this.isLikelyHomeAssistant(service.name) ||
          this.isLikelyHomeAssistant(service.type)) {

          const haHost = await this.checkHostForHA(service.host, service.port);
          if (haHost) {
            haHost.discoveryMethod = 'mDNS';
            haHost.serviceName = service.name;
            hosts.push(haHost);
          }
        }
      }

    } catch (error) {
      Logger.warn(`mDNS 发现失败: ${error.message}`);
    }

    return hosts;
  }

  /**
   * 查询 mDNS 服务
   */
  async queryMDNSServices() {
    const services = [];

    try {
      // 使用系统命令查询 mDNS 服务
      if (process.platform === 'win32') {
        // Windows: 尝试使用 dns-sd 命令
        try {
          const output = execSync('dns-sd -B _http._tcp', { timeout: 5000, encoding: 'utf8' });
          services.push(...this.parseDNSSDOutput(output));
        } catch (e) {
          Logger.warn('Windows mDNS 查询失败，尝试其他方法');
        }
      } else {
        // Linux/macOS: 使用 avahi-browse 或 dns-sd
        try {
          const output = execSync('avahi-browse -t _http._tcp', { timeout: 5000, encoding: 'utf8' });
          services.push(...this.parseAvahiOutput(output));
        } catch (e) {
          try {
            const output = execSync('dns-sd -B _http._tcp', { timeout: 5000, encoding: 'utf8' });
            services.push(...this.parseDNSSDOutput(output));
          } catch (e2) {
            Logger.warn('mDNS 查询命令不可用');
          }
        }
      }

      // 手动查询常见的 HA 服务名
      const commonHAServices = [
        'homeassistant.local',
        'hassio.local',
        'hass.local',
        'ha.local'
      ];

      for (const serviceName of commonHAServices) {
        try {
          const resolved = await this.resolveMDNSName(serviceName);
          if (resolved) {
            services.push({
              name: serviceName,
              host: resolved.address,
              port: 8123,
              type: '_http._tcp'
            });
          }
        } catch (e) {
          // 忽略解析失败
        }
      }

    } catch (error) {
      Logger.warn(`mDNS 服务查询失败: ${error.message}`);
    }

    return services;
  }

  /**
   * 解析 mDNS 名称到 IP 地址
   */
  async resolveMDNSName(hostname) {
    return new Promise((resolve) => {
      try {
        const dns = require('dns');
        dns.lookup(hostname, { family: 4 }, (err, address) => {
          if (!err && address) {
            resolve({ address, hostname });
          } else {
            resolve(null);
          }
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  /**
   * 检查常见主机地址
   */
  async checkCommonHosts() {
    Logger.info('🏠 检查常见的 Home Assistant 主机地址...');

    const commonHosts = [
      '127.0.0.1',
      'localhost',
      'homeassistant.local',
      'hassio.local',
      'hass.local',
      'ha.local',
      '192.168.1.100',
      '192.168.1.101',
      '192.168.1.200',
      '192.168.0.100',
      '192.168.0.101',
      '192.168.6.170', // 当前已知地址
      '172.30.32.2',   // Docker 常见地址
      '10.0.0.100',
      '10.0.0.101'
    ];

    const hosts = [];
    const checkPromises = commonHosts.map(host => this.checkHostForHA(host));

    const results = await Promise.allSettled(checkPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        result.value.discoveryMethod = 'common-host';
        hosts.push(result.value);
      }
    }

    return hosts;
  }

  /**
   * Ping 已知主机
   */
  async pingKnownHosts() {
    Logger.info('📍 Ping 检查已知主机...');

    const knownHosts = [
      '192.168.6.170',
      '192.168.1.170',
      '10.0.0.170'
    ];

    const hosts = [];

    for (const host of knownHosts) {
      try {
        const isAlive = await this.pingHost(host);
        if (isAlive) {
          const haHost = await this.checkHostForHA(host);
          if (haHost) {
            haHost.discoveryMethod = 'ping';
            hosts.push(haHost);
          }
        }
      } catch (error) {
        // 忽略 ping 失败
      }
    }

    return hosts;
  }

  /**
   * Ping 主机检查连通性
   */
  async pingHost(host) {
    return new Promise((resolve) => {
      try {
        const ping = process.platform === 'win32' ? 'ping -n 1' : 'ping -c 1';
        execSync(`${ping} ${host}`, { timeout: 3000, stdio: 'ignore' });
        resolve(true);
      } catch (error) {
        resolve(false);
      }
    });
  }

  /**
   * 检查主机是否运行 Home Assistant
   */
  async checkHostForHA(host, port = null) {
    const portsToCheck = port ? [port] : this.commonPorts;

    for (const checkPort of portsToCheck) {
      try {
        const result = await this.httpCheck(host, checkPort);
        if (result && this.isHomeAssistantResponse(result)) {
          return {
            host: host,
            port: checkPort,
            protocol: result.protocol,
            version: result.version,
            title: result.title,
            responseTime: result.responseTime,
            confidence: this.calculateConfidence(result),
            lastChecked: Date.now(),
            discoveryMethod: 'http-check'
          };
        }
      } catch (error) {
        // 继续检查下一个端口
      }
    }

    return null;
  }

  /**
   * HTTP 检查
   */
  async httpCheck(host, port) {
    const protocols = port === 443 || port === 8443 ? ['https', 'http'] : ['http', 'https'];

    for (const protocol of protocols) {
      try {
        const startTime = Date.now();
        const result = await this.makeHttpRequest(protocol, host, port);
        const responseTime = Date.now() - startTime;

        return {
          ...result,
          protocol: protocol,
          responseTime: responseTime
        };
      } catch (error) {
        // 尝试下一个协议
      }
    }

    throw new Error(`无法连接到 ${host}:${port}`);
  }

  /**
   * 发起 HTTP 请求
   */
  async makeHttpRequest(protocol, host, port) {
    return new Promise((resolve, reject) => {
      const httpModule = protocol === 'https' ? https : http;
      const timeout = 5000;

      const options = {
        hostname: host,
        port: port,
        path: '/',
        method: 'GET',
        timeout: timeout,
        headers: {
          'User-Agent': 'HA-Tunnel-Discovery/1.0'
        }
      };

      if (protocol === 'https') {
        options.rejectUnauthorized = false; // 允许自签名证书
      }

      const req = httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
          // 限制数据大小
          if (data.length > 10240) { // 10KB
            req.destroy();
          }
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            contentType: res.headers['content-type'] || ''
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.end();
    });
  }

  /**
   * 判断是否为 Home Assistant 响应
   */
  isHomeAssistantResponse(response) {
    if (!response || response.statusCode < 200 || response.statusCode >= 500) {
      return false;
    }

    const { headers, body } = response;
    const content = (body || '').toLowerCase();
    const serverHeader = (headers.server || '').toLowerCase();

    // 检查 HTML 内容
    const haIndicators = [
      'home assistant',
      'homeassistant',
      'hass-frontend',
      'hassio',
      'supervisor'
    ];

    for (const indicator of haIndicators) {
      if (content.includes(indicator) || serverHeader.includes(indicator)) {
        return true;
      }
    }

    // 检查特定的 Home Assistant 特征
    if (content.includes('<title>home assistant</title>') ||
      content.includes('app-drawer-layout') ||
      content.includes('home-assistant-main') ||
      headers['x-ha-access'] ||
      content.includes('frontend_latest')) {
      return true;
    }

    return false;
  }

  /**
   * 计算置信度
   */
  calculateConfidence(response) {
    let confidence = 50; // 基础分数

    const content = (response.body || '').toLowerCase();
    const headers = response.headers || {};

    // Home Assistant 特定标识符
    if (content.includes('home assistant')) confidence += 30;
    if (content.includes('hass-frontend')) confidence += 25;
    if (content.includes('home-assistant-main')) confidence += 20;
    if (headers['x-ha-access']) confidence += 20;
    if (content.includes('frontend_latest')) confidence += 15;

    // 响应时间加分
    if (response.responseTime < 1000) confidence += 10;
    else if (response.responseTime < 3000) confidence += 5;

    // 状态码检查
    if (response.statusCode === 200) confidence += 10;
    else if (response.statusCode === 401) confidence += 5; // 可能需要认证

    return Math.min(confidence, 100);
  }

  /**
   * 去重和排序结果
   */
  deduplicateAndRank(hosts) {
    const hostMap = new Map();

    // 去重，保留置信度最高的
    for (const host of hosts) {
      const key = `${host.host}:${host.port}`;
      if (!hostMap.has(key) || hostMap.get(key).confidence < host.confidence) {
        hostMap.set(key, host);
      }
    }

    // 按置信度排序
    return Array.from(hostMap.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 选择最佳主机
   */
  selectBestHost(hosts) {
    if (hosts.length === 0) return null;

    // 优先选择置信度最高的
    const bestHost = hosts[0];

    // 如果置信度足够高，直接返回
    if (bestHost.confidence >= 80) {
      return bestHost;
    }

    // 否则检查是否有本地主机（更稳定）
    const localHosts = hosts.filter(h =>
      h.host === '127.0.0.1' ||
      h.host === 'localhost' ||
      h.host.startsWith('192.168.') ||
      h.host.startsWith('10.0.') ||
      h.host.startsWith('172.')
    );

    return localHosts.length > 0 ? localHosts[0] : bestHost;
  }

  /**
   * 判断服务名是否像 Home Assistant
   */
  isLikelyHomeAssistant(name) {
    if (!name) return false;
    const lowerName = name.toLowerCase();
    return this.haIndicators.some(indicator => lowerName.includes(indicator));
  }

  /**
   * 解析 DNS-SD 输出
   */
  parseDNSSDOutput(output) {
    const services = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // 简单的解析，实际实现可能需要更复杂的逻辑
      if (line.includes('_http._tcp') && (line.includes('homeassistant') || line.includes('hass'))) {
        const parts = line.split(/\s+/);
        if (parts.length > 3) {
          services.push({
            name: parts[3],
            type: '_http._tcp',
            host: 'unknown', // 需要进一步解析
            port: 8123
          });
        }
      }
    }

    return services;
  }

  /**
   * 解析 Avahi 输出
   */
  parseAvahiOutput(output) {
    const services = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('_http._tcp') && (line.includes('homeassistant') || line.includes('hass'))) {
        const parts = line.split(/\s+/);
        services.push({
          name: parts[parts.length - 1] || 'unknown',
          type: '_http._tcp',
          host: 'unknown',
          port: 8123
        });
      }
    }

    return services;
  }

  /**
   * 获取缓存的发现结果
   */
  getCachedResults() {
    return Array.from(this.discoveredHosts.values());
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.discoveredHosts.clear();
    this.scanResults = [];
  }
}

module.exports = HANetworkDiscovery;
