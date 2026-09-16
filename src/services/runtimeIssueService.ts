export type RuntimeIssueKind = 'render' | 'promise' | 'window' | 'recovery'

export interface RuntimeIssue {
  id: string
  kind: RuntimeIssueKind
  message: string
  detail?: string
  occurredAt: string
}

type Listener = (issue: RuntimeIssue | null) => void
let current: RuntimeIssue | null = null
const listeners = new Set<Listener>()

function messageOf(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return 'Unexpected application error.' }
}

export function reportRuntimeIssue(kind: RuntimeIssueKind, value: unknown, detail?: string) {
  current = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    message: messageOf(value),
    detail,
    occurredAt: new Date().toISOString(),
  }
  for (const listener of listeners) listener(current)
  return current
}

export function dismissRuntimeIssue() {
  current = null
  for (const listener of listeners) listener(null)
}

export function subscribeRuntimeIssues(listener: Listener) {
  listeners.add(listener)
  listener(current)
  return () => { listeners.delete(listener) }
}

let installed = false
export function installGlobalRuntimeIssueHandlers() {
  if (installed) return
  installed = true
  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeIssue('promise', event.reason)
    console.error('Unhandled promise rejection', event.reason)
  })
  window.addEventListener('error', (event) => {
    if (!event.error) return
    reportRuntimeIssue('window', event.error, `${event.filename ?? ''}:${event.lineno ?? 0}:${event.colno ?? 0}`)
  })
}
