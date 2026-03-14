import { Bot } from 'grammy'
import { loadConfig } from './src/config'
import { Storage } from './src/storage'
import { registerCommands } from './src/handlers/commands'
import { registerMessageHandler } from './src/handlers/messages'

const config = loadConfig()
const storage = new Storage(config.DATA_DIR)
const bot = new Bot(config.TELEGRAM_BOT_TOKEN)

registerCommands(bot, storage, config)
registerMessageHandler(bot, storage, config)

bot.catch((err) => {
  const ctx = err.ctx
  console.error(`[OpenClaw] Erro em update ${ctx.update.update_id}: ${err.error}`)
})

console.log('🦀 OpenClaw iniciando...')
if (config.FORUM_GROUP_ID) {
  console.log(`📋 Modo Fórum: grupo ${config.FORUM_GROUP_ID}`)
} else {
  console.log('💬 Modo DM (sem FORUM_GROUP_ID configurado)')
}

bot.start({
  onStart: (info) => console.log(`✅ Bot @${info.username} online!`),
})
