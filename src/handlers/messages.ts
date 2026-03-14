import type { Bot, Context, Api } from 'grammy'
import type { Storage, Session } from '../storage'
import type { Config } from '../config'
import { askClaude } from '../agents/claude'
import { askCodex } from '../agents/codex'
import { mdToTg, splitHtml } from '../utils/markdown'

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
  return `${title} — ${label}`
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
  } catch {
    // silently ignore — non-critical
  }
}

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
        await ctx.reply('\u26a0\ufe0f No active session. Use /new or /nova.')
        return
      }
    }

    if (activeLocks.has(session.id)) {
      const opts: any = threadId > 0 ? { message_thread_id: threadId } : {}
      await ctx.reply('\u2699\ufe0f Still processing the previous message, please wait...', opts)
      return
    }

    const isFirstMessage = session.history.length === 0

    activeLocks.add(session.id)
    const replyOpts: any = threadId > 0 ? { message_thread_id: threadId } : {}
    const emoji = session.model === 'claude' ? '\U0001f7e3' : '\U0001f7e2'

    const workingMsg = await ctx.reply(`${emoji} <i>Processing...</i>`, {
      ...replyOpts, parse_mode: 'HTML'
    })

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
      response = `\u274c Error: ${err.message}`
    } finally {
      clearInterval(typingLoop)
      activeLocks.delete(session.id)
    }

    storage.addMessage(chatId, session.id, 'assistant', response)

    if (isFirstMessage && config.FORUM_GROUP_ID && threadId > 0) {
      await tryRenameThread(ctx.api, Number(config.FORUM_GROUP_ID), threadId, text, session.model)
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, workingMsg.message_id) } catch {}
    await sendLong(ctx.api, chatId, `${emoji} ${response}`, replyOpts)
  })
}
