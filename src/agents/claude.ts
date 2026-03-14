import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { Session } from '../storage'

const HOME = process.env.HOME || '/root'

function buildEnv() {
  const e: Record<string, string> = {
    ...process.env as any,
    PATH: `${HOME}/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    HOME,
    LANG: 'en_US.UTF-8',
  }
  delete e.ANTHROPIC_API_KEY
  return e
}

function spawnClaude(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn('claude', args, { env: buildEnv() })
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      const out = stdout.trim()
      if (out) resolve(out)
      else reject(new Error(stderr.trim() || `Claude exited with code ${code}`))
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
      return await spawnClaude([
        '--resume', session.claudeSessionId,
        '-p', userMessage,
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ])
    } else {
      const newId = randomUUID()
      const raw = await spawnClaude([
        '-p', userMessage,
        '--output-format', 'json',
        '--session-id', newId,
        '--dangerously-skip-permissions',
      ])
      try {
        const obj = JSON.parse(raw)
        onNewSessionId?.(obj.session_id ?? newId)
        return obj.result ?? raw
      } catch {
        onNewSessionId?.(newId)
        return raw
      }
    }
  } catch (err: any) {
    return `❌ Claude error: ${err.message}`
  }
}

export function killSession(_id: string) { /* no-op */ }
