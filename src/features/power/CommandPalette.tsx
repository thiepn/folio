import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { formatShortcut } from './shortcuts'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

export interface PowerCommand {
  id: string
  label: string
  group: string
  note?: string
  keywords?: string
  shortcut?: string
  destructive?: boolean
  disabled?: boolean
  searchOnly?: boolean
  run: () => void | Promise<void>
}

export function CommandPalette({ open, commands, onClose }: {
  open: boolean
  commands: PowerCommand[]
  onClose: () => void
}) {
  useOverlayScrollLock(open)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  useDialogFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => { window.clearTimeout(timer) }
  }, [open])

  const deferredQuery = useDeferredValue(query)
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) return commands.filter((command) => !command.searchOnly)

    const scored = commands.flatMap((command) => {
      const label = command.label.toLowerCase()
      const haystack = `${command.label} ${command.group} ${command.note ?? ''} ${command.keywords ?? ''}`.toLowerCase()
      const index = haystack.indexOf(needle)
      if (index < 0) return []
      const score = label === needle ? 0 : label.startsWith(needle) ? 1 : index < 12 ? 2 : 3
      return [{ command, score }]
    })
    scored.sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label))
    return scored.slice(0, 60).map(({ command }) => command)
  }, [commands, deferredQuery])

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1))), [filtered.length])

  if (!open) return null

  async function execute(command: PowerCommand | undefined) {
    if (!command || command.disabled) return
    onClose()
    await command.run()
  }

  return (
    <div className="command-palette-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1}>
        <div className="command-palette__search">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            placeholder="Search tasks, projects, habits, or commands…"
            aria-label="Search tasks, projects, habits, or commands"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
              if (event.key === 'Enter') { event.preventDefault(); void execute(filtered[activeIndex]) }
              if (event.key === 'Escape') { event.preventDefault(); onClose() }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette__results" role="listbox" aria-label="Commands">
          {filtered.length ? filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              className={`${index === activeIndex ? 'is-active' : ''} ${command.destructive ? 'is-destructive' : ''}`.trim()}
              disabled={command.disabled}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => void execute(command)}
            >
              <span className="command-palette__command-copy">
                <small>{command.group}</small>
                <strong>{command.label}</strong>
                {command.note ? <span>{command.note}</span> : null}
              </span>
              {command.shortcut ? <kbd>{formatShortcut(command.shortcut)}</kbd> : null}
            </button>
          )) : <div className="command-palette__empty">No result matches “{query}”.</div>}
        </div>
        <footer className="command-palette__footer"><span>↑ ↓ Navigate</span><span>Enter Open / Run</span><span>Type to search your workspace.</span></footer>
      </section>
    </div>
  )
}
