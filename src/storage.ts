import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export type Model = 'claude' | 'codex'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface Session {
  id: string
  name: string
  model: Model
  history: Message[]
  createdAt: string
  threadId: number           // ID do tópico Telegram (0 = DM)
  claudeSessionId?: string   // ID de sessão do Claude CLI
  codexThreadId?: string     // Thread ID do Codex CLI
}

export interface ChatData {
  chatId: string
  sessions: Session[]
  activeSessionId: string | null
}

export class Storage {
  private dataDir: string
  private cache: Map<string, ChatData> = new Map()

  constructor(dataDir: string) {
    this.dataDir = dataDir
    mkdirSync(dataDir, { recursive: true })
  }

  private filePath(chatId: string): string {
    return join(this.dataDir, `chat_${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  get(chatId: string): ChatData {
    if (this.cache.has(chatId)) return this.cache.get(chatId)!
    const path = this.filePath(chatId)
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as ChatData
      this.cache.set(chatId, data)
      return data
    }
    const data: ChatData = { chatId, sessions: [], activeSessionId: null }
    this.cache.set(chatId, data)
    return data
  }

  save(chatId: string, data: ChatData): void {
    this.cache.set(chatId, data)
    writeFileSync(this.filePath(chatId), JSON.stringify(data, null, 2), 'utf-8')
  }

  createSession(chatId: string, model: Model, threadId: number): Session {
    const data = this.get(chatId)
    const idx = data.sessions.length + 1
    const emoji = model === 'claude' ? '🟣 Claude' : '🟢 Codex'
    const session: Session = {
      id: randomUUID(),
      name: `${emoji} #${idx}`,
      model,
      history: [],
      createdAt: new Date().toISOString(),
      threadId,
    }
    data.sessions.push(session)
    data.activeSessionId = session.id
    this.save(chatId, data)
    return session
  }

  getSessionByThreadId(chatId: string, threadId: number): Session | null {
    const data = this.get(chatId)
    return data.sessions.find(s => s.threadId === threadId) || null
  }

  getActiveSession(chatId: string): Session | null {
    const data = this.get(chatId)
    if (!data.activeSessionId) return null
    return data.sessions.find(s => s.id === data.activeSessionId) || null
  }

  setActiveSession(chatId: string, sessionId: string): boolean {
    const data = this.get(chatId)
    if (!data.sessions.find(s => s.id === sessionId)) return false
    data.activeSessionId = sessionId
    this.save(chatId, data)
    return true
  }

  setClaudeSessionId(chatId: string, sessionId: string, claudeSessionId: string): void {
    const data = this.get(chatId)
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) { session.claudeSessionId = claudeSessionId; this.save(chatId, data) }
  }

  setCodexThreadId(chatId: string, sessionId: string, codexThreadId: string): void {
    const data = this.get(chatId)
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) { session.codexThreadId = codexThreadId; this.save(chatId, data) }
  }

  addMessage(chatId: string, sessionId: string, role: 'user' | 'assistant', content: string): void {
    const data = this.get(chatId)
    const session = data.sessions.find(s => s.id === sessionId)
    if (!session) return
    session.history.push({ role, content, timestamp: new Date().toISOString() })
    this.save(chatId, data)
  }

  clearSession(chatId: string, sessionId: string): void {
    const data = this.get(chatId)
    const session = data.sessions.find(s => s.id === sessionId)
    if (session) {
      session.history = []
      session.claudeSessionId = undefined
      session.codexThreadId = undefined
      this.save(chatId, data)
    }
  }

  deleteSession(chatId: string, sessionId: string): void {
    const data = this.get(chatId)
    data.sessions = data.sessions.filter(s => s.id !== sessionId)
    if (data.activeSessionId === sessionId) {
      data.activeSessionId = data.sessions.length > 0
        ? data.sessions[data.sessions.length - 1]!.id : null
    }
    this.save(chatId, data)
  }

  listSessions(chatId: string): Session[] {
    return this.get(chatId).sessions
  }
}
