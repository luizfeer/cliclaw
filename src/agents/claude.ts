import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { Session } from '../storage'

const CLAUDE_BIN = '/home/ubuntu/.npm-global/bin/claude'

function buildEnv() {
  const e: Record<string, string> = {
    ...process.env as any,
    PATH: '/home/ubuntu/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/home/ubuntu',
    LANG: 'en_US.UTF-8',
  }
  delete e.ANTHROPIC_API_KEY
  return e
}

// Roda o CLI e retorna quando terminar — sem matar o processo por timeout
function spawnClaude(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(CLAUDE_BIN, args, { env: buildEnv() })

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      const out = stdout.trim()
      if (out) resolve(out)
      else reject(new Error(stderr.trim() || `Claude saiu com código ${code}`))
    })
    proc.on('error', reject)
  })
}

export async function askClaude(
  session: Session,
  userMessage: string,
  onNewSessionId?: (id: string) => void
): Promise<string> {
  try {
    if (session.claudeSessionId) {
      // Retomar sessão existente
      const out = await spawnClaude([
        '--resume', session.claudeSessionId,
        '-p', userMessage,
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ])
      return out
    } else {
      // Nova sessão — output JSON para capturar o session_id real
      const newId = randomUUID()
      const raw = await spawnClaude([
        '-p', userMessage,
        '--output-format', 'json',
        '--session-id', newId,
        '--dangerously-skip-permissions',
      ])
      try {
        const obj = JSON.parse(raw)
        const text = obj.result ?? String(raw)
        const sid  = obj.session_id ?? newId
        onNewSessionId?.(sid)   // salva SOMENTE após sucesso
        return text
      } catch {
        onNewSessionId?.(newId)
        return raw
      }
    }
  } catch (err: any) {
    return `❌ Erro Claude: ${err.message}`
  }
}

export function killSession(_id: string) { /* no-op */ }
