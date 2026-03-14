const path = require('path')
const HOME = process.env.HOME || process.env.USERPROFILE || '/root'

module.exports = {
  apps: [{
    name: 'cliclaw',
    script: 'index.ts',
    interpreter: 'node',
    interpreterArgs: '--require tsx/cjs',
    exec_mode: 'fork',
    instances: 1,
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PATH: process.env.PATH || '',
      HOME,
    },
    watch: false,
    autorestart: true,
    max_memory_restart: '300M',
    error_file: path.join(__dirname, 'logs/error.log'),
    out_file:   path.join(__dirname, 'logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
