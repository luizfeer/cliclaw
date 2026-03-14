const TELEGRAM_MD_V2_SPECIAL_CHARS = /([_*\[\]()~`>#+\-=|{}.!\\])/g

function escapeTelegramMarkdownV2(text: string): string {
  return text.replace(TELEGRAM_MD_V2_SPECIAL_CHARS, '\\$1')
}

export function formatTelegramMarkdown(text: string): string {
  let formatted = text.replace(/\r\n/g, '\n')
  const segments: string[] = []
  const protectSegments = (pattern: RegExp, render: (match: string, ...groups: string[]) => string) => {
    formatted = formatted.replace(pattern, (...args) => {
      const match = args[0] as string
      const groups = args.slice(1, -2) as string[]
      const token = `@@TG${segments.length}@@`
      segments.push(render(match, ...groups))
      return token
    })
  }

  protectSegments(
    /```([a-zA-Z0-9_+-]+)?\n?([\s\S]*?)```/g,
    (_match, language = '', code = '') => {
      const safeLanguage = escapeTelegramMarkdownV2(language)
      const safeCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
      return `\`\`\`${safeLanguage ? safeLanguage + '\n' : '\n'}${safeCode}\`\`\``
    }
  )

  protectSegments(
    /`([^`\n]+)`/g,
    (_match, code = '') => `\`${code.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``
  )

  protectSegments(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label = '', url = '') => `[${escapeTelegramMarkdownV2(label)}](${url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)')})`
  )

  formatted = formatted.replace(/^#{1,6}[ \t]+(.+)$/gm, (_match, title: string) => `*${escapeTelegramMarkdownV2(title.trim())}*`)
  formatted = formatted.replace(/^(?:[ \t]*)([-*])[ \t]+/gm, '• ')
  formatted = formatted.replace(/\*\*([^*\n]+)\*\*/g, (_match, bold: string) => `*${escapeTelegramMarkdownV2(bold)}*`)
  formatted = formatted.replace(/__([^_\n]+)__/g, (_match, bold: string) => `*${escapeTelegramMarkdownV2(bold)}*`)

  formatted = escapeTelegramMarkdownV2(formatted)

  for (let i = 0; i < segments.length; i++) {
    const token = escapeTelegramMarkdownV2(`@@TG${i}@@`)
    formatted = formatted.replace(token, segments[i]!)
  }

  return formatted
}

export function splitTelegramMessage(text: string, maxLen = 3800): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLen)
    if (splitAt < maxLen / 2) splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen / 2) splitAt = remaining.lastIndexOf(' ', maxLen)
    if (splitAt < maxLen / 2) splitAt = maxLen

    const chunk = remaining.slice(0, splitAt).trim()
    if (chunk) chunks.push(chunk)
    remaining = remaining.slice(splitAt).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks.length > 0 ? chunks : ['']
}

export const TELEGRAM_MARKDOWN_OPTS = { parse_mode: 'MarkdownV2' as const }
