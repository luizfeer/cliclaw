import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

export type AgentName = 'claude' | 'codex'
export type PermissionMode = 'auto' | 'session' | 'ask'

export interface Config {
  TELEGRAM_BOT_TOKEN: string
  DATA_DIR: string
  FORUM_GROUP_ID: string
  TELEGRAM_ADMIN_IDS: string[]
  PERMISSION_MODE: PermissionMode
  availableAgents: AgentName[]
}

function checkAgents(): AgentName[] {
  const available: AgentName[] = []
  const tryWhich = (bin: string) => {
    try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true } catch { return false }
  }
  if (tryWhich('claude')) available.push('claude')
  if (tryWhich('codex'))  available.push('codex')
  return available
}

export function loadConfig(): Config {
  const envFile = process.env.HOME + '/openclaw/.env'
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key) process.env[key] = val
    }
  }

  const rawMode = (process.env.PERMISSION_MODE || 'auto').toLowerCase()
  const permMode: PermissionMode =
    rawMode === 'session' ? 'session' :
    rawMode === 'ask'     ? 'ask'     : 'auto'

  const config: Config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    DATA_DIR:           process.env.DATA_DIR || (process.env.HOME + '/openclaw/data'),
    FORUM_GROUP_ID:     process.env.FORUM_GROUP_ID || '',
    TELEGRAM_ADMIN_IDS: (process.env.TELEGRAM_ADMIN_IDS || '')
      .split(',').map(id => id.trim()).filter(Boolean),
    PERMISSION_MODE:    permMode,
    availableAgents:    checkAgents(),
  }

  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in .env')
  }

  if (config.availableAgents.length === 0) {
    console.warn('\n⚠️  No AI CLIs found in PATH. Run /start in Telegram for setup instructions.\n')
  } else {
    console.log(`✅ Available agents: ${config.availableAgents.join(', ')} | Permission mode: ${config.PERMISSION_MODE}`)
  }

  return config
}
