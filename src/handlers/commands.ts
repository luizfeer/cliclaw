import type { Bot, Context } from 'grammy'
import type { Storage } from '../storage'
import type { Config, AgentName } from '../config'
import { killSession } from '../agents/claude'
import { formatTelegramMarkdown, splitTelegramMessage, TELEGRAM_MARKDOWN_OPTS } from '../telegram'
import { dockerHelpText, pm2HelpText, runDockerCommand, runPm2Command } from '../admin'
import { getLang, t } from '../i18n'

// ─── helpers ────────────────────────────────────────────────────────────────

function isAdmin(ctx: Context, config: Config): boolean {
  return config.TELEGRAM_ADMIN_IDS.includes(String(ctx.from?.id || ''))
}

async function guardAdmin(ctx: Context, config: Config): Promise<boolean> {
  const lang = getLang(ctx)
  if (config.TELEGRAM_ADMIN_IDS.length === 0) {
    await ctx.reply(formatTelegramMarkdown(t(lang, 'adminDisabled')), TELEGRAM_MARKDOWN_OPTS)
    return false
  }
  if (!isAdmin(ctx, config)) {
    await ctx.reply(formatTelegramMarkdown(t(lang, 'noPermission')), TELEGRAM_MARKDOWN_OPTS)
    return false
  }
  return true
}

async function replyChunks(ctx: Context, text: string) {
  for (const chunk of splitTelegramMessage(formatTelegramMarkdown(text))) {
    if (chunk) await ctx.reply(chunk, TELEGRAM_MARKDOWN_OPTS)
  }
}

// ─── setup guide ────────────────────────────────────────────────────────────

function setupGuide(available: AgentName[], lang: 'pt' | 'en'): string {
  const hasClaude = available.includes('claude')
  const hasCodex  = available.includes('codex')
  if (hasClaude && hasCodex) return ''

  let msg = t(lang, 'setupTitle')
  if (!hasClaude && !hasCodex) {
    msg += t(lang, 'setupNone')
  } else {
    const readyName = hasClaude ? '🟣 Claude' : '🟢 Codex'
    msg += t(lang, 'setupOneReady', readyName)
  }
  if (!hasClaude) msg += t(lang, 'setupClaudeInstructions')
  if (!hasCodex)  msg += t(lang, 'setupCodexInstructions')
  msg += t(lang, 'setupOpenCodeSoon')
  msg += t(lang, 'setupRestart')
  return msg
}

// ─── create session ──────────────────────────────────────────────────────────

async function createSession(
  ctx: Context,
  storage: Storage,
  config: Config,
  chatId: string,
  model: AgentName
) {
  const lang  = getLang(ctx)
  const emoji = model === 'claude' ? '🟣' : '🟢'
  const n = storage.listSessions(chatId).length + 1
  const topicName = `${emoji} ${model === 'claude' ? 'Claude' : 'Codex'} #${n}`

  if (config.FORUM_GROUP_ID) {
    try {
      const groupId = Number(config.FORUM_GROUP_ID)
      const topic   = await ctx.api.createForumTopic(groupId, topicName)
      const session = storage.createSession(chatId, model, topic.message_thread_id)
      await ctx.api.sendMessage(
        groupId,
        formatTelegramMarkdown(`${emoji} **${session.name}** ${t(lang, 'sessionReady', '')}`),
        { message_thread_id: topic.message_thread_id, ...TELEGRAM_MARKDOWN_OPTS }
      )
      return session
    } catch (err: any) {
      await ctx.reply(t(lang, 'topicCreateError', err.message))
      return null
    }
  }

  const session = storage.createSession(chatId, model, 0)
  await ctx.reply(
    formatTelegramMarkdown(`${emoji} **${session.name}** ${t(lang, 'sessionCreatedDM', '')}`),
    TELEGRAM_MARKDOWN_OPTS
  )
  return session
}

// ─── register commands ───────────────────────────────────────────────────────

export function registerCommands(bot: Bot<Context>, storage: Storage, config: Config) {

  // /start
  bot.command('start', async (ctx) => {
    const lang = getLang(ctx)
    const name = ctx.from?.first_name || (lang === 'pt' ? 'usuário' : 'there')
    const { availableAgents: av } = config

    const setup = setupGuide(av, lang)
    if (setup) {
      await replyChunks(ctx, t(lang, 'welcome', name) + '\n\n' + setup)
      return
    }

    const agentLines = [
      av.includes('claude') ? '🟣 **Claude** — Anthropic (subscription)' : null,
      av.includes('codex')  ? '🟢 **Codex** — OpenAI CLI' : null,
      '🔜 **OpenCode** — ' + (lang === 'pt' ? 'em breve' : 'coming soon'),
    ].filter(Boolean).join('\n')

    await replyChunks(ctx,
      t(lang, 'welcome', name) + '\n\n' +
      agentLines + '\n\n' +
      t(lang, 'helpCommands')
    )
  })

  // /new + /nova
  const novaHandler = async (ctx: Context) => {
    const lang   = getLang(ctx)
    const chatId = String(ctx.chat!.id)
    const arg    = String(ctx.match || '').trim().toLowerCase()
    const model: AgentName = arg === 'codex' ? 'codex' : 'claude'
    const { availableAgents: av } = config

    if (av.length === 0) {
      await replyChunks(ctx, setupGuide(av, lang)); return
    }

    if (!av.includes(model)) {
      const other = model === 'claude' ? 'codex' : 'claude'
      let msg = t(lang, 'modelNotConfigured', model === 'claude' ? 'Claude' : 'Codex') + '\n\n'
      if (av.includes(other)) {
        msg += t(lang, 'useOtherModel', `/new ${other}`, other)
      }
      msg += setupGuide(av, lang)
      await replyChunks(ctx, msg); return
    }

    const label = model === 'claude' ? '🟣 Claude' : '🟢 Codex'
    const ack = await ctx.reply(t(lang, 'creatingSession', label))
    await createSession(ctx, storage, config, chatId, model)
    try { await ctx.api.deleteMessage(ctx.chat!.id, ack.message_id) } catch {}
  }
  bot.command('nova', novaHandler)
  bot.command('new',  novaHandler)

  // /sessoes + /sessions
  const sessoesHandler = async (ctx: Context) => {
    const lang     = getLang(ctx)
    const chatId   = String(ctx.chat!.id)
    const sessions = storage.listSessions(chatId)
    if (sessions.length === 0) {
      await ctx.reply(t(lang, 'noSessions')); return
    }
    const active = storage.getActiveSession(chatId)
    let msg = t(lang, 'sessionsTitle')
    for (const s of sessions) {
      const tick   = s.id === active?.id ? '✅' : '•'
      const thread = s.threadId ? ` [${t(lang, 'topicLabel', s.threadId)}]` : ''
      msg += `${tick} **${s.name}**${thread} — ${t(lang, 'msgCount', s.history.length)}\n`
    }
    await replyChunks(ctx, msg)
  }
  bot.command('sessoes',  sessoesHandler)
  bot.command('sessions', sessoesHandler)

  // /limpar + /clear
  const limparHandler = async (ctx: Context) => {
    const lang     = getLang(ctx)
    const chatId   = String(ctx.chat!.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session  = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply(t(lang, 'noActiveSession')); return }
    killSession(session.id)
    storage.clearSession(chatId, session.id)
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(t(lang, 'sessionCleared', `**${session.name}**`)),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  }
  bot.command('limpar', limparHandler)
  bot.command('clear',  limparHandler)

  // /status
  bot.command('status', async (ctx) => {
    const lang     = getLang(ctx)
    const chatId   = String(ctx.chat!.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session  = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply(t(lang, 'noActiveSessionUseNew')); return }
    const emoji = session.model === 'claude' ? '🟣' : '🟢'
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(
        `${emoji} **${session.name}**\n` +
        `${t(lang, 'statusMessages', session.history.length)}\n` +
        `🕐 ${new Date(session.createdAt).toLocaleString()}\n` +
        `${t(lang, 'statusTopic', session.threadId || 'DM')}`
      ),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  })

  // /ajuda + /help
  const ajudaHandler = async (ctx: Context) => {
    const lang = getLang(ctx)
    const { availableAgents: av } = config
    const agentLines = [
      av.includes('claude')
        ? `🟣 ${t(lang, 'agentReady', 'Claude')}`
        : `🟣 ${t(lang, 'agentNotConfigured', 'Claude')}`,
      av.includes('codex')
        ? `🟢 ${t(lang, 'agentReady', 'Codex')}`
        : `🟢 ${t(lang, 'agentNotConfigured', 'Codex')}`,
      '🔜 OpenCode — ' + (lang === 'pt' ? 'em breve' : 'coming soon'),
    ].join('\n')
    await replyChunks(ctx,
      `🦀 **Cli-Claw**\n\n${agentLines}\n\n${t(lang, 'helpCommands')}`
    )
  }
  bot.command('ajuda', ajudaHandler)
  bot.command('help',  ajudaHandler)

  // /id
  bot.command('id', async (ctx) => {
    const lang     = getLang(ctx)
    const chat     = ctx.chat
    const threadId = ctx.message?.message_thread_id
    let msg = t(lang, 'chatInfoTitle')
    msg += `• Chat ID: \`${chat.id}\`\n`
    msg += `• ${t(lang, 'chatInfoType')}: \`${chat.type}\`\n`
    if ('title' in chat) msg += `• ${t(lang, 'chatInfoName')}: ${chat.title}\n`
    if (threadId)        msg += `• ${t(lang, 'chatInfoThread')}: \`${threadId}\`\n`
    msg += `• ${t(lang, 'chatInfoUser')}: \`${ctx.from?.id}\`\n`
    if (config.FORUM_GROUP_ID)
      msg += `\n${t(lang, 'forumModeActive', config.FORUM_GROUP_ID)}`
    else
      msg += `\n${t(lang, 'forumModeHint', chat.id)}`
    await replyChunks(ctx, msg)
  })

  // /docker
  bot.command('docker', async (ctx) => {
    if (!await guardAdmin(ctx, config)) return
    const args = String(ctx.match || '').trim()
    if (!args) { await replyChunks(ctx, dockerHelpText()); return }
    await ctx.replyWithChatAction('typing')
    try {
      for (const chunk of splitTelegramMessage(formatTelegramMarkdown(await runDockerCommand(args))))
        if (chunk) await ctx.reply(chunk, TELEGRAM_MARKDOWN_OPTS)
    } catch (err: any) {
      await replyChunks(ctx, `❌ ${err.message}\n\n${dockerHelpText()}`)
    }
  })

  // /pm2
  bot.command('pm2', async (ctx) => {
    if (!await guardAdmin(ctx, config)) return
    const args = String(ctx.match || '').trim()
    if (!args) { await replyChunks(ctx, pm2HelpText()); return }
    await ctx.replyWithChatAction('typing')
    try {
      for (const chunk of splitTelegramMessage(formatTelegramMarkdown(await runPm2Command(args))))
        if (chunk) await ctx.reply(chunk, TELEGRAM_MARKDOWN_OPTS)
    } catch (err: any) {
      await replyChunks(ctx, `❌ ${err.message}\n\n${pm2HelpText()}`)
    }
  })
}
