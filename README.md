# 🦀 OpenClaw

Bot Telegram que conecta Claude (Anthropic) e Codex (OpenAI) como sessões em tópicos de fórum.

## Pré-requisitos

- Node.js 22+ e Bun 1.3+
- Claude Code CLI autenticado: `claude` (login OAuth)
- Codex CLI autenticado: `codex login`
- Grupo Telegram com **Tópicos** ativado + bot como admin

## Instalação

```bash
git clone <repo>
cd openclaw
bun install
cp .env.example .env
nano .env   # preencher TELEGRAM_BOT_TOKEN e FORUM_GROUP_ID
```

## Iniciar

```bash
# Uma vez
bun run index.ts

# Com PM2 (produção)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

## Comandos do bot

| Comando | Ação |
|---|---|
| `/nova` | Nova sessão Claude (padrão) |
| `/nova codex` | Nova sessão Codex |
| `/sessoes` | Listar sessões |
| `/limpar` | Reiniciar sessão atual |
| `/status` | Ver sessão ativa |
| `/id` | Ver ID do chat |

## Estrutura

```
src/
  agents/claude.ts     # Claude CLI (--dangerously-skip-permissions)
  agents/codex.ts      # Codex CLI (--dangerously-bypass-approvals-and-sandbox)
  handlers/commands.ts # Comandos /nova /sessoes /limpar etc
  handlers/messages.ts # Roteamento por threadId + typing loop
  utils/markdown.ts    # Conversor Markdown → HTML do Telegram
  config.ts            # Carrega .env
  storage.ts           # Sessões persistidas em JSON por chat
```
