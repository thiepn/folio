import type { FocusCycleSettings, FocusMode, FocusSessionEntity } from '../domain/models'
import { focusSessionRepository, type FocusSessionEditInput } from '../repositories/focusSessionRepository'
import { projectRepository } from '../repositories/projectRepository'
import { taskRepository } from '../repositories/taskRepository'
import { countdownReached, effectiveFocusSeconds, focusPhaseTargetSeconds } from '../features/focus/focusLogic'
import { dependencyService } from './dependencyService'
import type { UndoableMutation } from './undo'

function nowIso() { return new Date().toISOString() }

async function requireSession(id: string) {
  const session = await focusSessionRepository.get(id)
  if (!session) throw new Error('Focus session not found.')
  return session
}

function liveSeconds(session: FocusSessionEntity, nowMs = Date.now()) {
  if (session.status !== 'running' || !session.resumedAt) return 0
  const resumed = Date.parse(session.resumedAt)
  return Number.isFinite(resumed) ? Math.max(0, Math.floor((nowMs - resumed) / 1000)) : 0
}

function settlePomodoro(session: FocusSessionEntity, nowMs = Date.now()) {
  const phase = session.phase ?? 'focus'
  const base = Math.max(0, session.phaseElapsedSeconds ?? 0)
  const target = focusPhaseTargetSeconds(session) ?? Infinity
  const elapsed = Math.min(target, base + liveSeconds(session, nowMs))
  const delta = Math.max(0, elapsed - base)
  return {
    durationSeconds: session.durationSeconds + (phase === 'focus' ? delta : 0),
    breakSeconds: (session.breakSeconds ?? 0) + (phase === 'focus' ? 0 : delta),
    phaseElapsedSeconds: elapsed,
  }
}

async function taskSnapshot(taskId?: string | null) {
  if (!taskId) return { taskId: undefined, taskTitleSnapshot: undefined, taskEstimateMinutesSnapshot: undefined, projectIdSnapshot: undefined, projectNameSnapshot: undefined }
  const task = await taskRepository.get(taskId)
  if (!task || task.deletedAt || task.status === 'cancelled') throw new Error('Task not found.')
  const project = task.projectId ? await projectRepository.get(task.projectId) : undefined
  return {
    taskId: task.id,
    taskTitleSnapshot: task.title,
    taskEstimateMinutesSnapshot: task.estimatedMinutes,
    projectIdSnapshot: task.projectId,
    projectNameSnapshot: project?.name,
  }
}

function normalizedTags(tags?: string[]) {
  return [...new Set((tags ?? []).map((tag)=>tag.trim()).filter(Boolean))].slice(0,30)
}

export interface StartFocusOptions {
  context?: string
  tags?: string[]
  cycle?: FocusCycleSettings
}

export interface ManualFocusInput {
  taskId?: string
  startedAt: string
  durationSeconds: number
  note?: string
  context?: string
  tags?: string[]
  interruptionCount?: number
}

export const focusService = {
  async start(taskId: string, mode: FocusMode, targetSeconds?: number, plannedSeconds?: number, intention?: string, options: StartFocusOptions = {}): Promise<FocusSessionEntity> {
    const active = await focusSessionRepository.getActive()
    if (active) throw new Error('Another focus session is already active.')
    const task = await taskRepository.get(taskId)
    if (!task || task.deletedAt || task.status !== 'todo') throw new Error('Only open to-do tasks can start a focus session.')
    const dependency = await dependencyService.getBlockingState(taskId)
    if (dependency.blocked) throw new Error(`This task is blocked by ${dependency.blockers.map((item) => item.title).join(', ')}.`)
    const snapshot = await taskSnapshot(taskId)
    if (mode === 'pomodoro' && !options.cycle) throw new Error('Pomodoro sessions require cycle settings.')
    return focusSessionRepository.create({
      ...snapshot,
      mode,
      source: 'timer',
      targetSeconds: mode === 'countdown' ? targetSeconds : undefined,
      plannedSeconds: plannedSeconds ?? (mode === 'countdown' ? targetSeconds : mode === 'pomodoro' ? options.cycle?.workSeconds : undefined),
      intention: intention?.trim() || undefined,
      context: options.context?.trim() || undefined,
      tags: normalizedTags(options.tags),
      cycle: mode === 'pomodoro' ? options.cycle : undefined,
      cycleIndex: mode === 'pomodoro' ? 0 : undefined,
      phase: mode === 'pomodoro' ? 'focus' : undefined,
      phaseElapsedSeconds: 0,
      breakSeconds: 0,
      durationSeconds: 0,
      interruptionCount: 0,
      status: 'running',
    })
  },

  async pause(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status !== 'running') return session
    if (session.mode === 'pomodoro') {
      const settled = settlePomodoro(session)
      return focusSessionRepository.update(id, { ...settled, status: 'paused', resumedAt: undefined })
    }
    return focusSessionRepository.update(id, { status: 'paused', durationSeconds: effectiveFocusSeconds(session), resumedAt: undefined })
  },

  async interrupt(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status !== 'running') throw new Error('Only a running session can be interrupted.')
    const settled = session.mode === 'pomodoro' ? settlePomodoro(session) : { durationSeconds: effectiveFocusSeconds(session) }
    return focusSessionRepository.update(id, { ...settled, interruptionCount: (session.interruptionCount ?? 0) + 1, status: 'paused', resumedAt: undefined })
  },

  async resume(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status !== 'paused') return session
    if (countdownReached(session)) throw new Error(session.mode === 'pomodoro' ? 'This phase is complete. Advance to the next phase.' : 'This countdown target has already been reached. Finish the session or start another.')
    return focusSessionRepository.update(id, { status: 'running', resumedAt: nowIso() })
  },

  async completePhase(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.mode !== 'pomodoro' || !session.cycle) throw new Error('This is not a Pomodoro session.')
    if (session.status !== 'running' && session.status !== 'paused') throw new Error('This Pomodoro session is no longer active.')
    const settled = settlePomodoro(session)
    const stamp = nowIso()
    const phase = session.phase ?? 'focus'
    if (phase === 'focus') {
      const completedCycles = (session.cycleIndex ?? 0) + 1
      const nextPhase = completedCycles % session.cycle.cyclesBeforeLongBreak === 0 ? 'long-break' : 'short-break'
      return focusSessionRepository.update(id, { ...settled, cycleIndex: completedCycles, phase: nextPhase, phaseElapsedSeconds: 0, status: 'running', resumedAt: stamp })
    }
    return focusSessionRepository.update(id, { ...settled, phase: 'focus', phaseElapsedSeconds: 0, status: 'running', resumedAt: stamp })
  },

  async finish(id: string, note?: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status === 'finished') return session
    const endedAt = nowIso()
    const settled = session.mode === 'pomodoro' ? settlePomodoro(session) : { durationSeconds: effectiveFocusSeconds(session) }
    return focusSessionRepository.update(id, { ...settled, status: 'finished', resumedAt: undefined, endedAt, note: note?.trim() || session.note })
  },

  async cancel(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    const endedAt = nowIso()
    const settled = session.mode === 'pomodoro' ? settlePomodoro(session) : { durationSeconds: effectiveFocusSeconds(session) }
    return focusSessionRepository.update(id, { ...settled, status: 'cancelled', resumedAt: undefined, endedAt })
  },

  async createManual(input: ManualFocusInput): Promise<{ session: FocusSessionEntity; undo: UndoableMutation }> {
    if (input.durationSeconds < 60) throw new Error('Manual focus entries must be at least one minute.')
    const startMs = Date.parse(input.startedAt)
    if (!Number.isFinite(startMs)) throw new Error('Manual focus start time is invalid.')
    const endedAt = new Date(startMs + input.durationSeconds * 1000).toISOString()
    const snapshot = await taskSnapshot(input.taskId)
    const session = await focusSessionRepository.create({
      ...snapshot, mode:'stopwatch', source:'manual', startedAt:input.startedAt, endedAt,
      durationSeconds:Math.round(input.durationSeconds), status:'finished', note:input.note?.trim()||undefined,
      context:input.context?.trim()||undefined, tags:normalizedTags(input.tags), interruptionCount:Math.max(0,Math.round(input.interruptionCount??0)),
      phaseElapsedSeconds:0, breakSeconds:0,
    })
    return { session, undo:{ message:'Manual focus entry added', undo:async()=>focusSessionRepository.remove(session.id) } }
  },

  async editFinished(id: string, input: FocusSessionEditInput): Promise<UndoableMutation> {
    const previous = await requireSession(id)
    if (previous.status !== 'finished') throw new Error('Only finished focus sessions can be edited.')
    const snapshot = Object.prototype.hasOwnProperty.call(input,'taskId') ? await taskSnapshot(input.taskId) : {}
    const startedAt = input.startedAt ?? previous.startedAt
    const durationSeconds = input.durationSeconds ?? previous.durationSeconds
    const endedAt = input.endedAt ?? (input.startedAt !== undefined || input.durationSeconds !== undefined ? new Date(Date.parse(startedAt)+durationSeconds*1000).toISOString() : previous.endedAt)
    if (!endedAt || Date.parse(endedAt) <= Date.parse(startedAt)) throw new Error('Focus session end must be after its start.')
    const clean: Partial<FocusSessionEntity> = {
      ...snapshot,
      startedAt, endedAt, durationSeconds,
      note: Object.prototype.hasOwnProperty.call(input,'note') ? (input.note?.trim() || undefined) : previous.note,
      context: Object.prototype.hasOwnProperty.call(input,'context') ? (input.context?.trim() || undefined) : previous.context,
      tags: input.tags ? normalizedTags(input.tags) : previous.tags,
      interruptionCount: input.interruptionCount ?? previous.interruptionCount,
    }
    await focusSessionRepository.editFinished(id, clean)
    return { message:'Focus session updated', undo:async()=>focusSessionRepository.replace(previous) }
  },

  async removeFinished(id: string): Promise<UndoableMutation> {
    const previous = await requireSession(id)
    if (previous.status !== 'finished') throw new Error('Only finished focus sessions can be deleted.')
    await focusSessionRepository.remove(id)
    return { message:'Focus session deleted', undo:async()=>focusSessionRepository.replace(previous) }
  },

  async discard(id: string): Promise<void> { await focusSessionRepository.remove(id) },

  async reconcileActive(): Promise<void> {
    const session = await focusSessionRepository.getActive()
    if (!session || session.status !== 'running') return
    if (!countdownReached(session)) return
    if (session.mode === 'pomodoro') {
      const settled = settlePomodoro(session)
      await focusSessionRepository.update(session.id, { ...settled, status:'paused', resumedAt:undefined })
      return
    }
    await focusSessionRepository.update(session.id, { status:'paused', durationSeconds:effectiveFocusSeconds(session), resumedAt:undefined })
  },
}
