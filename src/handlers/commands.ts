import type { Bot, Context } from 'grammy'
import type { Storage } from '../storage'
import type { Config, AgentName } from '../config'
import { killSession } from '../agents/claude'
import { formatTelegramMarkdown, splitTelegramMessage, TELEGRAM_MARKDOWN_OPTS } from '../telegram'
import { dockerHelpText, pm2HelpText, runDockerCommand, runPm2Command } from '../admin'

// ─── helpers ────────────────────────────────────────────────────────────────

function isAdmin(ctx: Context, config: Config): boolean {
  return config.TELEGRAM_ADMIN_IDS.includes(String(ctx.from?.id || ''))
}

async function guardAdmin(ctx: Context, config: Config): Promise<boolean> {
  if (config.TELEGRAM_ADMIN_IDS.length === 0) {
    await ctx.reply(
      formatTelegramMarkdown('⚠️ Admin commands disabled. Set `TELEGRAM_ADMIN_IDS` in `.env`.'),
      TELEGRAM_MARKDOWN_OPTS
    )
    return false
  }
  if (!isAdmin(ctx, config)) {
    await ctx.reply(formatTelegramMarkdown('⛔ You do not have permission.'), TELEGRAM_MARKDOWN_OPTS)
    return false
  }
  return true
}

async function replyChunks(ctx: Context, text: string) {
  for (const chunk of splitTelegramMessage(formatTelegramMarkdown(text))) {
    if (chunk) await ctx.reply(chunk, TELEGRAM_MARKDOWN_OPTS)
  }
}

// ─── setup guide sent when no CLI is available ───────────────────────────────

function setupGuide(available: AgentName[]): string {
  const hasClaude = available.includes('claude')
  const hasCodex  = available.includes('codex')

  if (hasClaude && hasCodex) return ''   // nothing to say

  let msg = '⚙️ **Cli-Claw Setup**\n\n'

  if (!hasClaude && !hasCodex) {
    msg += '❌ No AI CLI found. Install at least one:\n\n'
  } else {
    msg += '✅ ' + (hasClaude ? '🟣 Claude' : '🟢 Codex') + ' ready!\n'
    msg += '➕ You can also add ' + (hasClaude ? 'Codex' : 'Claude') + ':\n\n'
  }

  if (!hasClaude) {
    msg += '**🟣 Claude Code** (requires claude.ai subscription)\n'
    msg += '```\nnpm install -g @anthropic-ai/claude-code\nclaude\n```\n\n'
  }

  if (!hasCodex) {
    msg += '**🟢 Codex** (requires OpenAI/ChatGPT account)\n'
    msg += '```\nnpm install -g @openai/codex\ncodex login\n```\n\n'
  }

  msg += '🔜 **OpenCode** — coming soon!\n\n'
  msg += 'After installing, restart the bot:\n`pm2 restart cliclaw`'
  return msg
}

// ─── create session & forum topic ───────────────────────────────────────────

async function createSession(
  ctx: Context,
  storage: Storage,
  config: Config,
  chatId: string,
  model: AgentName
) {
  const emoji = model === 'claude' ? '🟣' : '🟢'
  const label = model === 'claude' ? 'Claude' : 'Codex'
  const n = storage.listSessions(chatId).length + 1
  const topicName = `${emoji} ${label} #${n}`

  if (config.FORUM_GROUP_ID) {
    try {
      const groupId = Number(config.FORUM_GROUP_ID)
      const topic   = await ctx.api.createForumTopic(groupId, topicName)
      const session = storage.createSession(chatId, model, topic.message_thread_id)
      await ctx.api.sendMessage(
        groupId,
        formatTelegramMarkdown(`${emoji} **${session.name}** ready!\nSend your message here.`),
        { message_thread_id: topic.message_thread_id, ...TELEGRAM_MARKDOWN_OPTS }
      )
      return session
    } catch (err: any) {
      await ctx.reply(`⚠️ Could not create topic: ${err.message}\nMake sure the bot is admin of the group.`)
      return null
    }
  }

  const session = storage.createSession(chatId, model, 0)
  await ctx.reply(
    formatTelegramMarkdown(`${emoji} **${session.name}** created! Send your messages here.`),
    TELEGRAM_MARKDOWN_OPTS
  )
  return session
}

// ─── register all commands ───────────────────────────────────────────────────

export function registerCommands(bot: Bot<Context>, storage: Storage, config: Config) {

  // /start
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'there'
    const { availableAgents: av } = config

    const setup = setupGuide(av)
    if (setup) {
      await replyChunks(ctx, `👋 Hello **${name}**! Welcome to **Cli-Claw** 🦀\n\n` + setup)
      return
    }

    const agentLines = [
      av.includes('claude') ? '🟣 **Claude** — Anthropic (subscription)' : null,
      av.includes('codex')  ? '🟢 **Codex** — OpenAI CLI' : null,
      '🔜 **OpenCode** — coming soon',
    ].filter(Boolean).join('\n')

    await replyChunks(ctx,
      `👋 Hello **${name}**! Welcome to **Cli-Claw** 🦀\n\n` +
      agentLines + '\n\n' +
      '`/new` or `/nova` — new Claude session\n' +
      '`/new codex` or `/nova codex` — new Codex session\n' +
      '`/sessions` or `/sessoes` — list sessions\n' +
      '`/clear` or `/limpar` — reset current session\n' +
      '`/status` — active session info\n' +
      '`/id` — this chat ID\n' +
      '`/help` or `/ajuda` — show this message'
    )
  })

  // /new + /nova  (English + Portuguese)
  const novaHandler = async (ctx: Context) => {
    if (!ctx.chat) return
    const chatId = String(ctx.chat!.id)
    const arg    = String(ctx.match || '').trim().toLowerCase()
    const model: AgentName = arg === 'codex' ? 'codex' : 'claude'
    const { availableAgents: av } = config

    // Neither configured
    if (av.length === 0) {
      await replyChunks(ctx, setupGuide(av))
      return
    }

    // Requested model not available
    if (!av.includes(model)) {
      const other = model === 'claude' ? 'codex' : 'claude'
      const setup = setupGuide(av)
      await replyChunks(ctx,
        `⚠️ **${model === 'claude' ? 'Claude' : 'Codex'}** is not configured yet.\n\n` +
        (av.includes(other)
          ? `Use \`/new ${other}\` to start a ${other} session instead.\n\n`
          : '') +
        setup
      )
      return
    }

    const ack = await ctx.reply(`⏳ Creating ${model === 'claude' ? '🟣 Claude' : '🟢 Codex'} session...`)
    await createSession(ctx, storage, config, chatId, model)
    try { await ctx.api.deleteMessage(ctx.chat.id, ack.message_id) } catch {}
  }

  bot.command('nova', novaHandler)
  bot.command('new',  novaHandler)

  // /sessions + /sessoes
  const sessoesHandler = async (ctx: Context) => {
    if (!ctx.chat) return
    const chatId = String(ctx.chat!.id)
    const sessions = storage.listSessions(chatId)
    if (sessions.length === 0) {
      await ctx.reply('No sessions yet. Use /new or /nova.')
      return
    }
    const active = storage.getActiveSession(chatId)
    let msg = '📋 **Sessions:**\n'
    for (const s of sessions) {
      const tick   = s.id === active?.id ? '✅' : '•'
      const thread = s.threadId ? ` [topic #${s.threadId}]` : ''
      msg += `${tick} **${s.name}**${thread} — ${s.history.length} msgs\n`
    }
    await replyChunks(ctx, msg)
  }
  bot.command('sessoes',  sessoesHandler)
  bot.command('sessions', sessoesHandler)

  // /clear + /limpar
  const limparHandler = async (ctx: Context) => {
    const chatId   = String(ctx.chat!.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session  = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply('No active session.'); return }
    killSession(session.id)
    storage.clearSession(chatId, session.id)
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(`🧹 **${session.name}** cleared!`),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  }
  bot.command('limpar', limparHandler)
  bot.command('clear',  limparHandler)

  // /status
  bot.command('status', async (ctx) => {
    const chatId   = String(ctx.chat!.id)
    const threadId = ctx.message?.message_thread_id ?? 0
    const session  = threadId
      ? (storage.getSessionByThreadId(chatId, threadId) || storage.getActiveSession(chatId))
      : storage.getActiveSession(chatId)
    if (!session) { await ctx.reply('No active session. Use /new.'); return }
    const emoji = session.model === 'claude' ? '🟣' : '🟢'
    const opts: any = session.threadId ? { message_thread_id: session.threadId } : {}
    await ctx.reply(
      formatTelegramMarkdown(
        `${emoji} **${session.name}**\n` +
        `💬 ${session.history.length} messages\n` +
        `🕐 ${new Date(session.createdAt).toLocaleString()}\n` +
        `🔖 Topic: ${session.threadId || 'DM'}`
      ),
      { ...opts, ...TELEGRAM_MARKDOWN_OPTS }
    )
  })

  // /help + /ajuda
  const ajudaHandler = async (ctx: Context) => {
    const { availableAgents: av } = config
    const agentLines = [
      av.includes('claude') ? '🟣 Claude ready' : '🟣 Claude — not configured',
      av.includes('codex')  ? '🟢 Codex ready'  : '🟢 Codex — not configured',
      '🔜 OpenCode — coming soon',
    ].join('\n')

    await replyChunks(ctx,
      `🦀 **Cli-Claw**\n\n` +
      agentLines + '\n\n' +
      '`/new` `/nova` — new Claude session\n' +
      '`/new codex` `/nova codex` — new Codex session\n' +
      '`/sessions` `/sessoes` — list sessions\n' +
      '`/clear` `/limpar` — reset current session\n' +
      '`/status` — active session info\n' +
      '`/id` — this chat ID'
    )
  }
  bot.command('ajuda', ajudaHandler)
  bot.command('help',  ajudaHandler)

  // /id
  bot.command('id', async (ctx) => {
    const chat     = ctx.chat
    const threadId = ctx.message?.message_thread_id
    let msg = `🆔 **Chat Info**\n\n`
    msg += `• Chat ID: \`${chat.id}\`\n`
    msg += `• Type: \`${chat.type}\`\n`
    if ('title' in chat) msg += `• Name: ${chat.title}\n`
    if (threadId) msg += `• Thread ID: \`${threadId}\`\n`
    msg += `• Your user ID: \`${ctx.from?.id}\`\n`
    if (config.FORUM_GROUP_ID)
      msg += `\n✅ Forum mode active: \`${config.FORUM_GROUP_ID}\``
    else
      msg += `\n💡 To enable Forum mode, add to \`.env\`:\n\`FORUM_GROUP_ID=${chat.id}\``
    await replyChunks(ctx, msg)
  })

  // /docker
  bot.command('docker', async (ctx) => {
    if (!await guardAdmin(ctx, config)) return
    const args = String(ctx.match || '').trim()
    if (!args) { await replyChunks(ctx, dockerHelpText()); return }
    await ctx.replyWithChatAction('typing')
    try {
      await replyChunks(ctx, await runDockerCommand(args))
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
      await replyChunks(ctx, await runPm2Command(args))
    } catch (err: any) {
      await replyChunks(ctx, `❌ ${err.message}\n\n${pm2HelpText()}`)
    }
  })
}
