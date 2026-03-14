import type { Bot, Context, Api } from 'grammy'
import type { Storage, Session } from '../storage'
import type { Config } from '../config'
import { askClaude } from '../agents/claude'
import { askCodex } from '../agents/codex'
import { mdToTg, splitHtml } from '../utils/markdown'

const activeLocks = new Set<string>()

// ─── helpers ────────────────────────────────────────────────────────────────

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

/** Generates a short topic title from the first user message */
function makeTopicTitle(userMessage: string, model: string): string {
  const label = model === 'claude' ? 'Claude' : model === 'codex' ? 'Codex' : model
  // First line only, max 40 chars, break at last word boundary
  let title = userMessage.split('\n')[0].trim().replace(/\s+/g, ' ')
  if (title.length > 40) {
    const cut = title.slice(0, 40).lastIndexOf(' ')
    title = title.slice(0, cut > 10 ? cut : 40).trim()
  }
  return `${title} — ${label}`
}

/** Renames the forum topic after the first message exchange */
async function tryRenameThread(
  api: Api,
  groupId: number,
  threadId: number,
  userMessage: string,
  model: string
) {
  if (!threadId || !groupId) return
  try {
    const name = makeTopicTitle(userMessage, model)
    await api.editForumTopic(groupId, threadId, { name })
  } catch {
    // silently ignore — topic rename is non-critical
  }
}

// ─── message handler ─────────────────────────────────────────────────────────

export function registerMessageHandler(bot: Bot<Context>, storage: Storage, config: Config) {
  bot.on('message:text', async (ctx) => {
    const chatId   = String(ctx.chat.id)
    const text     = ctx.message.text
    const threadId = ctx.message.message_thread_id ?? 0

    if (text.startsWith('/')) return

    let session: Session | null = null
    if (threadId > 0) {
      session = storage.getSessionByThreadId(chatId, threadId)
      if (!session) return
    } else {
      session = storage.getActiveSession(chatId)
      if (!session) {
        await ctx.reply('⚠️ No active session. Use /new or /nova.')
        return
      }
    }

    if (activeLocks.has(session.id)) {
      const opts: any = threadId > 0 ? { message_thread_id: threadId } : {}
      await ctx.reply('⚙️ Still processing the previous message, please wait...', opts)
      return
    }

    // Is this the first message? (rename topic after response)
    const isFirstMessage = session.history.length === 0

    activeLocks.add(session.id)
    const replyOpts: any = threadId > 0 ? { message_thread_id: threadId } : {}
    const emoji = session.model === 'claude' ? '🟣' : '🟢'

    // Immediate feedback
    const workingMsg = await ctx.reply(`${emoji} <i>Processing...</i>`, {
      ...replyOpts, parse_mode: 'HTML'
    })

    // Typing loop
    const typingLoop = setInterval(async () => {
      try { await ctx.replyWithChatAction('typing', replyOpts) } catch {}
    }, 4000)

    storage.addMessage(chatId, session.id, 'user', text)

    let response: string
    try {
      if (session.model === 'claude') {
        response = await askClaude(session, text,
          (id) => storage.setClaudeSessionId(chatId, session!.id, id))
      } else {
        response = await askCodex(session, text,
          (id) => storage.setCodexThreadId(chatId, session!.id, id))
      }
    } catch (err: any) {
      response = `❌ Error: ${err.message}`
    } finally {
      clearInterval(typingLoop)
      activeLocks.delete(session.id)
    }

    storage.addMessage(chatId, session.id, 'assistant', response)

    // Rename topic on first exchange
    if (isFirstMessage && config.FORUM_GROUP_ID && threadId > 0) {
      await tryRenameThread(
        ctx.api,
        Number(config.FORUM_GROUP_ID),
        threadId,
        text,
        session.model
      )
    }

    // Delete "Processing..." and send formatted response
    try { await ctx.api.deleteMessage(ctx.chat.id, workingMsg.message_id) } catch {}
    await sendLong(ctx.api, chatId, `${emoji} ${response}`, replyOpts)
  })
}
