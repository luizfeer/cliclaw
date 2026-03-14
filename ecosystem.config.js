const path = require('path')
const HOME = process.env.HOME || '/root'

module.exports = {
  apps: [{
    name: 'cliclaw',
    script: 'tsx',
    args: 'index.ts',
    cwd: __dirname,
    interpreter: 'none',
    env: {
      NODE_ENV: 'production',
      PATH: `${HOME}/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      HOME,
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    error_file: path.join(__dirname, 'logs/error.log'),
    out_file:   path.join(__dirname, 'logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
