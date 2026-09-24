import type { FocusPhase, FocusSessionEntity } from '../../domain/models'

function liveSeconds(session: FocusSessionEntity, nowMs = Date.now()) {
  if (session.status !== 'running' || !session.resumedAt) return 0
  const resumed = Date.parse(session.resumedAt)
  return Number.isFinite(resumed) ? Math.max(0, Math.floor((nowMs - resumed) / 1000)) : 0
}

export function focusPhaseTargetSeconds(session: FocusSessionEntity): number | undefined {
  if (session.mode === 'countdown') return session.targetSeconds
  if (session.mode !== 'pomodoro' || !session.cycle) return undefined
  const phase = session.phase ?? 'focus'
  if (phase === 'focus') return session.cycle.workSeconds
  if (phase === 'long-break') return session.cycle.longBreakSeconds
  return session.cycle.shortBreakSeconds
}

export function effectivePhaseSeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  const base = Math.max(0, session.phaseElapsedSeconds ?? 0)
  const target = focusPhaseTargetSeconds(session)
  const total = base + liveSeconds(session, nowMs)
  return target ? Math.min(total, target) : total
}

export function effectiveFocusSeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  const base = Math.max(0, session.durationSeconds || 0)
  if (session.status !== 'running' || !session.resumedAt) return base
  if (session.mode === 'pomodoro') {
    if ((session.phase ?? 'focus') !== 'focus') return base
    const phaseBase = Math.max(0, session.phaseElapsedSeconds ?? 0)
    const target = focusPhaseTargetSeconds(session) ?? Infinity
    const phaseTotal = Math.min(target, phaseBase + liveSeconds(session, nowMs))
    return base + Math.max(0, phaseTotal - phaseBase)
  }
  const seconds = base + liveSeconds(session, nowMs)
  if (session.mode === 'countdown' && session.targetSeconds) return Math.min(seconds, session.targetSeconds)
  return seconds
}

export function effectiveBreakSeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  const base = Math.max(0, session.breakSeconds ?? 0)
  if (session.mode !== 'pomodoro' || session.status !== 'running' || !session.resumedAt || (session.phase ?? 'focus') === 'focus') return base
  const phaseBase = Math.max(0, session.phaseElapsedSeconds ?? 0)
  const target = focusPhaseTargetSeconds(session) ?? Infinity
  const phaseTotal = Math.min(target, phaseBase + liveSeconds(session, nowMs))
  return base + Math.max(0, phaseTotal - phaseBase)
}

export function focusDisplaySeconds(session: FocusSessionEntity, nowMs = Date.now()): number {
  if (session.mode === 'pomodoro') {
    const target = focusPhaseTargetSeconds(session)
    return target ? Math.max(0, target - effectivePhaseSeconds(session, nowMs)) : effectivePhaseSeconds(session, nowMs)
  }
  const elapsed = effectiveFocusSeconds(session, nowMs)
  return session.mode === 'countdown' && session.targetSeconds ? Math.max(0, session.targetSeconds - elapsed) : elapsed
}

export function countdownReached(session: FocusSessionEntity, nowMs = Date.now()): boolean {
  const target = focusPhaseTargetSeconds(session)
  if (!target) return false
  if (session.mode === 'pomodoro') return effectivePhaseSeconds(session, nowMs) >= target
  return session.mode === 'countdown' && effectiveFocusSeconds(session, nowMs) >= target
}

export function focusPhaseLabel(phase: FocusPhase | undefined) {
  if (phase === 'short-break') return 'Short break'
  if (phase === 'long-break') return 'Long break'
  return 'Focus'
}

export function formatFocusClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function secondsToMinutes(seconds: number): number { return Math.round(seconds / 60) }
