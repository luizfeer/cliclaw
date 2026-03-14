import type { Bot, Context, Api } from 'grammy'
import type { Storage, Session } from '../storage'
import type { Config } from '../config'
import { askClaude } from '../agents/claude'
import { askCodex } from '../agents/codex'
import { mdToTg, splitHtml } from '../utils/markdown'

const activeLocks = new Set<string>()

async function sendLong(api: Api, chatId: string, text: string, opts: any = {}) {
  const html = mdToTg(text)
  const chunks = splitHtml(html)
  for (const chunk of chunks) {
    try {
      await api.sendMessage(chatId, chunk, { ...opts, parse_mode: 'HTML' })
    } catch {
      // fallback sem formatação se tiver tag inválida
      await api.sendMessage(chatId, text.slice(0, 4000), opts)
    }
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
        await ctx.reply('⚠️ Nenhuma sessão ativa. Use /nova ou /nova codex.')
        return
      }
    }

    if (activeLocks.has(session.id)) {
      const opts: any = threadId > 1 ? { message_thread_id: threadId } : {}
      await ctx.reply('⚙️ Ainda processando a mensagem anterior, aguarde...', opts)
      return
    }

    activeLocks.add(session.id)
    const replyOpts: any = threadId > 1 ? { message_thread_id: threadId } : {}
    const emoji = session.model === 'claude' ? '🟣' : '🟢'

    // Feedback imediato
    const workingMsg = await ctx.reply(`${emoji} <i>Processando...</i>`, {
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
      response = `❌ Erro: ${err.message}`
    } finally {
      clearInterval(typingLoop)
      activeLocks.delete(session.id)
    }

    storage.addMessage(chatId, session.id, 'assistant', response)

    // Apagar "Processando..." e enviar resposta formatada
    try { await ctx.api.deleteMessage(ctx.chat.id, workingMsg.message_id) } catch {}

    await sendLong(ctx.api, chatId, `${emoji} ${response}`, replyOpts)
  })
}
