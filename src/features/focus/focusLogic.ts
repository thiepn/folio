import type { FocusSessionEntity } from '../../domain/models'

export function effectiveFocusSeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  const base = Math.max(0, session.durationSeconds || 0)
  if (session.status !== 'running' || !session.resumedAt) return capped(session, base)
  const resumed = new Date(session.resumedAt).getTime()
  const live = Number.isFinite(resumed) ? Math.max(0, Math.floor((nowMs - resumed) / 1000)) : 0
  return capped(session, base + live)
}

function capped(session: FocusSessionEntity, seconds: number) {
  if (session.mode === 'countdown' && session.targetSeconds) return Math.min(seconds, session.targetSeconds)
  return seconds
}

export function focusDisplaySeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  const elapsed = effectiveFocusSeconds(session, nowMs)
  return session.mode === 'countdown' && session.targetSeconds ? Math.max(0, session.targetSeconds - elapsed) : elapsed
}

export function countdownReached(session: FocusSessionEntity, nowMs = Date.now()): boolean {
  return session.mode === 'countdown' && Boolean(session.targetSeconds) && effectiveFocusSeconds(session, nowMs) >= (session.targetSeconds ?? Infinity)
}

export function formatFocusClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60)
}
