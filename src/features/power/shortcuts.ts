import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
export type ShortcutAction =
  | 'palette'
  | 'quickAdd'
  | 'focus'
  | 'nextTask'
  | 'previousTask'
  | 'toggleSelection'
  | 'help'

export type ShortcutMap = Record<ShortcutAction, string>

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  palette: 'mod+k',
  quickAdd: 'q',
  focus: 'f',
  nextTask: 'j',
  previousTask: 'k',
  toggleSelection: 'x',
  help: '?',
}

// Fixed command-first aliases remain reserved so a custom binding cannot silently shadow them.
export const RESERVED_SHORTCUTS = new Set(['escape', 'enter', 'mod+a', 'mod+shift+a', 'alt+left', 'alt+right', 'g', 'c', 'n', 'p', 't', '/', 'tab', 'space', 'down', 'up', 'left', 'right'])

export const SHORTCUT_META: { action: ShortcutAction; label: string; note: string }[] = [
  { action: 'palette', label: 'Command palette', note: 'Search every command' },
  { action: 'quickAdd', label: 'Quick Add', note: 'Capture without leaving the current view' },
  { action: 'focus', label: 'Focus', note: 'Start or resume Focus' },
  { action: 'nextTask', label: 'Next task', note: 'Move keyboard focus down the visible task list' },
  { action: 'previousTask', label: 'Previous task', note: 'Move keyboard focus up the visible task list' },
  { action: 'toggleSelection', label: 'Select task', note: 'Toggle the currently focused task in the bulk selection' },
  { action: 'help', label: 'Shortcut help', note: 'Open the shortcut reference' },
]

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  if (element.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function normalizeShortcutEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  const key = normalizeKey(event.key)
  if (!key || ['shift', 'control', 'alt', 'meta'].includes(key)) return null
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && key !== '?') parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

function normalizeKey(key: string) {
  if (key === ' ') return 'space'
  if (key === 'Escape') return 'escape'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

export function matchesShortcut(event: KeyboardEvent, binding?: string): boolean {
  if (!binding) return false
  return normalizeShortcutEvent(event) === binding
}

export function formatShortcut(binding: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return binding.split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl'
    if (part === 'alt') return mac ? '⌥' : 'Alt'
    if (part === 'shift') return 'Shift'
    if (part === 'space') return 'Space'
    if (part === 'escape') return 'Esc'
    if (part === 'down') return '↓'
    if (part === 'up') return '↑'
    if (part === 'left') return '←'
    if (part === 'right') return '→'
    return part.length === 1 ? part.toUpperCase() : part
  }).join(mac ? '' : '+')
}


export function normalizeShortcutMap(value: unknown): ShortcutMap {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SHORTCUTS }
  const raw = value as Record<string, unknown>
  const next = { ...DEFAULT_SHORTCUTS }
  for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
    if (typeof raw[action] === 'string' && raw[action].trim()) next[action] = raw[action].trim().toLowerCase()
  }
  if (shortcutConflicts(next).size || Object.values(next).some((binding) => RESERVED_SHORTCUTS.has(binding))) return { ...DEFAULT_SHORTCUTS }
  return next
}

export function shortcutConflicts(map: ShortcutMap): Map<string, ShortcutAction[]> {
  const reverse = new Map<string, ShortcutAction[]>()
  for (const [action, binding] of Object.entries(map) as [ShortcutAction, string][]) {
    const list = reverse.get(binding) ?? []
    list.push(action)
    reverse.set(binding, list)
  }
  return new Map([...reverse.entries()].filter(([, actions]) => actions.length > 1))
}
