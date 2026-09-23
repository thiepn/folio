import { useRef, useState } from 'react'
import { SafeMarkdown, toggleMarkdownCheckbox } from './SafeMarkdown'

const TICK = String.fromCharCode(96)
const FENCE = TICK.repeat(3)

export function MarkdownEditor({ value, onChange, label = 'Notes · Markdown', placeholder = 'Write Markdown…' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  const [mode, setMode] = useState<'edit' | 'read'>('edit')
  const textarea = useRef<HTMLTextAreaElement>(null)

  function replaceSelection(before: string, after = '', fallback = '') {
    const target = textarea.current
    if (!target) return
    const start = target.selectionStart
    const end = target.selectionEnd
    const selection = value.slice(start, end) || fallback
    const next = value.slice(0, start) + before + selection + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      target.focus()
      const cursor = start + before.length + selection.length + after.length
      target.setSelectionRange(cursor, cursor)
    })
  }

  function linePrefix(prefix: string) {
    const target = textarea.current
    if (!target) return
    const originalCursor = target.selectionStart
    const start = value.lastIndexOf('\n', Math.max(0, originalCursor - 1)) + 1
    onChange(value.slice(0, start) + prefix + value.slice(start))
    requestAnimationFrame(() => { target.focus(); const cursor = originalCursor + prefix.length; target.setSelectionRange(cursor, cursor) })
  }

  return <section className="markdown-editor">
    <header className="markdown-editor__head"><span>{label}</span><div><button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}>Edit</button><button type="button" className={mode === 'read' ? 'is-active' : ''} onClick={() => setMode('read')}>Reading</button></div></header>
    {mode === 'edit' ? <>
      <div className="markdown-toolbar" aria-label="Markdown formatting">
        <button type="button" onClick={() => linePrefix('## ')} title="Heading">H2</button>
        <button type="button" onClick={() => replaceSelection('**', '**', 'bold')}>Bold</button>
        <button type="button" onClick={() => linePrefix('- ')}>List</button>
        <button type="button" onClick={() => linePrefix('- [ ] ')}>Checklist</button>
        <button type="button" onClick={() => linePrefix('> ')}>Quote</button>
        <button type="button" onClick={() => replaceSelection(TICK, TICK, 'code')}>Code</button>
        <button type="button" onClick={() => replaceSelection(FENCE + '\n', '\n' + FENCE, 'code block')}>Block</button>
        <button type="button" onClick={() => replaceSelection('[', '](https://)', 'link text')}>Link</button>
      </div>
      <textarea ref={textarea} className="markdown-editor__textarea" rows={10} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} spellCheck />
    </> : <div className="markdown-reading-surface"><SafeMarkdown value={value} onToggleChecklist={(lineIndex) => onChange(toggleMarkdownCheckbox(value, lineIndex))} /></div>}
  </section>
}
