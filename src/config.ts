import { existsSync, readFileSync } from 'fs'

export interface Config {
  TELEGRAM_BOT_TOKEN: string
  ANTHROPIC_API_KEY: string
  OPENAI_API_KEY: string
  DATA_DIR: string
  FORUM_GROUP_ID: string   // ID do grupo Telegram com Forum Mode (opcional)
  TELEGRAM_ADMIN_IDS: string[]
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

  const config: Config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY  || '',
    OPENAI_API_KEY:     process.env.OPENAI_API_KEY     || '',
    DATA_DIR:           process.env.DATA_DIR           || (process.env.HOME + '/openclaw/data'),
    FORUM_GROUP_ID:     process.env.FORUM_GROUP_ID     || '',
    TELEGRAM_ADMIN_IDS: (process.env.TELEGRAM_ADMIN_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
  }

  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN não configurado no .env')
  }

  return config
}
