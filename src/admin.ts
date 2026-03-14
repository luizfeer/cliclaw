import { spawn } from 'child_process'

const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/
const DEFAULT_TIMEOUT_MS = 30_000

function runCommand(command: string, args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: process.env,
      cwd: process.cwd(),
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      resolve('⏱️ Comando excedeu o tempo limite de 30s.')
    }, timeoutMs)

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
      if (code === 0) {
        resolve(output || '[sem saída]')
        return
      }
      reject(new Error(output || `Comando falhou com código ${code}`))
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function assertSafeName(name: string, label: string): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`${label} inválido: use apenas letras, números, ponto, hífen e underscore.`)
  }
  return name
}

function parseJsonLines<T>(raw: string): T[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T)
}

export function dockerHelpText(): string {
  return [
    'Uso de `/docker`:',
    '`/docker status` - lista containers',
    '`/docker restart <container>`',
    '`/docker start <container>`',
    '`/docker stop <container>`',
    '`/docker logs <container>`',
    '`/docker images` - lista imagens',
  ].join('\n')
}

export function pm2HelpText(): string {
  return [
    'Uso de `/pm2`:',
    '`/pm2 status` - lista processos',
    '`/pm2 restart <app>`',
    '`/pm2 start <app>`',
    '`/pm2 stop <app>`',
    '`/pm2 logs <app>`',
    '`/pm2 info <app>`',
  ].join('\n')
}

export async function runDockerCommand(rawArgs: string): Promise<string> {
  const [action = 'status', target = ''] = rawArgs.trim().split(/\s+/, 2)

  switch (action) {
    case 'status':
    case 'ps':
    case 'list':
      {
        const raw = await runCommand('sg', ['docker', '-c', `docker ps -a --format '{{json .}}'`])
        const rows = parseJsonLines<{ Names: string, Image: string, Status: string, Ports: string }>(raw)
        if (rows.length === 0) return '**Docker status**\nNenhum container encontrado.'
        return [
          '**Docker status**',
          ...rows.map(row =>
            `• \`${row.Names}\` - ${row.Status}${row.Ports ? `\n  ${row.Image} | ${row.Ports}` : `\n  ${row.Image}`}`
          ),
        ].join('\n')
      }
    case 'images':
      return `**Docker images**\n\n\`\`\`\n${await runCommand('sg', ['docker', '-c', `docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"`])}\n\`\`\``
    case 'restart':
    case 'start':
    case 'stop':
      return `**Docker ${action}**\nContainer \`${target}\`.\n\n\`\`\`\n${await runCommand('sg', ['docker', '-c', `docker ${action} ${assertSafeName(target, 'Container')}`])}\n\`\`\``
    case 'logs':
      return `**Docker logs: ${target}**\n\n\`\`\`\n${await runCommand('sg', ['docker', '-c', `docker logs --tail 80 ${assertSafeName(target, 'Container')}`], 60_000)}\n\`\`\``
    default:
      throw new Error('Subcomando Docker inválido.')
  }
}

export async function runPm2Command(rawArgs: string): Promise<string> {
  const [action = 'status', target = ''] = rawArgs.trim().split(/\s+/, 2)

  switch (action) {
    case 'status':
    case 'list':
      {
        const raw = await runCommand('pm2', ['jlist'])
        const apps = JSON.parse(raw) as Array<{
          name?: string
          pid?: number
          pm2_env?: { status?: string, restart_time?: number }
          monit?: { memory?: number }
        }>
        if (apps.length === 0) return '**PM2 status**\nNenhum processo encontrado.'
        return [
          '**PM2 status**',
          ...apps.map(app => {
            const memMb = app.monit?.memory ? `${Math.round(app.monit.memory / 1024 / 1024)} MB` : '0 MB'
            const pid = app.pid && app.pid > 0 ? String(app.pid) : 'n/a'
            const restarts = app.pm2_env?.restart_time ?? 0
            return `• \`${app.name || 'sem-nome'}\` - ${app.pm2_env?.status || 'desconhecido'}\n  pid ${pid} | mem ${memMb} | restarts ${restarts}`
          }),
        ].join('\n')
      }
    case 'restart':
    case 'start':
    case 'stop':
      return `**PM2 ${action}**\nApp \`${target}\`.\n\n\`\`\`\n${await runCommand('pm2', [action, assertSafeName(target, 'App')])}\n\`\`\``
    case 'logs':
      return `**PM2 logs: ${target}**\n\n\`\`\`\n${await runCommand('pm2', ['logs', assertSafeName(target, 'App'), '--lines', '80', '--nostream'], 60_000)}\n\`\`\``
    case 'info':
    case 'show':
      return `**PM2 info: ${target}**\n\n\`\`\`\n${await runCommand('pm2', ['show', assertSafeName(target, 'App')])}\n\`\`\``
    default:
      throw new Error('Subcomando PM2 inválido.')
  }
}
