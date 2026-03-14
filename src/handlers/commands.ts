import type { Bot, Context } from 'grammy'
import type { Storage } from '../storage'
import type { Config } from '../config'
import { killSession } from '../agents/claude'
import { formatTelegramMarkdown, splitTelegramMessage, TELEGRAM_MARKDOWN_OPTS } from '../telegram'
import { dockerHelpText, pm2HelpText, runDockerCommand, runPm2Command } from '../admin'

function isAdmin(ctx: Context, config: Config): boolean {
  const userId = String(ctx.from?.id || '')
  return config.TELEGRAM_ADMIN_IDS.includes(userId)
}

async function replyAdminGuard(ctx: Context, config: Config) {
  if (config.TELEGRAM_ADMIN_IDS.length === 0) {
    await ctx.reply(
      formatTelegramMarkdown(
        '⚠️ Comandos admin desabilitados. Configure `TELEGRAM_ADMIN_IDS` no `.env` com seu user id do Telegram.'
      ),
      TELEGRAM_MARKDOWN_OPTS
    )
    return false
  }

  if (!isAdmin(ctx, config)) {
    await ctx.reply(
      formatTelegramMarkdown('⛔ Você não tem permissão para usar este comando.'),
      TELEGRAM_MARKDOWN_OPTS
    )
    return false
  }

  return true
}

async function replyMarkdownChunks(ctx: Context, text: string) {
  const chunks = splitTelegramMessage(formatTelegramMarkdown(text))
  for (const chunk of chunks) {
    if (!chunk) continue
    await ctx.reply(chunk, TELEGRAM_MARKDOWN_OPTS)
  }
}

async function createSession(
  ctx: Context,
  storage: Storage,
  config: Config,
  chatId: string,
  model: 'claude' | 'codex'
) {
  const emoji = model === 'claude' ? '🟣' : '🟢'
  const name  = model === 'claude' ? 'Claude' : 'Codex'
  const n = storage.listSessions(chatId).length + 1
  const topicName = `${emoji} ${name} #${n}`

  if (config.FORUM_GROUP_ID) {
    try {
      const groupId = Number(config.FORUM_GROUP_ID)
      const topic = await ctx.api.createForumTopic(groupId, topicName)
      const session = storage.createSession(chatId, model, topic.message_thread_id)
      // Mensagem de boas-vindas dentro do tópico recém-criado
      await ctx.api.sendMessage(groupId,
        formatTelegramMarkdown(`${emoji} **${session.name}** pronta!\nEnvie sua mensagem aqui dentro.`),
        { message_thread_id: topic.message_thread_id, ...TELEGRAM_MARKDOWN_OPTS }
      )
      return session
    } catch (err: any) {
      await ctx.reply(`⚠️ Não consegui criar tópico: ${err.message}\nVerifique se o bot é admin do grupo.`)
      return null
    }
  }

  // Modo DM (sem grupo de fórum)
  const session = storage.createSession(chatId, model, 0)
  await ctx.reply(
    formatTelegramMarkdown(`${emoji} **${session.name}** criada! Pode enviar mensagens.`),
    TELEGRAM_MARKDOWN_OPTS
  )
  return session
}

export function registerCommands(bot: Bot<Context>, storage: Storage, config: Config) {

  // /start
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'usuário'
    await ctx.reply(
      formatTelegramMarkdown(
        `👋 Olá, **${name}**! Bem-vindo ao **OpenClaw** 🦀\n\n` +
        `🟣 **Claude** - Anthropic (subscription)\n` +
        `🟢 **Codex** - OpenAI CLI\n\n` +
        '`/nova` - nova sessão Claude (padrão)\n' +
        '`/nova codex` - nova sessão Codex\n' +
        '`/sessoes` - listar sessões\n' +
        '`/limpar` - reiniciar sessão atual\n' +
        '`/status` - ver sessão ativa\n' +
        '`/id` - ver ID deste chat\n' +
        '`/docker` - gerenciar containers\n' +
        '`/pm2` - gerenciar processos PM2'
      ),
      TELEGRAM_MARKDOWN_OPTS
    )
  })

  // /id
  bot.command('id', async (ctx) => {
    const chat = ctx.chat
    const threadId = ctx.message?.message_thread_id
    let msg = `🆔 **Informações do chat**\n\n`
    msg += `• Chat ID: \`${chat.id}\`\n`
    msg += `• Tipo: \`${chat.type}\`\n`
    if ('title' in chat) msg += `• Nome: ${chat.title}\n`
    if (threadId) msg += `• Thread ID: \`${threadId}\`\n`
    msg += `• Seu user ID: \`${ctx.from?.id}\`\n`
    if (config.FORUM_GROUP_ID)
      msg += `\n✅ Modo Fórum ativo: \`${config.FORUM_GROUP_ID}\``
    else
      msg += `\n💡 Para Modo Fórum: \`FORUM_GROUP_ID=${chat.id}\``
    await ctx.reply(formatTelegramMarkdown(msg), TELEGRAM_MARKDOWN_OPTS)
  })

  // /nova [claude|codex]  — cria tópico IMEDIATAMENTE
  bot.command('nova', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const arg = ctx.match?.trim().toLowerCase()
    const model: 'claude' | 'codex' = arg === 'codex' ? 'codex' : 'claude'

    // Confirma recebimento rapidamente no canal onde /nova foi enviado
    const ack = await ctx.reply(`⏳ Criando sessão ${model === 'claude' ? '🟣 Claude' : '🟢 Codex'}...`)

    const session = await createSession(ctx, storage, config, chatId, model)

    // Remove a mensagem de ack se criou tópico com sucesso (fica limpo)
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ack.message_id)
    } catch {}

    if (!session) return
  })

  // /sessoes
  bot.command('sessoes', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const sessions = storage.listSessions(chatId)
    if (sessions.length === 0) {
      await ctx.reply('Nenhuma sessão. Use /nova ou /nova codex.')
      return
    }
    const active = storage.getActiveSession(chatId)
    let msg = '📋 **Sessões:**\n'
    for (const s of sessions) {
      const tick = s.id === active?.id ? '✅' : '•'
      const thread = s.threadId ? ` [tópico #${s.threadId}]` : ''
      msg += `${tick} **${s.name}**${thread} - ${s.history.length} msgs\n`
    }
    await ctx.reply(formatTelegramMarkdown(msg), TELEGRAM_MARKDOWN_OPTS)
  })

  // /limpar
  bot.command('limpar', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply('Nenhuma sessão ativa.'); return }
    killSession(session.id)
    storage.clearSession(chatId, session.id)
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(`🧹 **${session.name}** reiniciada!`),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  })

  // /status
  bot.command('status', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply('Nenhuma sessão ativa. Use /nova.'); return }
    const emoji = session.model === 'claude' ? '🟣' : '🟢'
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(
      `${emoji} **${session.name}**\n` +
      `💬 ${session.history.length} mensagens\n` +
      `🕐 ${new Date(session.createdAt).toLocaleString('pt-BR')}\n` +
      `🔖 Tópico: ${session.threadId || 'DM'}`
      ),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  })

  // /ajuda
  bot.command('ajuda', async (ctx) => {
    await ctx.reply(
      formatTelegramMarkdown(
        `🦀 **OpenClaw**\n\n` +
        '`/nova` - nova sessão Claude\n' +
        '`/nova codex` - nova sessão Codex\n' +
        '`/sessoes` - listar sessões\n' +
        '`/limpar` - reiniciar sessão/tópico atual\n' +
        '`/status` - ver sessão ativa\n' +
        '`/id` - ver ID do chat\n' +
        '`/docker` - gerenciar containers\n' +
        '`/pm2` - gerenciar processos PM2'
      ),
      TELEGRAM_MARKDOWN_OPTS
    )
  })

  // /docker
  bot.command('docker', async (ctx) => {
    if (!await replyAdminGuard(ctx, config)) return

    const args = ctx.match?.trim() || ''
    if (!args) {
      await ctx.reply(formatTelegramMarkdown(dockerHelpText()), TELEGRAM_MARKDOWN_OPTS)
      return
    }

    await ctx.replyWithChatAction('typing')

    try {
      const output = await runDockerCommand(args)
      await replyMarkdownChunks(ctx, output)
    } catch (err: any) {
      await ctx.reply(
        formatTelegramMarkdown(`❌ ${err.message}\n\n${dockerHelpText()}`),
        TELEGRAM_MARKDOWN_OPTS
      )
    }
  })

  // /pm2
  bot.command('pm2', async (ctx) => {
    if (!await replyAdminGuard(ctx, config)) return

    const args = ctx.match?.trim() || ''
    if (!args) {
      await ctx.reply(formatTelegramMarkdown(pm2HelpText()), TELEGRAM_MARKDOWN_OPTS)
      return
    }

    await ctx.replyWithChatAction('typing')

    try {
      const output = await runPm2Command(args)
      await replyMarkdownChunks(ctx, output)
    } catch (err: any) {
      await ctx.reply(
        formatTelegramMarkdown(`❌ ${err.message}\n\n${pm2HelpText()}`),
        TELEGRAM_MARKDOWN_OPTS
      )
    }
  })
}
