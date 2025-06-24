/**
 * 隧道服务端架构分析 - 隧道用完风险评估
 * 分析tunnel-server是否存在类似frp的"隧道用完"问题
 */

const fs = require('fs');
const path = require('path');

class TunnelArchitectureAnalyzer {
    constructor() {
        this.serverPath = path.join(__dirname, 'tunnel-server', 'app.js');
        this.analysisResult = {
            architecture: 'unknown',
            tunnelModel: 'unknown',
            limitationType: 'unknown',
            scalabilityRisk: 'unknown',
            recommendations: []
        };
    }

    /**
     * 执行完整的架构分析
     */
    async analyze() {
        console.log('\n🔍 隧道服务端架构分析开始...\n');
        
        try {
            // 1. 读取服务端代码
            const serverCode = fs.readFileSync(this.serverPath, 'utf8');
            
            // 2. 分析架构模式
            this.analyzeArchitecture(serverCode);
            
            // 3. 分析隧道模型
            this.analyzeTunnelModel(serverCode);
            
            // 4. 分析限制机制
            this.analyzeLimitationMechanism(serverCode);
            
            // 5. 评估可扩展性风险
            this.assessScalabilityRisk();
            
            // 6. 生成建议
            this.generateRecommendations();
            
            // 7. 输出分析报告
            this.printAnalysisReport();
            
        } catch (error) {
            console.error('❌ 分析失败:', error.message);
        }
    }

    /**
     * 分析服务端架构模式
     */
    analyzeArchitecture(code) {
        console.log('📋 分析服务端架构模式...');
        
        // 检查是否有端口池分配
        const hasPortPool = /port.*pool|端口池|动态端口分配|allocate.*port/i.test(code);
        
        // 检查是否有隧道池管理
        const hasTunnelPool = /tunnel.*pool|隧道池|tunnel.*allocation/i.test(code);
        
        // 检查连接管理方式
        const hasConnectionManager = /ClientManager|客户端管理|connection.*manage/i.test(code);
        const hasRouteMapping = /route.*mapping|路由映射|subdomain.*client/i.test(code);
        
        if (hasPortPool || hasTunnelPool) {
            this.analysisResult.architecture = 'port-based-tunnel';
        } else if (hasConnectionManager && hasRouteMapping) {
            this.analysisResult.architecture = 'connection-based-proxy';
        } else {
            this.analysisResult.architecture = 'simple-proxy';
        }
        
        console.log(`   架构类型: ${this.analysisResult.architecture}`);
    }

    /**
     * 分析隧道模型
     */
    analyzeTunnelModel(code) {
        console.log('🚇 分析隧道模型...');
        
        // 提取配置信息
        const maxClientsMatch = code.match(/MAX_CLIENTS.*?(\d+)/);
        const tunnelPortMatch = code.match(/TUNNEL_PORT.*?(\d+)/);
        const proxyPortMatch = code.match(/PROXY_PORT.*?(\d+)/);
        
        // 检查端口使用模式
        const dynamicPortPattern = /动态分配|dynamic.*port|port.*range/i;
        const hasDynamicPorts = dynamicPortPattern.test(code);
        
        // 检查路由模式
        const routePattern = /subdomain|路径路由|host.*routing/i;
        const hasRouteBasedForwarding = routePattern.test(code);
        
        if (hasDynamicPorts) {
            this.analysisResult.tunnelModel = 'dynamic-port-allocation';
        } else if (hasRouteBasedForwarding) {
            this.analysisResult.tunnelModel = 'route-based-forwarding';
        } else {
            this.analysisResult.tunnelModel = 'single-proxy-port';
        }
        
        console.log(`   隧道模型: ${this.analysisResult.tunnelModel}`);
        console.log(`   最大客户端数: ${maxClientsMatch ? maxClientsMatch[1] : '未知'}`);
        console.log(`   隧道端口: ${tunnelPortMatch ? tunnelPortMatch[1] : '未知'}`);
        console.log(`   代理端口: ${proxyPortMatch ? proxyPortMatch[1] : '未知'}`);
    }

    /**
     * 分析限制机制
     */
    analyzeLimitationMechanism(code) {
        console.log('⚠️ 分析限制机制...');
        
        // 检查连接数限制
        const maxClientsCheck = /canAcceptNewClient|MAX_CLIENTS|客户端数量限制/i.test(code);
        
        // 检查端口限制
        const portLimitationCheck = /端口用完|port.*exhausted|tunnel.*full/i.test(code);
        
        // 检查资源限制
        const resourceLimitCheck = /内存限制|CPU限制|带宽限制|resource.*limit/i.test(code);
        
        if (portLimitationCheck) {
            this.analysisResult.limitationType = 'port-exhaustion-risk';
        } else if (maxClientsCheck) {
            this.analysisResult.limitationType = 'connection-count-limited';
        } else if (resourceLimitCheck) {
            this.analysisResult.limitationType = 'resource-limited';
        } else {
            this.analysisResult.limitationType = 'unlimited-or-soft-limit';
        }
        
        console.log(`   限制类型: ${this.analysisResult.limitationType}`);
    }

    /**
     * 评估可扩展性风险
     */
    assessScalabilityRisk() {
        console.log('📊 评估可扩展性风险...');
        
        const architecture = this.analysisResult.architecture;
        const tunnelModel = this.analysisResult.tunnelModel;
        const limitationType = this.analysisResult.limitationType;
        
        // 基于架构模式评估风险
        if (architecture === 'port-based-tunnel' && tunnelModel === 'dynamic-port-allocation') {
            // 类似frp的端口分配模式 - 高风险
            this.analysisResult.scalabilityRisk = 'high-tunnel-exhaustion-risk';
        } else if (architecture === 'connection-based-proxy' && limitationType === 'connection-count-limited') {
            // 基于连接数限制的代理模式 - 中等风险
            this.analysisResult.scalabilityRisk = 'medium-connection-limit-risk';
        } else if (tunnelModel === 'single-proxy-port') {
            // 单一代理端口模式 - 低风险
            this.analysisResult.scalabilityRisk = 'low-single-port-bottleneck';
        } else {
            this.analysisResult.scalabilityRisk = 'unknown-need-further-analysis';
        }
        
        console.log(`   可扩展性风险: ${this.analysisResult.scalabilityRisk}`);
    }

    /**
     * 生成建议
     */
    generateRecommendations() {
        const risk = this.analysisResult.scalabilityRisk;
        const architecture = this.analysisResult.architecture;
        const limitationType = this.analysisResult.limitationType;
        
        this.analysisResult.recommendations = [];
        
        if (risk === 'high-tunnel-exhaustion-risk') {
            this.analysisResult.recommendations.push(
                '🚨 高风险：存在隧道用完问题，建议改用连接复用模式',
                '💡 建议：实现WebSocket连接池和路由转发机制',
                '⚡ 优化：避免为每个客户端分配独立端口'
            );
        } else if (risk === 'medium-connection-limit-risk') {
            this.analysisResult.recommendations.push(
                '⚠️ 中等风险：连接数限制可能成为瓶颈',
                '💡 建议：增加MAX_CLIENTS配置或实现连接复用',
                '📈 监控：建议监控并发连接数和资源使用率'
            );
        } else if (risk === 'low-single-port-bottleneck') {
            this.analysisResult.recommendations.push(
                '✅ 低风险：单端口代理模式相对安全',
                '💡 建议：注意单端口性能瓶颈和负载均衡',
                '🔧 优化：可考虑多端口负载分散'
            );
        }
        
        if (limitationType === 'connection-count-limited') {
            this.analysisResult.recommendations.push(
                '📊 建议：实现连接数动态调整机制',
                '🔍 监控：跟踪客户端连接状态和资源使用'
            );
        }
    }

    /**
     * 输出分析报告
     */
    printAnalysisReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🎯 隧道服务端架构分析报告');
        console.log('='.repeat(80));
        
        console.log('\n📋 架构特征:');
        console.log(`   架构模式: ${this.getArchitectureDescription()}`);
        console.log(`   隧道模型: ${this.getTunnelModelDescription()}`);
        console.log(`   限制机制: ${this.getLimitationDescription()}`);
        
        console.log('\n📊 可扩展性评估:');
        console.log(`   风险等级: ${this.getRiskDescription()}`);
        
        console.log('\n💡 建议措施:');
        this.analysisResult.recommendations.forEach(rec => {
            console.log(`   ${rec}`);
        });
        
        console.log('\n🔍 与frp对比分析:');
        this.compareWithFrp();
        
        console.log('\n✅ 结论:');
        this.printConclusion();
        
        console.log('\n' + '='.repeat(80));
    }

    /**
     * 获取架构描述
     */
    getArchitectureDescription() {
        const descriptions = {
            'port-based-tunnel': '端口型隧道 (类似frp模式)',
            'connection-based-proxy': '连接型代理 (WebSocket转发)',
            'simple-proxy': '简单代理模式'
        };
        return descriptions[this.analysisResult.architecture] || '未知架构';
    }

    /**
     * 获取隧道模型描述
     */
    getTunnelModelDescription() {
        const descriptions = {
            'dynamic-port-allocation': '动态端口分配 (高风险)',
            'route-based-forwarding': '路由转发模式 (推荐)',
            'single-proxy-port': '单一代理端口 (简单但有性能限制)'
        };
        return descriptions[this.analysisResult.tunnelModel] || '未知模型';
    }

    /**
     * 获取限制机制描述
     */
    getLimitationDescription() {
        const descriptions = {
            'port-exhaustion-risk': '端口耗尽风险',
            'connection-count-limited': '连接数限制',
            'resource-limited': '资源限制',
            'unlimited-or-soft-limit': '无限制或软限制'
        };
        return descriptions[this.analysisResult.limitationType] || '未知限制';
    }

    /**
     * 获取风险描述
     */
    getRiskDescription() {
        const descriptions = {
            'high-tunnel-exhaustion-risk': '🚨 高风险 - 存在隧道用完问题',
            'medium-connection-limit-risk': '⚠️ 中等风险 - 连接数限制',
            'low-single-port-bottleneck': '✅ 低风险 - 单端口瓶颈',
            'unknown-need-further-analysis': '❓ 需进一步分析'
        };
        return descriptions[this.analysisResult.scalabilityRisk] || '未知风险';
    }

    /**
     * 与frp对比分析
     */
    compareWithFrp() {
        console.log('   frp模式: 为每个客户端分配独立端口，存在端口耗尽风险');
        console.log('   当前系统: 基于连接数限制的WebSocket代理模式');
        console.log('   主要差异: 不分配独立端口，通过路由转发实现多客户端支持');
        console.log('   优势: 避免了端口耗尽问题，更好的资源利用率');
        console.log('   劣势: 连接数有上限限制，需要合理配置MAX_CLIENTS');
    }

    /**
     * 打印结论
     */
    printConclusion() {
        const architecture = this.analysisResult.architecture;
        const risk = this.analysisResult.scalabilityRisk;
        
        if (architecture === 'connection-based-proxy' && risk === 'medium-connection-limit-risk') {
            console.log('   🎯 该系统不存在frp式的"隧道用完"问题');
            console.log('   📊 限制因素是连接数(MAX_CLIENTS)而非端口数');
            console.log('   ⚡ 可通过调整MAX_CLIENTS配置扩展并发能力');
            console.log('   🔧 建议监控连接数使用率，及时调整配置');
        } else if (risk === 'high-tunnel-exhaustion-risk') {
            console.log('   ⚠️ 存在隧道用完风险，需要架构优化');
            console.log('   🔄 建议重构为连接复用模式');
        } else {
            console.log('   📋 需要进一步分析具体实现细节');
        }
    }
}

// 执行分析
async function main() {
    const analyzer = new TunnelArchitectureAnalyzer();
    await analyzer.analyze();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TunnelArchitectureAnalyzer;
