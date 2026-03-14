#!/bin/bash
export PATH="$HOME/.npm-global/bin:$PATH"
pm2 logs openclaw --lines 50
