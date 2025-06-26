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
        // 修复：正确显示网段信息
        const networkDisplay = range.network ? 
          (typeof range.network === 'string' ? range.network : 
           `${range.network.network}/${range.network.cidr}`) : 
          `${range.interface} 网段`;
        Logger.info(`🔍 扫描网段: ${networkDisplay}`);
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

    // 定义网络接口优先级（数字越小优先级越高）
    const interfacePriority = {
      // 真实网络接口（最高优先级）
      'WLAN': 1,
      'WiFi': 1, 
      'Wi-Fi': 1,
      'Ethernet': 2,
      'eth0': 2,
      'eth1': 2,
      'en0': 2,
      'en1': 2,
      'wlan0': 1,
      'wlan1': 1,
      // Docker 网络（低优先级）
      'docker0': 9,
      'br-': 9,
      // VMware 网络（中等优先级，用于开发环境）
      'VMware': 7,
      'vEthernet': 7,
      // 其他虚拟网络
      'vboxnet': 8,
      'Hyper-V': 8
    };

    // 获取所有候选网络接口
    const candidates = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1') {
          // 过滤掉明显的 Docker 内部网络
          if (this.isDockerNetwork(addr.address)) {
            Logger.debug(`跳过 Docker 网络: ${name} - ${addr.address}`);
            continue;
          }

          const network = this.calculateNetworkRange(addr.address, addr.netmask);
          if (network) {
            // 确定接口优先级
            let priority = 5; // 默认优先级
            for (const [pattern, prio] of Object.entries(interfacePriority)) {
              if (name.toLowerCase().includes(pattern.toLowerCase())) {
                priority = prio;
                break;
              }
            }

            candidates.push({
              interface: name,
              network: network,
              gateway: addr.address,
              priority: priority,
              isLikelyLAN: this.isLikelyLANNetwork(addr.address)
            });
          }
        }
      }
    }

    // 按优先级排序，LAN 网络优先
    candidates.sort((a, b) => {
      // 首先按是否为 LAN 网络排序
      if (a.isLikelyLAN !== b.isLikelyLAN) {
        return a.isLikelyLAN ? -1 : 1;
      }
      // 然后按优先级排序
      return a.priority - b.priority;
    });

    // 限制扫描的网络数量，优先扫描前3个
    const maxNetworks = 3;
    ranges.push(...candidates.slice(0, maxNetworks));

    Logger.info(`网络接口筛选结果: ${ranges.length}/${candidates.length} 个网络将被扫描`);
    ranges.forEach((range, index) => {
      Logger.debug(`  ${index + 1}. ${range.interface} - ${range.gateway} (LAN: ${range.isLikelyLAN}, 优先级: ${range.priority})`);
    });

    return ranges;
  }

  /**
   * 判断是否为 Docker 网络
   */
  isDockerNetwork(ip) {
    // Docker 默认网络范围
    const dockerRanges = [
      '172.17.0.0/16',  // docker0
      '172.18.0.0/16',  // 自定义网络
      '172.19.0.0/16',
      '172.20.0.0/16',
      '172.30.0.0/16',  // 用户日志中的网段
      '172.31.0.0/16'
    ];

    const ipParts = ip.split('.').map(Number);
    
    for (const range of dockerRanges) {
      const [network, cidr] = range.split('/');
      const networkParts = network.split('.').map(Number);
      const cidrNum = parseInt(cidr);
      
      // 简单的网络匹配
      if (cidrNum >= 16) {
        if (ipParts[0] === networkParts[0] && ipParts[1] === networkParts[1]) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 判断是否可能是局域网网络
   */
  isLikelyLANNetwork(ip) {
    const ipParts = ip.split('.').map(Number);
    
    // 常见的局域网网段
    const lanRanges = [
      { start: [192, 168], end: [192, 168] },  // 192.168.x.x
      { start: [10, 0], end: [10, 255] },      // 10.x.x.x
      { start: [172, 16], end: [172, 31] }     // 172.16.x.x - 172.31.x.x (排除 Docker 常用的)
    ];

    for (const range of lanRanges) {
      if (ipParts[0] >= range.start[0] && ipParts[0] <= range.end[0] &&
          ipParts[1] >= range.start[1] && ipParts[1] <= range.end[1]) {
        
        // 特殊处理：排除明显的 Docker 网段
        if (ipParts[0] === 172 && ipParts[1] >= 30) {
          return false; // 172.30.x.x 及以上通常是 Docker
        }
        
        return true;
      }
    }
    
    return false;
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
        network: networkParts.join('.'),  // 修复：移除多余的 .0
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
      let baseIP;
      if (networkInfo.network) {
        if (typeof networkInfo.network === 'string') {
          // 如果是字符串形式的网络地址
          baseIP = networkInfo.network.substring(0, networkInfo.network.lastIndexOf('.'));
        } else if (typeof networkInfo.network === 'object' && networkInfo.network.network) {
          // 如果是对象形式的网络信息
          baseIP = networkInfo.network.network.substring(0, networkInfo.network.network.lastIndexOf('.'));
        }
      }
      
      // 如果无法获取基础IP，使用网关地址作为基础
      if (!baseIP && networkInfo.gateway) {
        baseIP = networkInfo.gateway.substring(0, networkInfo.gateway.lastIndexOf('.'));
      }
      
      // 默认使用常见的网段
      if (!baseIP) {
        baseIP = '192.168.1';
        Logger.warn('无法确定网段，使用默认网段 192.168.1.x');
      }

      Logger.debug(`扫描基础网段: ${baseIP}.x`);

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
   * 判断是否为 Home Assistant 响应（更严格的检测）
   */
  isHomeAssistantResponse(response) {
    if (!response || response.statusCode < 200 || response.statusCode >= 500) {
      return false;
    }

    const { headers, body } = response;
    const content = (body || '').toLowerCase();
    const serverHeader = (headers.server || '').toLowerCase();

    // 必须包含明确的 Home Assistant 标识
    const strongIndicators = [
      'home assistant',
      'homeassistant',
      'hass-frontend',
      'home-assistant-main',
      'frontend_latest'
    ];

    let hasStrongIndicator = false;
    for (const indicator of strongIndicators) {
      if (content.includes(indicator)) {
        hasStrongIndicator = true;
        break;
      }
    }

    // 如果没有强指标，直接返回false
    if (!hasStrongIndicator) {
      return false;
    }

    // 检查HTML结构特征
    const hasHAStructure = content.includes('<title>home assistant</title>') ||
                          content.includes('app-drawer-layout') ||
                          content.includes('home-assistant-main') ||
                          headers['x-ha-access'] ||
                          content.includes('manifest.json');

    // 排除明显不是HA的响应
    const excludePatterns = [
      'nginx',
      'apache',
      'iis',
      'tomcat',
      'jetty',
      'error 404',
      'not found',
      'access denied'
    ];

    for (const pattern of excludePatterns) {
      if (content.includes(pattern) || serverHeader.includes(pattern)) {
        return false;
      }
    }

    return hasStrongIndicator && (hasHAStructure || response.statusCode === 200);
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

    // 按优先级排序主机
    const sortedHosts = hosts.sort((a, b) => {
      // 1. 优先选择真正的局域网地址（排除Docker内部地址）
      const aIsRealLAN = this.isRealLANAddress(a.host);
      const bIsRealLAN = this.isRealLANAddress(b.host);
      if (aIsRealLAN && !bIsRealLAN) return -1;
      if (!aIsRealLAN && bIsRealLAN) return 1;

      // 2. 优先选择 .local 域名（mDNS）
      const aIsLocal = a.host.endsWith('.local');
      const bIsLocal = b.host.endsWith('.local');
      if (aIsLocal && !bIsLocal) return -1;
      if (!aIsLocal && bIsLocal) return 1;

      // 3. 按置信度排序
      return b.confidence - a.confidence;
    });

    return sortedHosts[0];
  }

  /**
   * 判断是否为真正的局域网地址（排除Docker内部网络）
   */
  isRealLANAddress(host) {
    if (!host) return false;
    
    // 本地地址
    if (host === '127.0.0.1' || host === 'localhost') return true;
    
    // mDNS 地址
    if (host.endsWith('.local')) return true;
    
    // 私有网络地址，但排除常见的Docker网络
    if (host.startsWith('192.168.')) return true;  // 家庭网络
    if (host.startsWith('10.0.') || host.startsWith('10.1.')) return true; // 企业网络
    
    // 排除Docker常用的网段
    if (host.startsWith('172.17.') ||  // Docker默认网桥
        host.startsWith('172.18.') ||  // Docker自定义网桥
        host.startsWith('172.19.') ||
        host.startsWith('172.20.') ||
        host.startsWith('172.30.') ||  // 常见Docker网段
        host.startsWith('172.31.')) {
      return false;
    }
    
    // 其他172网段可能是真实局域网
    if (host.startsWith('172.')) {
      const parts = host.split('.');
      if (parts.length >= 2) {
        const second = parseInt(parts[1]);
        // RFC 1918: 172.16.0.0/12 (172.16.0.0 到 172.31.255.255)
        // 但排除常见的Docker使用的范围
        return second >= 16 && second <= 31 && second !== 17 && second !== 30 && second !== 31;
      }
    }
    
    return false;
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
