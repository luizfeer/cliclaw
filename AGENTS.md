# AGENTS.md — Guide for AI Agents

This file describes the architecture, conventions, and key patterns of **Agora** so that AI agents (Claude, Codex, etc.) can understand and extend the codebase effectively.

---

## What This Project Does

Agora is a Telegram bot written in **TypeScript + Bun** that:
1. Receives messages from users in Telegram forum topic threads
2. Routes each message to a running CLI process (Claude Code or Codex)
3. Returns the response to the same thread when the CLI finishes

Each forum topic = one AI session. Sessions are persisted to JSON files in `data/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun 1.3+ |
| Bot framework | grammY |
| AI backend (Claude) | Claude Code CLI (`claude`) via `spawn` |
| AI backend (Codex) | Codex CLI (`codex`) via `spawn` |
| Persistence | JSON files in `data/` |
| Process manager | PM2 |

---

## File Map

```
index.ts                 Boot: loads config, creates bot, registers handlers
src/config.ts            Reads .env file, exports Config interface
src/storage.ts           Storage class: CRUD for sessions, persists to data/*.json
src/agents/claude.ts     askClaude(): spawns claude CLI, manages session IDs
src/agents/codex.ts      askCodex(): spawns codex CLI, manages thread IDs
src/handlers/commands.ts Bot commands: /nova /sessoes /limpar /status /id
src/handlers/messages.ts Message routing, session lock, typing loop, response send
src/utils/markdown.ts    mdToTg(): converts Markdown to Telegram HTML
```

---

## Core Data Model

```typescript
interface Session {
  id: string              // internal UUID
  name: string            // e.g. "🟣 Claude #1"
  model: 'claude'|'codex'
  history: Message[]      // full conversation log
  createdAt: string
  threadId: number        // Telegram forum thread_id (0 = DM)
  claudeSessionId?: string  // passed to `claude --resume`
  codexThreadId?: string    // passed to `codex exec resume`
}
```

Sessions are stored in `data/chat_<chatId>.json`. One file per Telegram chat.

---

## Session Routing Logic

```
Incoming message
  └── has message_thread_id?
        YES → getSessionByThreadId(chatId, threadId)
              → if null: ignore silently (unknown topic)
        NO  → getActiveSession(chatId)
              → if null: ask user to /nova
```

---

## Claude Agent Pattern

File: `src/agents/claude.ts`

- **First message** in a session: spawn with `--session-id <newUUID> --output-format json`
  - Parse JSON response to extract `session_id` and `result`
  - Call `onNewSessionId(sid)` ONLY after successful response (not before)
- **Subsequent messages**: spawn with `--resume <claudeSessionId> --output-format text`
- Always includes `--dangerously-skip-permissions`
- No kill timeout — process runs until natural completion
- `ANTHROPIC_API_KEY` is explicitly deleted from subprocess env (uses OAuth instead)

```bash
# First message
claude -p "msg" --output-format json --session-id <uuid> --dangerously-skip-permissions

# Resume
claude --resume <uuid> -p "msg" --output-format text --dangerously-skip-permissions
```

---

## Codex Agent Pattern

File: `src/agents/codex.ts`

- **First message**: `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json "msg"`
- **Subsequent messages**: `codex exec resume <threadId> --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json "msg"`
- JSON output: parse lines for `{"type":"thread.started","thread_id":"..."}` and `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}`
- No kill timeout

---

## Message Handler Flow

File: `src/handlers/messages.ts`

```
1. Resolve session (by threadId or activeSession)
2. Check activeLocks — if locked: reply "still processing"
3. activeLocks.add(session.id)
4. Reply with "⚙️ Processing..." (immediate feedback)
5. Start typing loop: setInterval(typing, 4000)
6. await askClaude / askCodex (blocks until CLI exits)
7. clearInterval + activeLocks.delete
8. Delete "Processing..." message
9. sendLong() → mdToTg() + parse_mode: 'HTML' + chunked if > 4000 chars
```

---

## Markdown Converter

File: `src/utils/markdown.ts`

`mdToTg(text)` converts standard Markdown to Telegram HTML:
- Code blocks → `<pre>` (protected first, restored after)
- Inline code → `<code>`
- `**bold**` → `<b>`
- `*italic*` → `<i>`
- `## Header` → `<b>`
- `- list` → `• list`
- `[text](url)` → `<a href="">`
- HTML special chars escaped in text regions only

`splitHtml(text, maxLen=4000)` splits on newlines to avoid breaking HTML tags.

---

## Adding a New AI Provider

1. Create `src/agents/myprovider.ts` — export `askMyProvider(session, message, onNewId)`
2. Add `mymodel` to `Model` type in `storage.ts`
3. Add branch in `messages.ts` handler
4. Add button/command in `commands.ts`

Follow the same contract:
- Accept `session: Session` and `userMessage: string`
- Return `Promise<string>` (the response text)
- Call `onNewId(id)` after first successful response only
- No hard kill timeout

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `FORUM_GROUP_ID` | Recommended | Telegram group ID with Topics enabled |
| `ANTHROPIC_API_KEY` | ❌ | Not used — bot uses Claude Code OAuth |
| `OPENAI_API_KEY` | ❌ | Not used — bot uses Codex ChatGPT login |
| `DATA_DIR` | ❌ | Defaults to `~/openclaw/data` |

---

## Common Tasks

**Restart bot**
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
pm2 restart agora --update-env
```

**View logs**
```bash
pm2 logs agora --lines 50
```

**Clear all sessions for a chat**
```bash
rm ~/openclaw/data/chat_<chatId>.json
```

**Test Claude CLI directly**
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
claude -p "hello" --output-format text --dangerously-skip-permissions
```

**Test Codex CLI directly**
```bash
codex exec --skip-git-repo-check --json "hello"
```

---

## Known Constraints

- **Session lock is in-memory**: if the bot restarts while a message is processing, the lock is cleared. The process (Claude/Codex) continues running as an orphan — it won't send a response. User should resend the message.
- **Forum mode requires admin**: the bot needs *Manage Topics* admin permission to create forum threads.
- **`--dangerously-skip-permissions`** allows the CLI to run arbitrary bash commands on the VPS. Only use on trusted/sandboxed machines.
- **Codex `--dangerously-bypass-approvals-and-sandbox`** similarly bypasses all sandboxing.
