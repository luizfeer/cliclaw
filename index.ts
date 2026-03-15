import { Bot } from 'grammy'
import { loadConfig } from './src/config'
import { Storage } from './src/storage'
import { registerCommands } from './src/handlers/commands'
import { registerMessageHandler } from './src/handlers/messages'
import { respondApproval } from './src/handlers/approvals'

const config = loadConfig()
const storage = new Storage(config.DATA_DIR)
const bot = new Bot(config.TELEGRAM_BOT_TOKEN)

// ── debug: log every incoming update type ──────────────────────────────────
bot.use(async (ctx, next) => {
  const type = ctx.updateType ?? 'unknown'
  const extra = type === 'callback_query'
    ? ` data="${(ctx.callbackQuery?.data ?? '').slice(0, 40)}"`
    : type === 'message'
    ? ` text="${(ctx.message?.text ?? '').slice(0, 30)}"`
    : ''
  console.log(`[update] ${type}${extra}`)
  return next()
})

registerCommands(bot, storage, config)
registerMessageHandler(bot, storage, config)

// ── Codex exec approval callbacks ──────────────────────────────────────────
const APPROVAL_PREFIXES: Record<string, { decision: string; label: string }> = {
  capprove:  { decision: 'approved',             label: '✅ Aprovado'  },
  csession:  { decision: 'approved_for_session', label: '🔓 Sessão aprovada!' },
  cdeny:     { decision: 'denied',               label: '❌ Negado'    },
  cabort:    { decision: 'abort',                label: '🛑 Abortado'  },
}

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data
  console.log(`[callback] recebido: ${data.slice(0, 60)}`)

  const colonIdx  = data.indexOf(':')
  const prefix    = data.slice(0, colonIdx)
  const approvalId = data.slice(colonIdx + 1)
  const entry     = APPROVAL_PREFIXES[prefix]
  if (!entry) return

  console.log(`[callback] clicou ${prefix} id=${approvalId.slice(0, 8)}...`)

  const found = respondApproval(approvalId, entry.decision)
  console.log(`[callback] respondApproval found=${found} decision=${entry.decision}`)

  try {
    await ctx.answerCallbackQuery({ text: entry.label })
  } catch (e: any) {
    console.error(`[callback] answerCallbackQuery falhou: ${e.message}`)
  }
  try {
    if (found) {
      const origText = ctx.callbackQuery.message?.text ?? ''
      const cmdLine  = origText.split('\n').slice(1).join('\n').trim()
      const escaped  = cmdLine.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      await ctx.editMessageText(
        `🔧 <b>Codex quer executar:</b>\n<code>${escaped}</code>\n\n${entry.label}`,
        { parse_mode: 'HTML' }
      )
    }
  } catch (e: any) {
    console.error(`[callback] editMessageText falhou: ${e.message}`)
  }
})

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
}).catch(async (e) => {
  const code = (e as any)?.error_code ?? (e as any)?.code
  if (code === 409) {
    console.warn('⚠️  409 Conflict — outra instância ativa. Aguardando 35s para o long-poll expirar...')
    await new Promise(r => setTimeout(r, 35_000))
  } else {
    console.error('[OpenClaw] Erro fatal:', e)
  }
  process.exit(1)
})
