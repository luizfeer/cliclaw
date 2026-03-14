module.exports = {
  apps: [{
    name: 'cliclaw',
    script: 'tsx',
    args: 'index.ts',
    cwd: '/home/ubuntu/openclaw',
    interpreter: 'none',
    env: {
      NODE_ENV: 'production',
      PATH: '/home/ubuntu/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    error_file: '/home/ubuntu/openclaw/logs/error.log',
    out_file:   '/home/ubuntu/openclaw/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
