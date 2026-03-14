/**
 * Converte Markdown padrão (Claude/Codex) para HTML do Telegram.
 * Telegram suporta: <b> <i> <u> <s> <code> <pre> <a href="">
 */
export function mdToTg(text: string): string {
  let s = text

  // 1. Proteger blocos de código antes de qualquer conversão
  const codeBlocks: string[] = []
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    const esc = escHtml(code.trimEnd())
    const block = lang
      ? `<pre><code class="language-${lang}">${esc}</code></pre>`
      : `<pre>${esc}</pre>`
    codeBlocks.push(block)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // 2. Inline code
  const inlineCodes: string[] = []
  s = s.replace(/`([^`\n]+)`/g, (_: string, c: string) => {
    inlineCodes.push(`<code>${escHtml(c)}</code>`)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  // 3. Escapar HTML do texto livre
  s = escHtml(s)

  // 4. Headers → negrito
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')

  // 5. Bold
  s = s.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>')
  s = s.replace(/__(.+?)__/gs, '<b>$1</b>')

  // 6. Italic
  s = s.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
  s = s.replace(/_([^_\n]+?)_/g, '<i>$1</i>')

  // 7. Strikethrough
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // 8. Links
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')

  // 9. Bullet lists
  s = s.replace(/^[ \t]*[-*+]\s+/gm, '• ')

  // 10. Linha horizontal
  s = s.replace(/^[-*_]{3,}$/gm, '──────────────')

  // 11. Restaurar blocos protegidos
  s = s.replace(/\x00CB(\d+)\x00/g, (_: string, i: string) => codeBlocks[Number(i)])
  s = s.replace(/\x00IC(\d+)\x00/g, (_: string, i: string) => inlineCodes[Number(i)])

  return s.trim()
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Divide em chunks sem cortar no meio de tags */
export function splitHtml(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > 0) {
    if (rest.length <= maxLen) { chunks.push(rest); break }
    let cut = rest.lastIndexOf('\n', maxLen)
    if (cut < maxLen / 2) cut = maxLen
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  return chunks
}
