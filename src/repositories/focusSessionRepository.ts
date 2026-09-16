import { db } from '../db/database'
import { focusSessionCreateSchema } from '../domain/schemas'
import type { FocusSessionEntity } from '../domain/models'
import type { z } from 'zod'

export type FocusSessionCreateInput = z.input<typeof focusSessionCreateSchema>

function newest(a: FocusSessionEntity, b: FocusSessionEntity) { return b.startedAt.localeCompare(a.startedAt) }

export const focusSessionRepository = {
  async listAll(): Promise<FocusSessionEntity[]> {
    return (await db.focusSessions.toArray()).sort(newest)
  },

  async listFinished(): Promise<FocusSessionEntity[]> {
    return (await db.focusSessions.where('status').equals('finished').toArray()).sort(newest)
  },

  async get(id: string): Promise<FocusSessionEntity | undefined> {
    return db.focusSessions.get(id)
  },

  async getActive(): Promise<FocusSessionEntity | undefined> {
    const active = await db.focusSessions.where('status').anyOf('running', 'paused').toArray()
    return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  },

  async create(input: FocusSessionCreateInput): Promise<FocusSessionEntity> {
    const parsed = focusSessionCreateSchema.parse(input)
    const now = new Date().toISOString()
    const session: FocusSessionEntity = {
      id: crypto.randomUUID(),
      taskId: parsed.taskId,
      taskTitleSnapshot: parsed.taskTitleSnapshot,
      taskEstimateMinutesSnapshot: parsed.taskEstimateMinutesSnapshot,
      projectIdSnapshot: parsed.projectIdSnapshot,
      projectNameSnapshot: parsed.projectNameSnapshot,
      mode: parsed.mode,
      targetSeconds: parsed.mode === 'countdown' ? parsed.targetSeconds : undefined,
      startedAt: now,
      resumedAt: now,
      durationSeconds: 0,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }
    await db.focusSessions.add(session)
    return session
  },

  async replace(session: FocusSessionEntity): Promise<void> {
    await db.focusSessions.put(session)
  },

  async update(id: string, changes: Partial<FocusSessionEntity>): Promise<FocusSessionEntity> {
    const current = await db.focusSessions.get(id)
    if (!current) throw new Error('Focus session not found.')
    const next = { ...current, ...changes, updatedAt: new Date().toISOString() }
    await db.focusSessions.put(next)
    return next
  },

  async remove(id: string): Promise<void> {
    await db.focusSessions.delete(id)
  },

  async completedDurationSeconds(): Promise<number> {
    const sessions = await db.focusSessions.where('status').equals('finished').toArray()
    return sessions.reduce((total, session) => total + session.durationSeconds, 0)
  },
}
