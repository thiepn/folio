import type { FocusMode, FocusSessionEntity } from '../domain/models'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { projectRepository } from '../repositories/projectRepository'
import { taskRepository } from '../repositories/taskRepository'
import { effectiveFocusSeconds } from '../features/focus/focusLogic'
import { dependencyService } from './dependencyService'

function nowIso() { return new Date().toISOString() }

async function requireSession(id: string) {
  const session = await focusSessionRepository.get(id)
  if (!session) throw new Error('Focus session not found.')
  return session
}

function finalizedSeconds(session: FocusSessionEntity) {
  return effectiveFocusSeconds(session, Date.now())
}

export const focusService = {
  async start(taskId: string, mode: FocusMode, targetSeconds?: number): Promise<FocusSessionEntity> {
    const active = await focusSessionRepository.getActive()
    if (active) throw new Error('Another focus session is already active.')
    const task = await taskRepository.get(taskId)
    if (!task || task.deletedAt || task.status !== 'todo') throw new Error('Only open to-do tasks can start a focus session.')
    const dependency = await dependencyService.getBlockingState(taskId)
    if (dependency.blocked) throw new Error(`This task is blocked by ${dependency.blockers.map((item) => item.title).join(', ')}.`)
    const project = task.projectId ? await projectRepository.get(task.projectId) : undefined
    return focusSessionRepository.create({
      taskId: task.id,
      taskTitleSnapshot: task.title,
      taskEstimateMinutesSnapshot: task.estimatedMinutes,
      projectIdSnapshot: task.projectId,
      projectNameSnapshot: project?.name,
      mode,
      targetSeconds: mode === 'countdown' ? targetSeconds : undefined,
    })
  },

  async pause(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status !== 'running') return session
    return focusSessionRepository.update(id, {
      status: 'paused',
      durationSeconds: finalizedSeconds(session),
      resumedAt: undefined,
    })
  },

  async resume(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status !== 'paused') return session
    if (session.mode === 'countdown' && session.targetSeconds && session.durationSeconds >= session.targetSeconds) {
      throw new Error('This countdown target has already been reached. Finish the session or start another.')
    }
    return focusSessionRepository.update(id, { status: 'running', resumedAt: nowIso() })
  },

  async finish(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    if (session.status === 'finished') return session
    const endedAt = nowIso()
    return focusSessionRepository.update(id, {
      status: 'finished',
      durationSeconds: finalizedSeconds(session),
      resumedAt: undefined,
      endedAt,
    })
  },

  async cancel(id: string): Promise<FocusSessionEntity> {
    const session = await requireSession(id)
    const endedAt = nowIso()
    return focusSessionRepository.update(id, {
      status: 'cancelled',
      durationSeconds: finalizedSeconds(session),
      resumedAt: undefined,
      endedAt,
    })
  },

  async discard(id: string): Promise<void> {
    await focusSessionRepository.remove(id)
  },

  async reconcileActive(): Promise<void> {
    const session = await focusSessionRepository.getActive()
    if (!session || session.status !== 'running' || session.mode !== 'countdown' || !session.targetSeconds) return
    if (effectiveFocusSeconds(session) < session.targetSeconds) return
    await focusSessionRepository.update(session.id, {
      status: 'paused',
      durationSeconds: session.targetSeconds,
      resumedAt: undefined,
    })
  },
}
