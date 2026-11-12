module.exports = {
  apps: [{
    name: 'tradingweb',
    script: 'pnpm',
    args: 'next start',
    // 热部署（版本更新模块）：release.sh 通过 TRADINGWEB_CWD 指向 current 软链；
    // 未设置时保持传统单目录部署路径。
    cwd: process.env.TRADINGWEB_CWD || '/opt/tradingweb',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000,
    max_memory_restart: '1G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
  }],
};
