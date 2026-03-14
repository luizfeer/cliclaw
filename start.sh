#!/bin/bash
export PATH="$HOME/.bun/bin:$HOME/.npm-global/bin:$PATH"
cd ~/openclaw
pm2 start ecosystem.config.js
pm2 save
echo 'OpenClaw iniciado!'
