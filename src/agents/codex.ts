import { spawn } from 'child_process'
import type { Session } from '../storage'

const HOME = process.env.HOME || '/root'
const BASE_ENV = {
  PATH: `${HOME}/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  HOME,
  LANG: 'en_US.UTF-8',
}

function spawnCodex(args: string[]): Promise<{ text: string; threadId: string | null }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    const proc = spawn('codex', args, {
      env: { ...process.env, ...BASE_ENV },
      cwd: process.cwd(),
    })
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString().trim()
      if (s) console.error('[Codex stderr]', s)
    })
    proc.on('close', (code) => {
      const lines = stdout.split('\n').filter(l => l.trim())
      const texts: string[] = []
      let threadId: string | null = null
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'thread.started' && obj.thread_id) threadId = obj.thread_id
          if (obj.type === 'item.completed' && obj.item?.type === 'agent_message' && obj.item?.text)
            texts.push(obj.item.text)
        } catch {}
      }
      if (texts.length > 0) resolve({ text: texts.join('\n'), threadId })
      else if (code !== 0) reject(new Error(`Codex exited with code ${code}`))
      else resolve({ text: '[no response]', threadId })
    })
    proc.on('error', reject)
  })
}

export async function askCodex(
  session: Session,
  userMessage: string,
  onNewThreadId?: (id: string) => void
): Promise<string> {
  try {
    const codexThreadId = session.codexThreadId
    const args = codexThreadId
      ? ['exec', 'resume', codexThreadId, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--json', userMessage]
      : ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--json', userMessage]
    const { text, threadId } = await spawnCodex(args)
    if (threadId && !codexThreadId) onNewThreadId?.(threadId)
    return text
  } catch (err: any) {
    return `❌ Codex error: ${err.message}`
  }
}
