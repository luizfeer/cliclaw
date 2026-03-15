import { randomUUID } from 'crypto'
import type { Bot, Context, Api } from 'grammy'
import type { Storage, Session } from '../storage'
import type { Config } from '../config'
import { askClaude, type TokenUsage } from '../agents/claude'
import { askCodex } from '../agents/codex'
import { mdToTg, splitHtml } from '../utils/markdown'
import { getLang, t } from '../i18n'
import { registerApproval, respondApproval } from './approvals'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatUsage(usage: TokenUsage): string {
  const fmt = (n: number) => n.toLocaleString('en')
  let s = `📊 ↑${fmt(usage.input)} ↓${fmt(usage.output)}`
  if (usage.cacheRead > 0) s += ` 💾${fmt(usage.cacheRead)}`
  if (usage.costUsd != null && usage.costUsd > 0) s += ` $${usage.costUsd.toFixed(4)}`
  // Wrap in backticks so mdToTg renders it as <code> (monospace) in Telegram
  return `\n\`${s}\``
}

const activeLocks = new Set<string>()

async function sendLong(api: Api, chatId: string, text: string, opts: any = {}) {
  const html = mdToTg(text)
  for (const chunk of splitHtml(html)) {
    try {
      await api.sendMessage(chatId, chunk, { ...opts, parse_mode: 'HTML' })
    } catch {
      await api.sendMessage(chatId, text.slice(0, 4000), opts)
    }
  }
}

function makeTopicTitle(userMessage: string, model: string): string {
  const label = model === 'claude' ? 'Claude' : model === 'codex' ? 'Codex' : model
  const firstLine = userMessage.split('\n').at(0) ?? ''
  let title = firstLine.trim().replace(/\s+/g, ' ')
  if (title.length > 40) {
    const cut = title.slice(0, 40).lastIndexOf(' ')
    title = title.slice(0, cut > 10 ? cut : 40).trim()
  }
  return `${title} \u2014 ${label}`
}

async function tryRenameThread(
  api: Api,
  groupId: number,
  threadId: number,
  userMessage: string,
  model: string
) {
  if (!threadId || !groupId) return
  try {
    await api.editForumTopic(groupId, threadId, { name: makeTopicTitle(userMessage, model) })
  } catch {}
}

// ── long-running message logic (runs concurrently — does NOT block grammY) ──
async function processMessage(ctx: Context, storage: Storage, config: Config) {
  const chatId   = String(ctx.chat!.id)
  const text     = ctx.message!.text!
  const threadId = ctx.message!.message_thread_id ?? 0
  const lang     = getLang(ctx)

  if (text.startsWith('/')) return

  let session: Session | null = null
  if (threadId > 0) {
    session = storage.getSessionByThreadId(chatId, threadId)
    if (!session) return
  } else {
    session = storage.getActiveSession(chatId)
    if (!session) {
      await ctx.reply(t(lang, 'noActiveSessionReply'))
      return
    }
  }

  console.log(`[msg] chat=${chatId} thread=${threadId} model=${session.model} sid=${session.id.slice(0, 8)}... "${text.slice(0, 50).replace(/\n/g, '↵')}"`)

  if (activeLocks.has(session.id)) {
    // Session already processing — silently ignore (user sees "Processando..." in topic)
    console.log(`[msg] ignorando — já processando sid=${session.id.slice(0, 8)}...`)
    return
  }

  const isFirstMessage = session.history.length === 0

  activeLocks.add(session.id)
  const replyOpts: any = threadId > 0 ? { message_thread_id: threadId } : {}
  const emoji = session.model === 'claude' ? '🟣' : '🟢'

  const workingMsg = await ctx.reply(
    `${emoji} <i>${t(lang, 'processing')}</i>`,
    { ...replyOpts, parse_mode: 'HTML' }
  )

  const typingLoop = setInterval(async () => {
    try { await ctx.replyWithChatAction('typing', replyOpts) } catch {}
  }, 4000)

  storage.addMessage(chatId, session.id, 'user', text)

  // ── build codex approval handler (only if PERMISSION_MODE=ask) ─────────
  const codexApprovalHandler = (session.model === 'codex' && config.PERMISSION_MODE === 'ask')
    ? (callId: string, cmdStr: string) => {
        const approvalId = randomUUID()
        ctx.api.sendMessage(chatId,
          `🔧 <b>Codex quer executar:</b>\n<code>${escapeHtml(cmdStr)}</code>`,
          {
            ...replyOpts,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [
              [
                { text: '✅ Aprovar',         callback_data: `capprove:${approvalId}` },
                { text: '🔓 Aprovar Sessão',  callback_data: `csession:${approvalId}` },
              ],
              [
                { text: '❌ Negar',     callback_data: `cdeny:${approvalId}` },
                { text: '🛑 Abortar',   callback_data: `cabort:${approvalId}` },
              ],
            ] },
          }
        ).catch(() => {})
        return new Promise<string>((resolve) => registerApproval(approvalId, resolve))
      }
    : undefined

  let response: string
  try {
    let result: { text: string; usage?: TokenUsage }
    if (session.model === 'claude') {
      result = await askClaude(session, text,
        (id) => storage.setClaudeSessionId(chatId, session!.id, id))
    } else {
      result = await askCodex(session, text,
        (id) => storage.setCodexThreadId(chatId, session!.id, id),
        codexApprovalHandler)
    }
    response = (isFirstMessage && result.usage) ? result.text + formatUsage(result.usage) : result.text
  } catch (err: any) {
    response = `\u274c ${lang === 'pt' ? 'Erro' : 'Error'}: ${err.message}`
  } finally {
    clearInterval(typingLoop)
    activeLocks.delete(session.id)
  }

  storage.addMessage(chatId, session.id, 'assistant', response)

  if (isFirstMessage && config.FORUM_GROUP_ID && threadId > 0) {
    await tryRenameThread(ctx.api, Number(config.FORUM_GROUP_ID), threadId, text, session.model)
  }

  try { await ctx.api.deleteMessage(ctx.chat!.id, workingMsg.message_id) } catch {}
  await sendLong(ctx.api, chatId, `${emoji} ${response}`, replyOpts)
}

export function registerMessageHandler(bot: Bot<Context>, storage: Storage, config: Config) {
  bot.on('message:text', (ctx) => {
    // Fire-and-forget: return immediately so grammY can process other updates
    // (e.g. callback_query for approval buttons) while waiting for AI response
    void processMessage(ctx, storage, config).catch(err =>
      console.error('[msg] erro não tratado:', err.message)
    )
  })
}
