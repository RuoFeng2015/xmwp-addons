/**
 * 隧道服务端并发能力优化分析
 * 提供具体的配置优化建议，避免"隧道用完"问题
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class TunnelConcurrencyOptimizer {
    constructor() {
        this.serverConfigPath = path.join(__dirname, 'tunnel-server', 'app.js');
        this.systemSpecs = this.getSystemSpecs();
        this.currentConfig = {};
        this.optimizedConfig = {};
        this.recommendations = [];
    }

    /**
     * 获取系统规格
     */
    getSystemSpecs() {
        return {
            totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
            cpuCores: os.cpus().length,
            platform: os.platform(),
            arch: os.arch(),
            maxFileDescriptors: this.estimateMaxFD()
        };
    }

    /**
     * 估算最大文件描述符数
     */
    estimateMaxFD() {
        // 根据不同平台估算
        if (os.platform() === 'linux') {
            return 65536; // 典型的Linux ulimit
        } else if (os.platform() === 'win32') {
            return 2048;  // Windows默认限制较低
        } else {
            return 10240; // macOS和其他系统
        }
    }

    /**
     * 分析当前配置
     */
    analyzeCurrentConfig() {
        console.log('📊 分析当前配置...');
        
        try {
            const serverCode = fs.readFileSync(this.serverConfigPath, 'utf8');
            
            // 提取当前配置
            const maxClientsMatch = serverCode.match(/MAX_CLIENTS.*?(\d+)/);
            const heartbeatMatch = serverCode.match(/HEARTBEAT_INTERVAL.*?(\d+)/);
            const timeoutMatch = serverCode.match(/CLIENT_TIMEOUT.*?(\d+)/);
            
            this.currentConfig = {
                maxClients: maxClientsMatch ? parseInt(maxClientsMatch[1]) : 10,
                heartbeatInterval: heartbeatMatch ? parseInt(heartbeatMatch[1]) : 30000,
                clientTimeout: timeoutMatch ? parseInt(timeoutMatch[1]) : 60000,
                tunnelPort: 3080,
                proxyPort: 3081,
                adminPort: 3082
            };
            
            console.log('   当前配置:');
            console.log(`   - 最大客户端数: ${this.currentConfig.maxClients}`);
            console.log(`   - 心跳间隔: ${this.currentConfig.heartbeatInterval}ms`);
            console.log(`   - 客户端超时: ${this.currentConfig.clientTimeout}ms`);
            
        } catch (error) {
            console.error('   ❌ 配置分析失败:', error.message);
        }
    }

    /**
     * 计算优化配置
     */
    calculateOptimizedConfig() {
        console.log('\n🎯 计算优化配置...');
        
        const { totalMemory, cpuCores, maxFileDescriptors } = this.systemSpecs;
        
        // 基于系统资源计算最优配置
        let recommendedMaxClients;
        
        // 内存限制：每个客户端连接大约占用1-2MB内存
        const memoryBasedLimit = Math.floor((totalMemory * 1024 * 0.7) / 2); // 使用70%内存，每连接2MB
        
        // CPU限制：每核心处理约50-100个并发连接
        const cpuBasedLimit = cpuCores * 75;
        
        // 文件描述符限制：每个客户端可能需要2-4个FD
        const fdBasedLimit = Math.floor(maxFileDescriptors * 0.8 / 3); // 使用80%FD，每连接3个FD
        
        // 取最小值作为安全限制
        recommendedMaxClients = Math.min(memoryBasedLimit, cpuBasedLimit, fdBasedLimit);
        
        // 设置合理的上下界
        recommendedMaxClients = Math.max(10, Math.min(1000, recommendedMaxClients));
        
        this.optimizedConfig = {
            maxClients: recommendedMaxClients,
            heartbeatInterval: this.calculateOptimalHeartbeat(recommendedMaxClients),
            clientTimeout: this.calculateOptimalTimeout(recommendedMaxClients),
            connectionPoolSize: Math.ceil(recommendedMaxClients * 1.2), // 连接池稍大一些
            bufferSize: this.calculateOptimalBufferSize(),
            workerProcesses: this.calculateOptimalWorkers(cpuCores)
        };
        
        console.log(`   推荐最大客户端数: ${recommendedMaxClients}`);
        console.log(`   - 基于内存限制: ${memoryBasedLimit}`);
        console.log(`   - 基于CPU限制: ${cpuBasedLimit}`);
        console.log(`   - 基于FD限制: ${fdBasedLimit}`);
    }

    /**
     * 计算最优心跳间隔
     */
    calculateOptimalHeartbeat(maxClients) {
        // 客户端越多，心跳间隔应该越长，避免过多的网络开销
        if (maxClients <= 50) return 30000;   // 30秒
        if (maxClients <= 200) return 45000;  // 45秒
        return 60000; // 60秒
    }

    /**
     * 计算最优超时时间
     */
    calculateOptimalTimeout(maxClients) {
        // 客户端超时应该是心跳间隔的2-3倍
        const heartbeat = this.calculateOptimalHeartbeat(maxClients);
        return heartbeat * 2.5;
    }

    /**
     * 计算最优缓冲区大小
     */
    calculateOptimalBufferSize() {
        // 基于内存大小调整缓冲区
        const { totalMemory } = this.systemSpecs;
        if (totalMemory >= 8) return 64 * 1024;  // 64KB
        if (totalMemory >= 4) return 32 * 1024;  // 32KB
        return 16 * 1024; // 16KB
    }

    /**
     * 计算最优工作进程数
     */
    calculateOptimalWorkers(cpuCores) {
        // 通常工作进程数 = CPU核心数 * 1.5 到 2
        return Math.min(cpuCores * 2, 8); // 最多8个工作进程
    }

    /**
     * 生成具体建议
     */
    generateRecommendations() {
        console.log('\n💡 生成优化建议...');
        
        const current = this.currentConfig;
        const optimized = this.optimizedConfig;
        
        // 最大客户端数建议
        if (optimized.maxClients > current.maxClients) {
            this.recommendations.push({
                type: 'config',
                priority: 'high',
                title: '增加最大客户端连接数',
                current: `MAX_CLIENTS: ${current.maxClients}`,
                recommended: `MAX_CLIENTS: ${optimized.maxClients}`,
                reason: '基于系统资源分析，可以支持更多并发连接',
                impact: '提升系统并发处理能力'
            });
        }
        
        // 心跳间隔建议
        if (optimized.heartbeatInterval !== current.heartbeatInterval) {
            this.recommendations.push({
                type: 'config',
                priority: 'medium',
                title: '优化心跳间隔',
                current: `HEARTBEAT_INTERVAL: ${current.heartbeatInterval}ms`,
                recommended: `HEARTBEAT_INTERVAL: ${optimized.heartbeatInterval}ms`,
                reason: '根据客户端数量调整心跳频率，减少网络开销',
                impact: '降低网络开销，提升性能'
            });
        }
        
        // 架构建议
        this.recommendations.push({
            type: 'architecture',
            priority: 'high',
            title: '确认架构优势',
            current: '基于连接数限制的代理模式',
            recommended: '保持当前架构，避免端口分配模式',
            reason: '当前架构避免了frp式的端口耗尽问题',
            impact: '避免"隧道用完"风险，提升可扩展性'
        });
        
        // 监控建议
        this.recommendations.push({
            type: 'monitoring',
            priority: 'medium',
            title: '实施并发监控',
            current: '基础日志记录',
            recommended: '实时连接数和资源使用率监控',
            reason: '及时发现并发瓶颈和资源不足',
            impact: '提前预警，避免服务中断'
        });
        
        // 扩展性建议
        if (optimized.maxClients > 100) {
            this.recommendations.push({
                type: 'scaling',
                priority: 'medium',
                title: '考虑集群部署',
                current: '单实例部署',
                recommended: '多实例负载均衡部署',
                reason: '单实例处理大量并发连接时性能可能受限',
                impact: '水平扩展，支持更大规模部署'
            });
        }
    }

    /**
     * 生成配置文件
     */
    generateConfigFile() {
        const configContent = `/**
 * 隧道服务端优化配置
 * 基于系统资源自动生成的推荐配置
 */

// 系统规格分析
const SYSTEM_SPECS = ${JSON.stringify(this.systemSpecs, null, 2)};

// 优化后的配置
const OPTIMIZED_CONFIG = {
  // 连接配置
  MAX_CLIENTS: ${this.optimizedConfig.maxClients},
  HEARTBEAT_INTERVAL: ${this.optimizedConfig.heartbeatInterval},
  CLIENT_TIMEOUT: ${this.optimizedConfig.clientTimeout},
  
  // 性能配置
  CONNECTION_POOL_SIZE: ${this.optimizedConfig.connectionPoolSize},
  BUFFER_SIZE: ${this.optimizedConfig.bufferSize},
  WORKER_PROCESSES: ${this.optimizedConfig.workerProcesses},
  
  // 原有配置保持不变
  TUNNEL_PORT: ${this.currentConfig.tunnelPort},
  PROXY_PORT: ${this.currentConfig.proxyPort},
  ADMIN_PORT: ${this.currentConfig.adminPort}
};

// 应用说明
console.log('📋 配置优化说明:');
console.log('1. MAX_CLIENTS 从 ${this.currentConfig.maxClients} 优化为 ${this.optimizedConfig.maxClients}');
console.log('2. 心跳间隔调整为 ${this.optimizedConfig.heartbeatInterval}ms');
console.log('3. 该配置避免了端口型"隧道用完"问题');
console.log('4. 基于连接数限制，可通过调整MAX_CLIENTS扩展');

module.exports = OPTIMIZED_CONFIG;
`;
        
        const configPath = path.join(__dirname, 'tunnel-server-optimized-config.js');
        fs.writeFileSync(configPath, configContent);
        console.log(`\n📄 优化配置已生成: ${configPath}`);
    }

    /**
     * 输出完整报告
     */
    printOptimizationReport() {
        console.log('\n' + '='.repeat(80));
        console.log('⚡ 隧道服务端并发优化报告');
        console.log('='.repeat(80));
        
        console.log('\n🖥️ 系统规格:');
        console.log(`   内存: ${this.systemSpecs.totalMemory}GB`);
        console.log(`   CPU核心: ${this.systemSpecs.cpuCores}`);
        console.log(`   最大文件描述符: ${this.systemSpecs.maxFileDescriptors}`);
        console.log(`   平台: ${this.systemSpecs.platform} (${this.systemSpecs.arch})`);
        
        console.log('\n📊 配置对比:');
        console.log(`   最大客户端数: ${this.currentConfig.maxClients} → ${this.optimizedConfig.maxClients}`);
        console.log(`   心跳间隔: ${this.currentConfig.heartbeatInterval}ms → ${this.optimizedConfig.heartbeatInterval}ms`);
        console.log(`   客户端超时: ${this.currentConfig.clientTimeout}ms → ${this.optimizedConfig.clientTimeout}ms`);
        
        console.log('\n💡 优化建议:');
        this.recommendations.forEach((rec, index) => {
            console.log(`\n   ${index + 1}. ${rec.title} [${rec.priority.toUpperCase()}]`);
            console.log(`      当前: ${rec.current}`);
            console.log(`      建议: ${rec.recommended}`);
            console.log(`      原因: ${rec.reason}`);
            console.log(`      影响: ${rec.impact}`);
        });
        
        console.log('\n🎯 "隧道用完"问题分析:');
        console.log('   ✅ 当前架构不存在frp式的端口耗尽问题');
        console.log('   📊 限制因素是连接数而非端口数');
        console.log('   ⚡ 可通过调整MAX_CLIENTS配置水平扩展');
        console.log('   🔧 建议实施监控和动态调整机制');
        
        console.log('\n📈 扩展性评估:');
        const scalabilityLevel = this.assessScalabilityLevel();
        console.log(`   当前扩展性: ${scalabilityLevel.current}`);
        console.log(`   优化后扩展性: ${scalabilityLevel.optimized}`);
        console.log(`   理论最大并发: ${scalabilityLevel.theoretical}`);
        
        console.log('\n' + '='.repeat(80));
    }

    /**
     * 评估扩展性等级
     */
    assessScalabilityLevel() {
        const current = this.currentConfig.maxClients;
        const optimized = this.optimizedConfig.maxClients;
        const theoretical = Math.min(this.systemSpecs.maxFileDescriptors / 3, 1000);
        
        return {
            current: this.getScalabilityLabel(current),
            optimized: this.getScalabilityLabel(optimized),
            theoretical: `${Math.floor(theoretical)} 并发连接`
        };
    }

    /**
     * 获取扩展性标签
     */
    getScalabilityLabel(value) {
        if (value < 20) return `低并发 (${value})`;
        if (value < 100) return `中等并发 (${value})`;
        if (value < 500) return `高并发 (${value})`;
        return `超高并发 (${value})`;
    }

    /**
     * 执行完整优化分析
     */
    async optimize() {
        console.log('⚡ 隧道服务端并发优化分析开始...\n');
        
        try {
            this.analyzeCurrentConfig();
            this.calculateOptimizedConfig();
            this.generateRecommendations();
            this.generateConfigFile();
            this.printOptimizationReport();
            
        } catch (error) {
            console.error('❌ 优化分析失败:', error.message);
        }
    }
}

// 执行优化分析
async function main() {
    const optimizer = new TunnelConcurrencyOptimizer();
    await optimizer.optimize();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TunnelConcurrencyOptimizer;
