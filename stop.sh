#!/bin/bash
export PATH="$HOME/.npm-global/bin:$PATH"
pm2 stop openclaw && echo 'OpenClaw parado.'
