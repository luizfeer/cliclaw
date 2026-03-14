# 🦀 Cli-Claw

> **Cli-Claw** is a Telegram bot that acts as a **direct bridge between AI CLI tools and your phone**. Each conversation lives in a dedicated Forum Topic thread — you type from anywhere, the CLI runs on your server, the answer comes back. No API keys, no per-token billing, just your own subscription plan.

```
/new  →  opens a forum topic  →  🟣 Claude or 🟢 Codex
 └ each topic = one CLI session with full conversation memory
```

📖 **[Leia em Português →](README.pt.md)**

---

## Why a CLI bridge?

Most Telegram AI bots call HTTP APIs. Cli-Claw is different — it drives the actual CLI binaries installed on your server:

| | Cli-Claw | API-based bots |
|---|---|---|
| **Auth** | OAuth / ChatGPT login | API keys (paid per token) |
| **Cost** | Your subscription plan | Metered billing |
| **Agentic tasks** | ✅ Full tool access | ❌ Limited |
| **Permission control** | ✅ Per session / on demand | N/A |
| **Adds a new CLI** | Just install & restart | N/A |

Because it drives real CLI processes, Cli-Claw can do anything you can do in a terminal — install software, execute code, browse files, run long agentic workflows.

---

## Supported agents

| Agent | Status | Notes |
|---|---|---|
| 🟣 **Claude Code** | ✅ Available | Requires claude.ai subscription |
| 🟢 **Codex** | ✅ Available | Requires OpenAI/ChatGPT account |
| 🔜 **OpenCode** | Coming soon | Open-source CLI, no subscription needed |

Each agent you install becomes immediately available. The bot detects which CLIs are in `PATH` on startup and shows a setup guide for anything not yet configured.

---

## Bot commands

| English | Portuguese | Description |
|---|---|---|
| `/new` | `/nova` | New Claude session (creates a forum topic) |
| `/new codex` | `/nova codex` | New Codex session |
| `/sessions` | `/sessoes` | List all sessions |
| `/clear` | `/limpar` | Reset current session / topic |
| `/status` | `/status` | Active session info |
| `/id` | `/id` | Show this chat ID |
| `/help` | `/ajuda` | Show help message |

---

## Requirements

- **Ubuntu 22+** (tested on Oracle Cloud ARM64)
- **Node.js 22+**
- **Claude Code CLI** authenticated via OAuth (`claude`) — *optional, add to unlock 🟣*
- **Codex CLI** authenticated via ChatGPT (`codex login`) — *optional, add to unlock 🟢*
- A Telegram **group** with **Topics enabled**, bot added as **admin**

---

## Installation

### 1. Clone and install

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw
npm install
```

### 2. Install Node.js 22 (if needed)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g tsx pm2
```

### 3. Install AI CLIs

Install at least one. You can add more later — just restart the bot.

```bash
# Set up npm global prefix (no sudo)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

# 🟣 Claude Code (requires claude.ai subscription)
npm install -g @anthropic-ai/claude-code
claude   # opens OAuth link in your browser

# 🟢 Codex (requires OpenAI/ChatGPT account)
npm install -g @openai/codex
codex login
```

> **Don't have either yet?** That's fine — install the bot first, then send `/start` in Telegram. The bot will show exactly what to run.

### 4. Configure

```bash
cp .env.example .env
nano .env
```

```env
TELEGRAM_BOT_TOKEN=   # from @BotFather → /newbot
FORUM_GROUP_ID=       # run /id inside your group to get it
```

### 5. Choose a permission mode

Add `PERMISSION_MODE` to your `.env`:

| Mode | Value | Behavior |
|---|---|---|
| **Full auto** *(recommended)* | `auto` | Always skips all permission prompts — models run freely |
| **Per session** | `session` | Bot asks when you run `/new`: *"Allow full auto for this session?"* |
| **On demand** | `ask` | Restricted by default; prefix any message with `!` to grant full auto for that message only |

```env
PERMISSION_MODE=auto
```

### 6. Set up Telegram group

1. Create a Telegram group
2. **Edit group → Topics → Enable**
3. Add your bot as **Admin** with *Manage Topics* permission
4. Send `/id` in the group and copy the Chat ID
5. Paste it as `FORUM_GROUP_ID` in `.env`

### 7. Start

```bash
# Test run
npx tsx index.ts

# Production — auto-restarts on crash and reboot
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## How it works

```
Message in forum topic
       ↓
Resolve session by thread_id
       ↓
Lock session (prevent concurrent processes)
       ↓
Send "⚙️ Processing..." + typing loop every 4s
       ↓
Spawn CLI based on PERMISSION_MODE:
  claude --resume <id> -p "msg" --output-format text
  codex exec resume <thread> --json "msg"
       ↓
Process runs to completion (no kill timeout)
       ↓
Delete "Processing..." → send formatted HTML response
```

Session IDs are saved to `data/chat_<id>.json` — context survives bot restarts.

---

## Publishing to npm *(planned)*

The goal is to make installation a single command:

```bash
npm install -g cliclaw
cliclaw setup   # interactive wizard: bot token, group ID, permission mode
cliclaw start
```

This requires a `cli.js` setup wizard and a compiled entry point. The CLIs (`claude`, `codex`) will still need to be authenticated manually — npm can bundle the bot code but not OAuth sessions. The wizard would guide through that step.

Contributions welcome: **[github.com/luizfeer/cliclaw](https://github.com/luizfeer/cliclaw)**

---

## Project structure

```
cliclaw/
├── index.ts                   # Entry point
├── ecosystem.config.js        # PM2 config (uses tsx)
├── src/
│   ├── config.ts              # Loads .env + detects available CLIs
│   ├── storage.ts             # JSON session persistence
│   ├── agents/
│   │   ├── claude.ts          # Claude Code CLI wrapper
│   │   └── codex.ts           # Codex CLI wrapper
│   ├── handlers/
│   │   ├── commands.ts        # /new /sessions /clear etc.
│   │   └── messages.ts        # Routes by thread_id, typing loop, lock
│   └── utils/
│       └── markdown.ts        # Markdown → Telegram HTML
├── data/                      # Session JSON files (git-ignored)
├── .env                       # Secrets (git-ignored)
└── .env.example               # Template
```

---

## Deploy to another VPS

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw && npm install
npm install -g tsx pm2 @anthropic-ai/claude-code @openai/codex
claude && codex login
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## Contributing

Cli-Claw is an open community project. PRs welcome — especially:
- New CLI agent adapters (OpenCode, Gemini CLI, etc.)
- `cliclaw setup` wizard for npm distribution
- i18n improvements
- Better permission UX

---

## License

MIT
