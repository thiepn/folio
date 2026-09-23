import { createElement, type ReactNode } from 'react'

function safeHref(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : undefined
  } catch { return undefined }
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\\x60[^\\x60]+\\x60|\\*\\*[^*]+\\*\\*|\\[[^\\]]+\\]\\([^)]+\\))/g
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const token = match[0]
    if (token.startsWith('\\x60')) nodes.push(<code key={keyPrefix + '-c-' + index}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) nodes.push(<strong key={keyPrefix + '-b-' + index}>{token.slice(2, -2)}</strong>)
    else {
      const parts = token.match(/^\\[([^\\]]+)\\]\\(([^)]+)\\)$/)
      const href = parts ? safeHref(parts[2]) : undefined
      nodes.push(href ? <a key={keyPrefix + '-a-' + index} href={href} target="_blank" rel="noopener noreferrer">{parts?.[1]}</a> : token)
    }
    last = start + token.length
    index += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function toggleMarkdownCheckbox(value: string, lineIndex: number) {
  const lines = value.split('\\n')
  const line = lines[lineIndex]
  if (line == null) return value
  lines[lineIndex] = line.replace(/^(\\s*[-*]\\s+)\\[([ xX])\\]/, (_match, prefix: string, state: string) => `${prefix}[${state.toLowerCase() === 'x' ? ' ' : 'x'}]`)
  return lines.join('\\n')
}

export function SafeMarkdown({ value, onToggleChecklist }: { value: string; onToggleChecklist?: (lineIndex: number) => void }) {
  const lines = value.replace(/\\r\\n?/g, '\\n').split('\\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('\`\`\`')) {
      const language = line.slice(3).trim()
      const code: string[] = []
      const start = i
      i += 1
      while (i < lines.length && !lines[i].startsWith('\`\`\`')) { code.push(lines[i]); i += 1 }
      if (i < lines.length) i += 1
      blocks.push(<pre key={'code-' + start} data-language={language || undefined}><code>{code.join('\\n')}</code></pre>)
      continue
    }
    const heading = line.match(/^(#{1,6})\\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(createElement(`h${level}`, { key: 'h-' + i }, inline(heading[2], 'h-' + i)))
      i += 1
      continue
    }
    const checkbox = line.match(/^\\s*[-*]\\s+\\[([ xX])\\]\\s+(.*)$/)
    if (checkbox) {
      const lineIndex = i
      blocks.push(<label className="markdown-checkbox" key={'check-' + i}><input type="checkbox" checked={checkbox[1].toLowerCase() === 'x'} onChange={() => onToggleChecklist?.(lineIndex)} disabled={!onToggleChecklist} /><span>{inline(checkbox[2], 'check-' + i)}</span></label>)
      i += 1
      continue
    }
    if (/^\\s*[-*]\\s+/.test(line)) {
      const start = i
      const items: ReactNode[] = []
      while (i < lines.length && /^\\s*[-*]\\s+/.test(lines[i]) && !/^\\s*[-*]\\s+\\[[ xX]\\]/.test(lines[i])) {
        items.push(<li key={'ul-' + i}>{inline(lines[i].replace(/^\\s*[-*]\\s+/, ''), 'ul-' + i)}</li>)
        i += 1
      }
      blocks.push(<ul key={'ul-block-' + start}>{items}</ul>)
      continue
    }
    if (/^\\s*\\d+\\.\\s+/.test(line)) {
      const start = i
      const items: ReactNode[] = []
      while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) {
        items.push(<li key={'ol-' + i}>{inline(lines[i].replace(/^\\s*\\d+\\.\\s+/, ''), 'ol-' + i)}</li>)
        i += 1
      }
      blocks.push(<ol key={'ol-block-' + start}>{items}</ol>)
      continue
    }
    if (/^>\\s?/.test(line)) {
      const start = i
      const quoted: string[] = []
      while (i < lines.length && /^>\\s?/.test(lines[i])) { quoted.push(lines[i].replace(/^>\\s?/, '')); i += 1 }
      blocks.push(<blockquote key={'quote-' + start}>{quoted.map((row, offset) => <p key={offset}>{inline(row, 'quote-' + start + '-' + offset)}</p>)}</blockquote>)
      continue
    }
    if (!line.trim()) { blocks.push(<div className="markdown-spacer" key={'space-' + i} />); i += 1; continue }
    blocks.push(<p key={'p-' + i}>{inline(line, 'p-' + i)}</p>)
    i += 1
  }
  return <div className="safe-markdown">{blocks}</div>
}
