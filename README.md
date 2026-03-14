# 🦀 Agora

> **Agora** (from Greek *ἀγορά* — the public forum) is a Telegram bot that routes conversations to AI CLI agents (Claude Code + OpenAI Codex) as dedicated forum topic threads. Each session lives in its own thread, keeping every conversation isolated and persistent.

```
/nova  →  creates a forum topic  →  🟣 Claude or 🟢 Codex
```

---

## Features

- **Forum-first** — each AI session is a Telegram forum topic thread
- **Persistent sessions** — conversation history survives bot restarts (JSON storage)
- **No API keys needed** — uses Claude Code OAuth login and Codex ChatGPT login
- **Full auto mode** — `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox`
- **Async processing** — typing indicator loops while the CLI runs; response sent when ready
- **Session locking** — prevents duplicate processes per session
- **Telegram-native formatting** — Markdown converted to Telegram HTML on the fly

---

## Requirements

- **Ubuntu 22+** (tested on Oracle Cloud ARM64)
- **Node.js 22+** and **Bun 1.3+**
- **Claude Code CLI** authenticated via OAuth (`claude`)
- **Codex CLI** authenticated via ChatGPT (`codex login`)
- A Telegram **group** with **Topics enabled**, bot added as **admin**

---

## Installation

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-user/agora.git
cd agora
bun install
```

### 2. Install CLIs

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
curl -fsSL https://bun.sh/install | bash

# Claude Code + Codex + PM2
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
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

### 5. Set up Telegram group

1. Create a Telegram group
2. **Edit group → Topics → Enable**
3. Add your bot as **Admin** with *Manage Topics* permission
4. Send `/id` in the group — copy the `Chat ID`
5. Paste it as `FORUM_GROUP_ID` in `.env`

### 6. Start

```bash
# One-shot
bun run index.ts

# Production (PM2 — auto-restart on boot)
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
agora/
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
User message in forum topic
        ↓
messages.ts: resolve session by thread_id
        ↓
Lock session (prevent concurrent processes)
        ↓
Send "⚙️ Processing..." + start typing loop (every 4s)
        ↓
Spawn: claude --resume <id> -p "msg" --output-format text
   or: codex exec resume <thread_id> --json "msg"
        ↓
Process runs until complete (no kill timeout)
        ↓
Delete "Processing..." → send formatted response
```

Session IDs (`claudeSessionId`, `codexThreadId`) are persisted in `data/chat_<id>.json` so the conversation context survives bot restarts.

---

## Adding Another VPS

```bash
git clone https://github.com/your-user/agora.git
cd agora && bun install
npm install -g @anthropic-ai/claude-code @openai/codex pm2
claude          # authenticate
codex login     # authenticate
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## License

MIT
