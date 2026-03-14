module.exports = {
  apps: [{
    name: 'openclaw',
    script: '/home/ubuntu/.bun/bin/bun',
    args: 'run /home/ubuntu/openclaw/index.ts',
    cwd: '/home/ubuntu/openclaw',
    env: {
      NODE_ENV: 'production',
      PATH: '/home/ubuntu/.bun/bin:/home/ubuntu/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    error_file: '/home/ubuntu/openclaw/logs/error.log',
    out_file: '/home/ubuntu/openclaw/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    interpreter: 'none',
  }]
}
