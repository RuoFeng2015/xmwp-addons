module.exports = {
  apps: [
    {
      name: 'tunnel-server',
      script: 'tunnel-server.js',
      instances: 1, // 单实例运行，避免端口冲突
      exec_mode: 'fork',
      watch: false, // 生产环境不建议开启watch
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        // 服务端口配置
        TUNNEL_PORT: 8080,      // 隧道连接端口
        PROXY_PORT: 8081,       // HTTP代理端口  
        ADMIN_PORT: 8082,       // 管理后台端口

        // 安全配置
        JWT_SECRET: 'your-secret-key-change-me',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'your-secure-password', // 请修改为强密码

        // 连接配置
        MAX_CLIENTS: 10,

        // SSL配置 (可选)
        SSL_ENABLED: false,
        // SSL_KEY_PATH: '/path/to/private.key',
        // SSL_CERT_PATH: '/path/to/certificate.crt',

        // 日志配置
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        TUNNEL_PORT: 8080,
        PROXY_PORT: 8081,
        ADMIN_PORT: 8082,
        JWT_SECRET: 'dev-secret-key',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'password',
        MAX_CLIENTS: 5,
        SSL_ENABLED: false,
        LOG_LEVEL: 'debug'
      }
    }
  ]
};
