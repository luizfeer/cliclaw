#!/usr/bin/env node
'use strict'

const { execSync, spawnSync } = require('child_process')
const readline = require('readline')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ─── root dir of the installed package ───────────────────────────────────────
const PKG_DIR = path.resolve(__dirname, '..')

// ─── colors (works without dependencies) ─────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
}
const ok   = (s) => console.log(`${c.green}${c.bold}✔${c.reset} ${s}`)
const info = (s) => console.log(`${c.cyan}→${c.reset} ${s}`)
const warn = (s) => console.log(`${c.yellow}⚠${c.reset} ${s}`)
const err  = (s) => console.error(`${c.red}✖${c.reset} ${s}`)
const hdr  = (s) => console.log(`\n${c.bold}${c.cyan}${s}${c.reset}\n`)

// ─── prompt helper ────────────────────────────────────────────────────────────
function prompt(question, defaultVal = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    const hint = defaultVal ? ` ${c.gray}[${defaultVal}]${c.reset}` : ''
    rl.question(`${c.bold}${question}${c.reset}${hint}: `, answer => {
      rl.close()
      resolve(answer.trim() || defaultVal)
    })
  })
}

async function promptYN(question, defaultVal = 'Y') {
  const hint = defaultVal === 'Y' ? '[Y/n]' : '[y/N]'
  const answer = await prompt(`${question} ${hint}`, defaultVal)
  return answer.toLowerCase().startsWith('y')
}

// ─── shell helper ─────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8', ...opts })
  } catch (e) {
    if (opts.throws !== false) throw e
    return null
  }
}

function which(bin) {
  try {
    execSync(os.platform() === 'win32' ? `where ${bin}` : `which ${bin}`, { stdio: 'pipe' })
    return true
  } catch { return false }
}

// ─── banner ───────────────────────────────────────────────────────────────────
function banner() {
  console.clear()
  console.log(`${c.cyan}${c.bold}`)
  console.log('   ____  _ _        ____  _')
  console.log('  / ___|| (_)      / ___|| | __ ___      __')
  console.log(' | |    | | |_____| |    | |/ _` \\ \\ /\\ / /')
  console.log(' | |___ | | |_____| |___ | | (_| |\\ V  V /')
  console.log('  \\____||_|_|      \\____||_|\\__,_| \\_/\\_/')
  console.log(c.reset)
  console.log(`  ${c.bold}Telegram bridge for AI CLIs${c.reset}`)
  console.log(`  ${c.gray}github.com/luizfeer/cliclaw${c.reset}\n`)
}

// ─── commands ─────────────────────────────────────────────────────────────────
async function cmdSetup() {
  banner()

  // 1. Node check
  hdr('1/5 — Node.js')
  const nodeVer = process.version
  const major = parseInt(nodeVer.slice(1))
  if (major >= 18) ok(`Node.js ${nodeVer}`)
  else { err(`Node.js ${nodeVer} found but v18+ required. Please upgrade.`); process.exit(1) }

  // 2. tsx + pm2
  hdr('2/5 — Dependencies')
  if (!which('tsx')) {
    info('Installing tsx...')
    run('npm install -g tsx', { silent: true })
    ok('tsx installed')
  } else ok('tsx ready')

  if (!which('pm2')) {
    info('Installing pm2...')
    run('npm install -g pm2', { silent: true })
    ok('pm2 installed')
  } else ok('pm2 ready')

  // 3. AI CLIs
  hdr('3/5 — AI CLI agents')
  console.log(`  ${c.cyan}🟣 Claude Code${c.reset}  — requires claude.ai subscription`)
  console.log(`  ${c.cyan}🟢 Codex${c.reset}        — requires OpenAI/ChatGPT account`)
  console.log(`  ${c.yellow}🔜 OpenCode${c.reset}    — coming soon\n`)

  const installClaude = await promptYN('Install Claude Code?', 'Y')
  const installCodex  = await promptYN('Install Codex?', 'N')

  if (installClaude) {
    if (which('claude')) { ok('Claude Code already installed') }
    else {
      info('Installing Claude Code...')
      run('npm install -g @anthropic-ai/claude-code')
      ok('Claude Code installed')
    }
    console.log()
    warn('Authentication required (opens browser):')
    if (await promptYN("Run 'claude' login now?", 'Y')) {
      spawnSync('claude', [], { stdio: 'inherit', shell: true })
    } else warn("Remember to run: claude")
  }

  if (installCodex) {
    if (which('codex')) { ok('Codex already installed') }
    else {
      info('Installing Codex...')
      run('npm install -g @openai/codex')
      ok('Codex installed')
    }
    console.log()
    if (await promptYN("Run 'codex login' now?", 'Y')) {
      spawnSync('codex', ['login'], { stdio: 'inherit', shell: true })
    } else warn("Remember to run: codex login")
  }

  if (!installClaude && !installCodex) {
    warn('No CLI installed — bot will show setup instructions until you add one.')
  }

  // 4. .env
  hdr('4/5 — Configuration')

  const envFile = path.join(PKG_DIR, '.env')
  const existing = {}
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(l => {
      const [k, ...v] = l.split('=')
      if (k && v.length) existing[k.trim()] = v.join('=').trim()
    })
    info('Existing .env found — press Enter to keep current values.\n')
  }

  console.log(`${c.bold}Telegram Bot Token${c.reset} ${c.gray}(from @BotFather → /newbot)${c.reset}`)
  let token = ''
  while (!token) {
    token = await prompt('TELEGRAM_BOT_TOKEN', existing.TELEGRAM_BOT_TOKEN || '')
    if (!token) warn('Token cannot be empty.')
  }

  console.log(`\n${c.bold}Forum Group ID${c.reset} ${c.gray}(optional — needed for forum topics)${c.reset}`)
  console.log(`${c.gray}  Start bot first, send /id in your group, paste the Chat ID here.${c.reset}`)
  const forumId = await prompt('FORUM_GROUP_ID (Enter to skip)', existing.FORUM_GROUP_ID || '')

  console.log(`\n${c.bold}Permission mode${c.reset}`)
  console.log(`  ${c.bold}1) auto${c.reset}    — always skip prompts ${c.cyan}(recommended)${c.reset}`)
  console.log(`  ${c.bold}2) session${c.reset} — ask per /new session`)
  console.log(`  ${c.bold}3) ask${c.reset}     — prefix message with ! to allow\n`)
  const permChoice = await prompt('Choose [1/2/3]', existing.PERMISSION_MODE === 'session' ? '2' : existing.PERMISSION_MODE === 'ask' ? '3' : '1')
  const permMode = permChoice === '2' ? 'session' : permChoice === '3' ? 'ask' : 'auto'
  ok(`Permission mode: ${permMode}`)

  const dataDir = path.join(PKG_DIR, 'data')
  let envContent = `TELEGRAM_BOT_TOKEN=${token}\n`
  if (forumId) envContent += `FORUM_GROUP_ID=${forumId}\n`
  envContent += `PERMISSION_MODE=${permMode}\n`
  envContent += `DATA_DIR=${dataDir}\n`
  fs.writeFileSync(envFile, envContent, 'utf8')
  ok(`.env saved to ${envFile}`)

  // 5. PM2
  hdr('5/5 — Start bot')

  if (await promptYN('Start Cli-Claw with PM2?', 'Y')) {
    try { run('pm2 delete cliclaw', { throws: false, silent: true }) } catch {}
    process.chdir(PKG_DIR)
    run('pm2 start ecosystem.config.js')
    run('pm2 save')
    ok('Cli-Claw is running!')

    if (os.platform() !== 'win32') {
      console.log()
      info('To enable auto-start on boot, run:')
      console.log(`  ${c.bold}pm2 startup${c.reset}  ${c.gray}(then follow the printed command)${c.reset}`)
    } else {
      if (await promptYN('Install pm2-windows-startup for auto-start?', 'Y')) {
        run('npm install -g pm2-windows-startup', { silent: true })
        run('pm2-startup install')
        ok('Auto-start configured')
      }
    }
  }

  // Done
  console.log(`\n${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`)
  console.log(`${c.green}${c.bold} ✔ Cli-Claw is ready!${c.reset}`)
  console.log(`${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`)
  console.log(`  ${c.bold}cliclaw start${c.reset}   — start bot`)
  console.log(`  ${c.bold}cliclaw stop${c.reset}    — stop bot`)
  console.log(`  ${c.bold}cliclaw status${c.reset}  — show status`)
  console.log(`  ${c.bold}cliclaw logs${c.reset}    — tail logs`)
  console.log(`  ${c.bold}cliclaw setup${c.reset}   — re-run this wizard\n`)
  console.log(`  ${c.cyan}Open Telegram and send /start to your bot!${c.reset}`)
  if (!forumId) {
    console.log()
    warn("Don't forget to set FORUM_GROUP_ID in .env, then run: cliclaw restart")
  }
  console.log()
}

function cmdPm2(args) {
  process.chdir(PKG_DIR)
  const r = spawnSync('pm2', args, { stdio: 'inherit', shell: true })
  process.exit(r.status ?? 0)
}

function cmdLogs() {
  spawnSync('pm2', ['logs', 'cliclaw', '--lines', '50'], { stdio: 'inherit', shell: true })
}

function cmdHelp() {
  banner()
  console.log('Usage: cliclaw <command>\n')
  console.log(`  ${c.bold}setup${c.reset}    Interactive setup wizard`)
  console.log(`  ${c.bold}start${c.reset}    Start the bot via PM2`)
  console.log(`  ${c.bold}stop${c.reset}     Stop the bot`)
  console.log(`  ${c.bold}restart${c.reset}  Restart the bot`)
  console.log(`  ${c.bold}status${c.reset}   Show PM2 status`)
  console.log(`  ${c.bold}logs${c.reset}     Tail logs`)
  console.log(`  ${c.bold}update${c.reset}   Pull latest version\n`)
}

// ─── router ───────────────────────────────────────────────────────────────────
const [,, cmd = 'help', ...rest] = process.argv

switch (cmd) {
  case 'setup':   cmdSetup().catch(e => { err(e.message); process.exit(1) }); break
  case 'start':   cmdPm2(['start', path.join(PKG_DIR, 'ecosystem.config.js')]); break
  case 'stop':    cmdPm2(['stop', 'cliclaw']); break
  case 'restart': cmdPm2(['restart', 'cliclaw', '--update-env']); break
  case 'status':  cmdPm2(['status']); break
  case 'logs':    cmdLogs(); break
  case 'update':
    info('Pulling latest...')
    run(`npm update -g cliclaw`)
    ok('Updated! Run: cliclaw restart')
    break
  default: cmdHelp(); break
}
