import { db } from '../db/database'
import { addLocalDays, atLocalTime } from '../domain/date'
import { timeBlockCreateSchema, timeBlockUpdateSchema } from '../domain/schemas'
import type { z } from 'zod'
import type { LocalDate, TimeBlockEntity } from '../domain/models'

export type TimeBlockCreateInput = z.input<typeof timeBlockCreateSchema>
export type TimeBlockUpdateInput = z.input<typeof timeBlockUpdateSchema>

async function withoutDeletedLinkedTasks(blocks: TimeBlockEntity[]): Promise<TimeBlockEntity[]> {
  const linkedIds = [...new Set(blocks.map((block) => block.taskId).filter((id): id is string => Boolean(id)))]
  if (!linkedIds.length) return blocks
  const linkedTasks = await db.tasks.bulkGet(linkedIds)
  const hiddenIds = new Set(linkedTasks.filter((task) => task?.deletedAt || task?.status === 'cancelled').map((task) => task!.id))
  return blocks.filter((block) => !block.taskId || !hiddenIds.has(block.taskId))
}

export const timeBlockRepository = {
  async listForDate(date: LocalDate): Promise<TimeBlockEntity[]> {
    return this.listBetween(date, date)
  },

  async listBetween(fromDate: LocalDate, throughDate: LocalDate): Promise<TimeBlockEntity[]> {
    const start = atLocalTime(fromDate, 0)
    const endExclusive = atLocalTime(addLocalDays(throughDate, 1), 0)
    const blocks = await db.timeBlocks.where('start').between(start, endExclusive, true, false).sortBy('start')
    return withoutDeletedLinkedTasks(blocks)
  },

  async listAll(): Promise<TimeBlockEntity[]> {
    return withoutDeletedLinkedTasks((await db.timeBlocks.toArray()).sort((a, b) => a.start.localeCompare(b.start)))
  },

  async listForTaskIds(taskIds: string[]): Promise<TimeBlockEntity[]> {
    if (!taskIds.length) return []
    const blocks = await db.timeBlocks.where('taskId').anyOf(taskIds).toArray()
    return withoutDeletedLinkedTasks(blocks.sort((a, b) => a.start.localeCompare(b.start)))
  },

  async get(id: string): Promise<TimeBlockEntity | undefined> {
    return db.timeBlocks.get(id)
  },

  async create(input: TimeBlockCreateInput): Promise<TimeBlockEntity> {
    const parsed = timeBlockCreateSchema.parse(input)
    const now = new Date().toISOString()
    const entity: TimeBlockEntity = {
      id: crypto.randomUUID(),
      taskId: parsed.taskId,
      title: parsed.title,
      description: parsed.description || undefined,
      location: parsed.location || undefined,
      kind: parsed.kind,
      allDay: parsed.allDay,
      timeZone: parsed.timeZone,
      source: parsed.source,
      sourceCalendar: parsed.sourceCalendar,
      sourceUid: parsed.sourceUid,
      start: parsed.start,
      end: parsed.end,
      createdAt: now,
      updatedAt: now,
    }
    await db.timeBlocks.add(entity)
    return entity
  },

  async update(id: string, input: TimeBlockUpdateInput): Promise<TimeBlockEntity> {
    const parsed = timeBlockUpdateSchema.parse(input)
    const current = await db.timeBlocks.get(id)
    if (!current) throw new Error('Time block not found.')
    const next = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    timeBlockCreateSchema.parse({ taskId: next.taskId, title: next.title, description: next.description, location: next.location, kind: next.kind, allDay: next.allDay, timeZone: next.timeZone, source: next.source, sourceCalendar: next.sourceCalendar, sourceUid: next.sourceUid, start: next.start, end: next.end })
    await db.timeBlocks.put(next)
    return next
  },

  async replace(block: TimeBlockEntity): Promise<void> {
    await db.timeBlocks.put(block)
  },

  async remove(id: string): Promise<void> {
    await db.timeBlocks.delete(id)
  },
}
