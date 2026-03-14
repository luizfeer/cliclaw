# 🦀 Cli-Claw

> **Cli-Claw** is a Telegram bot that acts as a **bridge between AI CLIs and your phone** — each conversation lives in a dedicated Forum Topic thread, giving you direct access to Claude Code and OpenAI Codex from anywhere, without leaving Telegram.

The idea is simple: powerful AI CLI tools exist on your server, but interacting with them requires a terminal. Cli-Claw solves this by exposing those CLIs through Telegram's forum threads — one thread per session, full context persistence, async responses. You type from your phone; the CLI runs on the VPS; the answer comes back.

```
/nova  →  opens a forum topic  →  🟣 Claude or 🟢 Codex
 └ each topic = one CLI session with full conversation memory
```

---

## Why CLI bridge?

Most Telegram AI bots call HTTP APIs. Cli-Claw is different:

| Approach | Cli-Claw | API-based bots |
|---|---|---|
| Authentication | OAuth / ChatGPT login | API keys (paid per token) |
| Model access | Your subscription plan | Metered billing |
| Agentic tasks | Yes — full CLI tools | Limited |
| Permissions | Configurable per session | N/A |
| Offline capable | Yes (VPS only) | No |

Because it drives the actual CLI binaries, Cli-Claw can run long agentic tasks — install software, write and execute code, browse files — the same way you would in a terminal.

---

## Features

- **Forum-first** — each AI session is a dedicated Telegram forum topic
- **Persistent sessions** — JSON storage, context survives bot restarts
- **No API keys** — Claude Code OAuth + Codex ChatGPT login
- **Configurable permissions** — full auto, per session, or on demand
- **Async processing** — typing indicator keeps running while CLI executes
- **Session locking** — no duplicate processes per session
- **Telegram-native formatting** — Markdown converted to Telegram HTML

---

## Requirements

- **Ubuntu 22+** (tested on Oracle Cloud ARM64)
- **Node.js 22+** and **Bun 1.3+**
- **Claude Code CLI** authenticated via OAuth ()
- **Codex CLI** authenticated via ChatGPT ()
- A Telegram **group** with **Topics enabled**, bot added as **admin**

---

## Installation

### 1. Clone and install dependencies

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw
bun install
```

### 2. Install CLIs

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
curl -fsSL https://bun.sh/install | bash

# Claude Code + Codex + PM2 (no sudo needed)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

npm install -g @anthropic-ai/claude-code @openai/codex pm2
```

### 3. Authenticate CLIs

```bash
# Claude Code — opens OAuth link (requires claude.ai subscription)
claude

# Codex — login via ChatGPT
codex login
```

### 4. Configure environment

```bash
cp .env.example .env
nano .env
```

```env
TELEGRAM_BOT_TOKEN=   # from @BotFather → /newbot
FORUM_GROUP_ID=       # run /id inside your group to get it
```

### 5. Choose permission mode for AI models

Cli-Claw supports three permission levels. Set `PERMISSION_MODE` in your `.env`:

| Mode | .env value | Behavior |
|---|---|---|
| **Full auto** *(recommended for VPS)* | `PERMISSION_MODE=auto` | Always passes `--dangerously-skip-permissions` — no prompts, models run freely |
| **Per session** | `PERMISSION_MODE=session` | When creating a session with `/nova`, bot asks: *Allow full auto for this session?* |
| **On demand** | `PERMISSION_MODE=ask` | Default is restricted; prefix any message with `!` to grant full auto for that message only |

```env
# Example: ask per session
PERMISSION_MODE=session
```

> For most VPS deployments you own and control, `auto` is the practical choice. Use `session` or `ask` if you share the bot with others or want to be prompted before agentic tasks.

### 6. Set up Telegram group

1. Create a Telegram group
2. **Edit group → Topics → Enable**
3. Add your bot as **Admin** with *Manage Topics* permission
4. Send `/id` in the group — copy the `Chat ID`
5. Paste it as `FORUM_GROUP_ID` in `.env`

### 7. Start

```bash
# One-shot (test)
bun run index.ts

# Production — PM2 auto-restarts on crash and reboot
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command
```

---

## Bot Commands

| Command | Description |
|---|---|
| `/nova` | New Claude session (creates a forum topic) |
| `/nova codex` | New Codex session (creates a forum topic) |
| `/sessoes` | List all sessions |
| `/limpar` | Clear current session history |
| `/status` | Show active session info |
| `/id` | Show current chat ID |

---

## Project Structure

```
cliclaw/
├── index.ts                   # Entry point
├── ecosystem.config.js        # PM2 config
├── src/
│   ├── config.ts              # Loads .env
│   ├── storage.ts             # JSON session persistence
│   ├── agents/
│   │   ├── claude.ts          # Claude Code CLI wrapper
│   │   └── codex.ts           # Codex CLI wrapper
│   ├── handlers/
│   │   ├── commands.ts        # /nova /sessoes /limpar etc.
│   │   └── messages.ts        # Routes by thread_id, typing loop, lock
│   └── utils/
│       └── markdown.ts        # Markdown → Telegram HTML converter
├── data/                      # Session JSON files (git-ignored)
├── logs/                      # PM2 logs (git-ignored)
├── .env                       # Secrets (git-ignored)
└── .env.example               # Template
```

---

## How It Works

```
User sends message in forum topic
        ↓
messages.ts: resolve session by thread_id
        ↓
Lock session (prevent concurrent processes)
        ↓
Send ⚙️ Processing... + typing loop every 4s
        ↓
Spawn CLI with permission flags based on PERMISSION_MODE
  claude --resume <id> -p msg --output-format text [--dangerously-skip-permissions]
  codex exec resume <thread> --json msg [--dangerously-bypass-approvals-and-sandbox]
        ↓
Process runs to completion (no kill timeout)
        ↓
Delete Processing... → send formatted HTML response
```

Session IDs (`claudeSessionId`, `codexThreadId`) are saved in `data/chat_<id>.json` so context survives restarts.

---

## Publishing to npm

Cli-Claw can be distributed as an npm package, making installation a single command.

**How it works:**

```bash
npm install -g cliclaw
cliclaw setup   # interactive wizard: bot token, group ID, permission mode
cliclaw start   # starts via PM2
```

The package would include a compiled entry point (`bun build --compile`) or a Node-compatible wrapper. The `package.json` needs a `bin` field:

```json
{
  name: cliclaw,
  bin: { cliclaw: ./cli.js },
  files: [dist/, cli.js, src/, ecosystem.config.js, .env.example]
}
```

Then publish with:

```bash
npm login
npm publish
```

> **Note:** The CLIs (`claude`, `codex`) still need to be authenticated manually after install — npm can bundle the bot code but cannot bundle OAuth sessions. A `cliclaw setup` wizard would guide through this. This is planned for a future release.

---

## Deploying to Another VPS

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw && bun install
npm install -g @anthropic-ai/claude-code @openai/codex pm2
claude          # authenticate
codex login     # authenticate
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## License

MIT
