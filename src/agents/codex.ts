import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type { TokenUsage } from './claude'

const HOME = process.env.HOME || process.env.USERPROFILE || '/root'
const SEP = process.platform === 'win32' ? ';' : ':'
const BASE_ENV = {
  PATH: [
    process.env.PATH || '',
    `${HOME}/.npm-global/bin`,
    '/usr/local/bin', '/usr/bin', '/bin',
  ].filter(Boolean).join(SEP),
  HOME,
  LANG: 'en_US.UTF-8',
}

const SESSION_TTL_MS = 30 * 60 * 1000   // kill idle processes after 30 min
const RESPONSE_TIMEOUT_MS = 10 * 60_000 // 10 min — allows time for user approval clicks

interface PendingReq {
  resolve: (r: { text: string; usage?: TokenUsage }) => void
  reject:  (e: Error) => void
  texts:   string[]
  usage?:  TokenUsage
  timer:   ReturnType<typeof setTimeout>
}

interface ProtoSession {
  proc:             ChildProcess
  sessionId:        string
  lastUsed:         number
  pending:          Map<string, PendingReq>
  buf:              string   // incomplete stdout line buffer
  approvalHandler?: (callId: string, commandStr: string) => Promise<string>
  sessionApproved:  boolean  // true after user clicks "Aprovar Sessão"
}

// Map from cliclaw session.id → ProtoSession
const protoSessions = new Map<string, ProtoSession>()

function formatApprovalCommand(cmd: any): string {
  if (!cmd) return '(unknown)'
  if (cmd.type === 'shell' && Array.isArray(cmd.command)) return cmd.command.join(' ')
  if (typeof cmd === 'string') return cmd
  if (Array.isArray(cmd)) return cmd.join(' ')
  return JSON.stringify(cmd)
}

// ─── cleanup idle sessions every 5 min ───────────────────────────────────────
setInterval(() => {
  const now = Date.now()
  for (const [id, ps] of protoSessions) {
    if (ps.pending.size === 0 && now - ps.lastUsed > SESSION_TTL_MS) {
      console.log(`[Codex] closing idle proto session ${ps.sessionId}`)
      try { ps.proc.stdin!.write(JSON.stringify({ id: 'shutdown', op: { type: 'shutdown' } }) + '\n') } catch {}
      setTimeout(() => { try { ps.proc.kill() } catch {} }, 2000)
      protoSessions.delete(id)
    }
  }
}, 5 * 60 * 1000)

// ─── start a codex proto process ─────────────────────────────────────────────
function startProto(appSessionId: string): ProtoSession {
  const isWin = process.platform === 'win32'
  const proc = spawn('codex', ['proto'], {
    env: { ...process.env, ...BASE_ENV },
    shell: isWin,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const ps: ProtoSession = {
    proc,
    sessionId: '',
    lastUsed: Date.now(),
    pending: new Map(),
    buf: '',
    sessionApproved: false,
  }

  proc.stdout!.on('data', (d: Buffer) => {
    const lines = (ps.buf + d.toString()).split('\n')
    ps.buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        handleProtoEvent(ps, obj)
      } catch {}
    }
  })

  proc.stderr!.on('data', (d: Buffer) => {
    const s = d.toString()
    // Only log actual errors, not Rust INFO/DEBUG log lines
    if (s.includes(' ERROR ') || (!s.includes(' INFO ') && !s.includes(' WARN ') && s.trim()))
      console.error('[Codex proto]', s.trim())
  })

  proc.on('close', () => {
    for (const [, req] of ps.pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Codex process exited unexpectedly'))
    }
    protoSessions.delete(appSessionId)
  })

  proc.on('error', (err) => {
    for (const [, req] of ps.pending) {
      clearTimeout(req.timer)
      req.reject(err)
    }
    protoSessions.delete(appSessionId)
  })

  protoSessions.set(appSessionId, ps)
  return ps
}

function handleProtoEvent(ps: ProtoSession, obj: any) {
  const msgId: string = obj.id
  const msg = obj.msg

  if (msg?.type === 'session_configured') {
    ps.sessionId = msg.session_id ?? ''
    return
  }

  // ── exec approval request ───────────────────────────────────────────────────
  if (msg?.type === 'exec_approval_request') {
    const subId      = msg.sub_id ?? msg.call_id ?? msgId
    const commandStr = formatApprovalCommand(msg.command ?? msg.cmd)
    console.log(`[Codex approval] request recebido sub_id=${subId} cmd="${commandStr.slice(0, 80)}"`)

    // Respond using the original message id so Codex can correlate the reply
    const respond = (decision: string) => {
      // Handle app-level session approval — Codex only understands 'approved'/'denied'/'abort'
      if (decision === 'approved_for_session') {
        ps.sessionApproved = true
        decision = 'approved'
      }
      console.log(`[Codex approval] enviando exec_approval sub_id=${subId} decision=${decision}`)
      try {
        ps.proc.stdin!.write(JSON.stringify({
          id:  msgId,   // use original event id, not a new UUID
          op:  { type: 'exec_approval', sub_id: subId, decision },
        }) + '\n')
        console.log(`[Codex approval] enviado ok`)
      } catch (e: any) {
        console.error(`[Codex approval] erro ao enviar: ${e.message}`)
      }
    }

    // If the user already approved the whole session, skip the prompt
    if (ps.sessionApproved) {
      console.log(`[Codex approval] sessão aprovada — auto-aprovando`)
      respond('approved')
      return
    }

    if (ps.approvalHandler) {
      console.log(`[Codex approval] aguardando usuário via Telegram...`)
      ps.approvalHandler(subId, commandStr)
        .then(respond)
        .catch((e: any) => {
          console.error(`[Codex approval] handler error: ${e?.message} — negando`)
          respond('denied')
        })
    } else {
      console.log(`[Codex approval] sem handler — auto-aprovando`)
      respond('approved')
    }
    return
  }

  const req = msgId ? ps.pending.get(msgId) : null
  if (!req) return

  switch (msg?.type) {
    case 'agent_message':
      if (msg.message) req.texts.push(msg.message)
      break
    case 'token_count': {
      const u = msg.info?.last_token_usage
      if (u) {
        req.usage = {
          input:      u.input_tokens         ?? 0,
          output:     u.output_tokens        ?? 0,
          cacheRead:  u.cached_input_tokens  ?? 0,
          cacheWrite: 0,
        }
      }
      break
    }
    case 'task_complete': {
      clearTimeout(req.timer)
      const text = req.texts.join('\n') || msg.last_agent_message || '[no response]'
      req.resolve({ text, usage: req.usage })
      ps.pending.delete(msgId)
      break
    }
    case 'error': {
      clearTimeout(req.timer)
      req.reject(new Error(msg.message ?? 'Codex error'))
      ps.pending.delete(msgId)
      break
    }
  }
}

function getOrStart(appSessionId: string): ProtoSession {
  const existing = protoSessions.get(appSessionId)
  if (existing && existing.proc.exitCode === null) {
    existing.lastUsed = Date.now()
    return existing
  }
  return startProto(appSessionId)
}

// ─── public API ──────────────────────────────────────────────────────────────
export async function askCodex(
  session:         { id: string; codexThreadId?: string },
  userMessage:     string,
  _onNewThreadId?: (id: string) => void,
  approvalHandler?: (callId: string, commandStr: string) => Promise<string>
): Promise<{ text: string; usage?: TokenUsage }> {
  const ps = getOrStart(session.id)
  // Update handler every call (chat context may have changed)
  if (approvalHandler !== undefined) ps.approvalHandler = approvalHandler
  const msgId = randomUUID()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ps.pending.delete(msgId)
      reject(new Error('Codex response timeout (120s)'))
    }, RESPONSE_TIMEOUT_MS)

    ps.pending.set(msgId, {
      resolve,
      reject,
      texts: [],
      timer,
    })

    const op = JSON.stringify({
      id: msgId,
      op: { type: 'user_input', items: [{ type: 'text', text: userMessage }] },
    })

    try {
      ps.proc.stdin!.write(op + '\n')
    } catch (err: any) {
      clearTimeout(timer)
      ps.pending.delete(msgId)
      reject(new Error(`Failed to write to codex: ${err.message}`))
    }
  }).then(
    (r: any) => r,
    async (err: Error) => ({ text: `❌ Codex error: ${err.message}` })
  )
}

export function killCodexSession(appSessionId: string) {
  const ps = protoSessions.get(appSessionId)
  if (ps) {
    try { ps.proc.kill() } catch {}
    protoSessions.delete(appSessionId)
  }
}
