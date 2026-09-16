import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { formatShortcut } from './shortcuts'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

const RECENT_COMMANDS_KEY = 'folio:command-recents:v1'
const MAX_RECENT_COMMANDS = 7

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
  children?: PowerCommand[]
  run: () => void | Promise<void>
}

interface CommandPath {
  command: PowerCommand
  parents: PowerCommand[]
  recent?: boolean
  score?: number
}

function loadRecentCommandIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT_COMMANDS) : []
  } catch {
    return []
  }
}

function persistRecentCommandIds(ids: string[]) {
  try { window.localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_COMMANDS))) } catch { /* Recents are an enhancement, never a requirement. */ }
}

function collectCommandPaths(commands: PowerCommand[], parents: PowerCommand[] = []): CommandPath[] {
  const paths: CommandPath[] = []
  for (const command of commands) {
    paths.push({ command, parents })
    if (command.children?.length) paths.push(...collectCommandPaths(command.children, [...parents, command]))
  }
  return paths
}

function findCommandPath(commands: PowerCommand[], id: string): CommandPath | undefined {
  return collectCommandPaths(commands).find((entry) => entry.command.id === id && !entry.command.children?.length)
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function subsequencePenalty(haystack: string, needle: string): number | null {
  let cursor = 0
  let first = -1
  let last = -1
  for (const char of needle) {
    const next = haystack.indexOf(char, cursor)
    if (next < 0) return null
    if (first < 0) first = next
    last = next
    cursor = next + 1
  }
  return Math.max(0, first) + Math.max(0, last - first - needle.length + 1) * 1.5
}

function scorePath(entry: CommandPath, query: string): number | null {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0
  const parentLabels = entry.parents.map((parent) => parent.label).join(' ')
  const primary = normalizeText(`${parentLabels} ${entry.command.label}`)
  const haystack = normalizeText(`${primary} ${entry.command.group} ${entry.command.note ?? ''} ${entry.command.keywords ?? ''}`)
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  let score = entry.parents.length * 0.35

  for (const token of tokens) {
    const exactIndex = haystack.indexOf(token)
    if (exactIndex >= 0) {
      const primaryIndex = primary.indexOf(token)
      score += primaryIndex >= 0 ? Math.min(3, primaryIndex / 18) : 5 + Math.min(4, exactIndex / 30)
      continue
    }
    const fuzzy = subsequencePenalty(haystack, token)
    if (fuzzy == null) return null
    score += 12 + Math.min(12, fuzzy)
  }

  const label = normalizeText(entry.command.label)
  if (label === normalizedQuery) score -= 10
  else if (label.startsWith(normalizedQuery)) score -= 5
  else if (primary.startsWith(normalizedQuery)) score -= 3
  return score
}

export function CommandPalette({ open, commands, onClose }: {
  open: boolean
  commands: PowerCommand[]
  onClose: () => void
}) {
  useOverlayScrollLock(open)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [scopeStack, setScopeStack] = useState<PowerCommand[]>([])
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>(loadRecentCommandIds)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  useDialogFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    setScopeStack([])
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => { window.clearTimeout(timer) }
  }, [open])

  const deferredQuery = useDeferredValue(query)
  const scope = scopeStack[scopeStack.length - 1]
  const filtered = useMemo<CommandPath[]>(() => {
    const needle = deferredQuery.trim()
    const scopedCommands = scope?.children ?? commands

    if (!needle) {
      const base = scopedCommands.filter((command) => !command.searchOnly).map((command) => ({ command, parents: scopeStack }))
      if (scope) return base.slice(0, 60)

      const recent = recentCommandIds
        .map((id) => findCommandPath(commands, id))
        .filter((entry): entry is CommandPath => Boolean(entry && !entry.command.disabled))
        .map((entry) => ({ ...entry, recent: true }))
      const recentIds = new Set(recent.map((entry) => entry.command.id))
      return [...recent, ...base.filter((entry) => !recentIds.has(entry.command.id))].slice(0, 60)
    }

    const candidates = collectCommandPaths(scopedCommands, scopeStack)
      .map((entry) => ({ ...entry, score: scorePath(entry, needle) }))
      .filter((entry): entry is CommandPath & { score: number } => entry.score != null)
    candidates.sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label))
    return candidates.slice(0, 60)
  }, [commands, deferredQuery, recentCommandIds, scope, scopeStack])

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1))), [filtered.length])

  if (!open) return null

  function rememberCommand(command: PowerCommand) {
    const next = [command.id, ...recentCommandIds.filter((id) => id !== command.id)].slice(0, MAX_RECENT_COMMANDS)
    setRecentCommandIds(next)
    persistRecentCommandIds(next)
  }

  function goBack() {
    if (!scopeStack.length) return false
    setScopeStack((current) => current.slice(0, -1))
    setQuery('')
    setActiveIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    return true
  }

  async function execute(entry: CommandPath | undefined) {
    if (!entry || entry.command.disabled) return
    if (entry.command.children?.length) {
      setScopeStack([...entry.parents, entry.command])
      setQuery('')
      setActiveIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
    rememberCommand(entry.command)
    onClose()
    await entry.command.run()
  }

  const activeEntry = filtered[activeIndex]
  const activeScopeLabel = scopeStack.map((item) => item.label).join(' › ')

  return (
    <div className="command-palette-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="command-palette command-palette--v17" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1}>
        <div className="command-palette__search">
          <div className="command-palette__prompt">
            <Icon name="search" />
            {scope ? <button type="button" className="command-palette__scope" onClick={goBack} title="Back to previous command level">{scope.label}</button> : null}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            placeholder={scope ? `Search ${scope.label.toLocaleLowerCase()}…` : 'Type a command or search Folio…'}
            aria-label={scope ? `Search ${scope.label}` : 'Type a command or search Folio'}
            aria-activedescendant={activeEntry ? `folio-command-${activeEntry.command.id}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
              if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0) }
              if (event.key === 'End') { event.preventDefault(); setActiveIndex(Math.max(0, filtered.length - 1)) }
              if (event.key === 'ArrowRight' && activeEntry?.command.children?.length) { event.preventDefault(); void execute(activeEntry) }
              if (event.key === 'ArrowLeft' && scopeStack.length) { event.preventDefault(); goBack() }
              if (event.key === 'Backspace' && !query && scopeStack.length) { event.preventDefault(); goBack() }
              if (event.key === 'Enter') { event.preventDefault(); void execute(activeEntry) }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                if (!goBack()) onClose()
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        {scope ? <div className="command-palette__breadcrumb"><span>Command</span><strong>{activeScopeLabel}</strong><small>← or Backspace to go back</small></div> : null}
        <div className="command-palette__results" role="listbox" aria-label={scope ? `${scope.label} options` : 'Commands'}>
          {filtered.length ? filtered.map((entry, index) => {
            const command = entry.command
            const context = entry.parents.length ? entry.parents.map((parent) => parent.label).join(' › ') : command.group
            const group = entry.recent ? `Recent · ${context}` : entry.parents.length ? `${context} · ${command.group}` : command.group
            return (
              <button
                id={`folio-command-${command.id}`}
                key={`${entry.parents.map((parent) => parent.id).join('/')}/${command.id}`}
                type="button"
                className={`${index === activeIndex ? 'is-active' : ''} ${command.destructive ? 'is-destructive' : ''} ${entry.recent ? 'is-recent' : ''}`.trim()}
                disabled={command.disabled}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void execute(entry)}
              >
                <span className="command-palette__command-copy">
                  <small>{group}</small>
                  <strong>{command.label}</strong>
                  {command.note ? <span>{command.note}</span> : null}
                </span>
                {command.children?.length ? <span className="command-palette__drill" aria-hidden="true">→</span> : command.shortcut ? <kbd>{formatShortcut(command.shortcut)}</kbd> : null}
              </button>
            )
          }) : <div className="command-palette__empty">No command or workspace item matches “{query}”.</div>}
        </div>
        <footer className="command-palette__footer">
          <span>↑ ↓ Navigate</span>
          <span>{scope ? '← Back' : 'Esc Close'}</span>
          <span>Enter Run / Open</span>
          <span>{scope ? activeScopeLabel : recentCommandIds.length ? 'Recent actions stay at the top.' : 'Type to search commands and workspace.'}</span>
        </footer>
      </section>
    </div>
  )
}
