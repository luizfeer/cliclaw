import type { Context } from 'grammy'

export type Lang = 'pt' | 'en'

/** Detect language from Telegram user locale. Defaults to 'en'. */
export function getLang(ctx: Context): Lang {
  const code = ctx.from?.language_code ?? ''
  return code.startsWith('pt') ? 'pt' : 'en'
}

const strings = {
  // ─── /start ───────────────────────────────────────────────────────────────
  welcome: {
    pt: (name: string) => `👋 Olá, **${name}**! Bem-vindo ao **Cli-Claw** 🦀`,
    en: (name: string) => `👋 Hello, **${name}**! Welcome to **Cli-Claw** 🦀`,
  },
  helpCommands: {
    pt:
      '`/nova` ou `/new` — nova sessão Claude\n' +
      '`/nova codex` ou `/new codex` — nova sessão Codex\n' +
      '`/sessoes` ou `/sessions` — listar sessões\n' +
      '`/limpar` ou `/clear` — reiniciar sessão atual\n' +
      '`/status` — info da sessão ativa\n' +
      '`/id` — ID deste chat\n' +
      '`/ajuda` ou `/help` — exibir ajuda',
    en:
      '`/new` or `/nova` — new Claude session\n' +
      '`/new codex` or `/nova codex` — new Codex session\n' +
      '`/sessions` or `/sessoes` — list sessions\n' +
      '`/clear` or `/limpar` — reset current session\n' +
      '`/status` — active session info\n' +
      '`/id` — this chat ID\n' +
      '`/help` or `/ajuda` — show help',
  },

  // ─── setup guide ──────────────────────────────────────────────────────────
  setupTitle: {
    pt: '⚙️ **Configuração do Cli-Claw**\n\n',
    en: '⚙️ **Cli-Claw Setup**\n\n',
  },
  setupNone: {
    pt: '❌ Nenhum CLI de IA encontrado. Instale pelo menos um:\n\n',
    en: '❌ No AI CLI found. Install at least one:\n\n',
  },
  setupOneReady: {
    pt: (name: string) => `✅ ${name} pronto!\n➕ Você também pode adicionar:\n\n`,
    en: (name: string) => `✅ ${name} ready!\n➕ You can also add:\n\n`,
  },
  setupClaudeInstructions: {
    pt: '**🟣 Claude Code** (requer assinatura claude.ai)\n```\nnpm install -g @anthropic-ai/claude-code\nclaude\n```\n\n',
    en: '**🟣 Claude Code** (requires claude.ai subscription)\n```\nnpm install -g @anthropic-ai/claude-code\nclaude\n```\n\n',
  },
  setupCodexInstructions: {
    pt: '**🟢 Codex** (requer conta OpenAI/ChatGPT)\n```\nnpm install -g @openai/codex\ncodex login\n```\n\n',
    en: '**🟢 Codex** (requires OpenAI/ChatGPT account)\n```\nnpm install -g @openai/codex\ncodex login\n```\n\n',
  },
  setupOpenCodeSoon: {
    pt: '🔜 **OpenCode** — em breve!\n\n',
    en: '🔜 **OpenCode** — coming soon!\n\n',
  },
  setupRestart: {
    pt: 'Após instalar, reinicie o bot:\n`pm2 restart cliclaw`',
    en: 'After installing, restart the bot:\n`pm2 restart cliclaw`',
  },

  // ─── /nova ────────────────────────────────────────────────────────────────
  creatingSession: {
    pt: (model: string) => `⏳ Criando sessão ${model}...`,
    en: (model: string) => `⏳ Creating ${model} session...`,
  },
  sessionReady: {
    pt: (name: string) => `${name} pronta! Envie sua mensagem aqui.`,
    en: (name: string) => `${name} ready! Send your message here.`,
  },
  sessionCreatedDM: {
    pt: (name: string) => `${name} criada! Pode enviar mensagens.`,
    en: (name: string) => `${name} created! Send your messages here.`,
  },
  topicCreateError: {
    pt: (msg: string) => `⚠️ Não consegui criar tópico: ${msg}\nVerifique se o bot é admin do grupo.`,
    en: (msg: string) => `⚠️ Could not create topic: ${msg}\nMake sure the bot is admin of the group.`,
  },
  modelNotConfigured: {
    pt: (model: string) => `⚠️ **${model}** ainda não está configurado.`,
    en: (model: string) => `⚠️ **${model}** is not configured yet.`,
  },
  useOtherModel: {
    pt: (cmd: string, model: string) => `Use \`${cmd}\` para iniciar uma sessão ${model} em vez disso.\n\n`,
    en: (cmd: string, model: string) => `Use \`${cmd}\` to start a ${model} session instead.\n\n`,
  },

  // ─── /sessoes ─────────────────────────────────────────────────────────────
  noSessions: {
    pt: 'Nenhuma sessão. Use /nova ou /nova codex.',
    en: 'No sessions yet. Use /new or /nova.',
  },
  sessionsTitle: {
    pt: '📋 **Sessões:**\n',
    en: '📋 **Sessions:**\n',
  },
  msgCount: {
    pt: (n: number) => `${n} msgs`,
    en: (n: number) => `${n} msgs`,
  },
  topicLabel: {
    pt: (id: number) => `tópico #${id}`,
    en: (id: number) => `topic #${id}`,
  },

  // ─── /limpar ──────────────────────────────────────────────────────────────
  noActiveSession: {
    pt: 'Nenhuma sessão ativa.',
    en: 'No active session.',
  },
  sessionCleared: {
    pt: (name: string) => `🧹 **${name}** reiniciada!`,
    en: (name: string) => `🧹 **${name}** cleared!`,
  },

  // ─── /status ──────────────────────────────────────────────────────────────
  noActiveSessionUseNew: {
    pt: 'Nenhuma sessão ativa. Use /nova.',
    en: 'No active session. Use /new.',
  },
  statusMessages: {
    pt: (n: number) => `💬 ${n} mensagens`,
    en: (n: number) => `💬 ${n} messages`,
  },
  statusTopic: {
    pt: (id: number | string) => `🔖 Tópico: ${id}`,
    en: (id: number | string) => `🔖 Topic: ${id}`,
  },

  // ─── /id ──────────────────────────────────────────────────────────────────
  chatInfoTitle: {
    pt: '🆔 **Informações do chat**\n\n',
    en: '🆔 **Chat Info**\n\n',
  },
  chatInfoType: {
    pt: 'Tipo',
    en: 'Type',
  },
  chatInfoName: {
    pt: 'Nome',
    en: 'Name',
  },
  chatInfoThread: {
    pt: 'Thread ID',
    en: 'Thread ID',
  },
  chatInfoUser: {
    pt: 'Seu user ID',
    en: 'Your user ID',
  },
  forumModeActive: {
    pt: (id: string) => `✅ Modo Fórum ativo: \`${id}\``,
    en: (id: string) => `✅ Forum mode active: \`${id}\``,
  },
  forumModeHint: {
    pt: (id: number) => `💡 Para ativar Modo Fórum, adicione ao \`.env\`:\n\`FORUM_GROUP_ID=${id}\``,
    en: (id: number) => `💡 To enable Forum mode, add to \`.env\`:\n\`FORUM_GROUP_ID=${id}\``,
  },

  // ─── /ajuda ───────────────────────────────────────────────────────────────
  agentReady: {
    pt: (name: string) => `${name} pronto`,
    en: (name: string) => `${name} ready`,
  },
  agentNotConfigured: {
    pt: (name: string) => `${name} — não configurado`,
    en: (name: string) => `${name} — not configured`,
  },

  // ─── admin guard ──────────────────────────────────────────────────────────
  adminDisabled: {
    pt: '⚠️ Comandos admin desabilitados. Configure `TELEGRAM_ADMIN_IDS` no `.env` com seu user id.',
    en: '⚠️ Admin commands disabled. Set `TELEGRAM_ADMIN_IDS` in `.env` with your user ID.',
  },
  noPermission: {
    pt: '⛔ Você não tem permissão para usar este comando.',
    en: '⛔ You do not have permission.',
  },

  // ─── messages.ts ──────────────────────────────────────────────────────────
  processing: {
    pt: 'Processando...',
    en: 'Processing...',
  },
  stillProcessing: {
    pt: '⚙️ Ainda processando a mensagem anterior, aguarde...',
    en: '⚙️ Still processing the previous message, please wait...',
  },
  noActiveSessionReply: {
    pt: '⚠️ Nenhuma sessão ativa. Use /nova ou /nova codex.',
    en: '⚠️ No active session. Use /new or /nova.',
  },
} as const

type StringKey = keyof typeof strings

/** Get a translated string. Handles both plain strings and function strings. */
export function t(lang: Lang, key: StringKey, ...args: any[]): string {
  const entry = strings[key]
  const val = entry[lang] ?? entry['en']
  if (typeof val === 'function') return (val as Function)(...args)
  return val as string
}
