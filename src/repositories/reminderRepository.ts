import { z } from 'zod'
import { db } from '../db/database'
import { reminderCreateSchema, reminderUpdateSchema } from '../domain/schemas'
import type { ReminderEntity, ReminderOccurrenceEntity, ReminderOccurrenceStatus } from '../domain/models'

export type ReminderCreateInput = z.input<typeof reminderCreateSchema>
export type ReminderUpdateInput = z.input<typeof reminderUpdateSchema>

function now() { return new Date().toISOString() }

export const reminderRepository = {
  async listDefinitions(): Promise<ReminderEntity[]> {
    return (await db.reminders.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async listEnabled(): Promise<ReminderEntity[]> {
    return (await db.reminders.toArray()).filter((item) => item.enabled).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async listForOwner(ownerType: ReminderEntity['ownerType'], ownerId: string): Promise<ReminderEntity[]> {
    return (await db.reminders.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async get(id: string): Promise<ReminderEntity | undefined> {
    return db.reminders.get(id)
  },

  async create(input: ReminderCreateInput): Promise<ReminderEntity> {
    const parsed = reminderCreateSchema.parse(input)
    const timestamp = now()
    const entity: ReminderEntity = {
      id: crypto.randomUUID(),
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      label: parsed.label,
      triggerType: parsed.triggerType,
      absoluteAt: parsed.absoluteAt,
      taskDateField: parsed.taskDateField,
      dayOffset: parsed.dayOffset,
      minuteOfDay: parsed.minuteOfDay,
      blockEdge: parsed.blockEdge,
      offsetMinutes: parsed.offsetMinutes,
      weekdays: parsed.weekdays,
      timeZone: parsed.timeZone,
      persistent: parsed.persistent,
      enabled: parsed.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await db.reminders.add(entity)
    return entity
  },

  async update(id: string, input: ReminderUpdateInput): Promise<ReminderEntity> {
    const current = await db.reminders.get(id)
    if (!current) throw new Error('Reminder not found.')
    const parsed = reminderUpdateSchema.parse(input)
    const next = reminderCreateSchema.parse({
      ...current,
      ...parsed,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    })
    const entity: ReminderEntity = {
      ...current,
      ownerType: next.ownerType,
      ownerId: next.ownerId,
      label: next.label,
      triggerType: next.triggerType,
      absoluteAt: next.absoluteAt,
      taskDateField: next.taskDateField,
      dayOffset: next.dayOffset,
      minuteOfDay: next.minuteOfDay,
      blockEdge: next.blockEdge,
      offsetMinutes: next.offsetMinutes,
      weekdays: next.weekdays,
      timeZone: next.timeZone,
      persistent: next.persistent,
      enabled: next.enabled,
      updatedAt: now(),
    }
    await db.reminders.put(entity)
    return entity
  },

  async replace(entity: ReminderEntity): Promise<void> {
    await db.reminders.put(entity)
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.reminders, db.reminderOccurrences, async () => {
      await db.reminderOccurrences.where('reminderId').equals(id).delete()
      await db.reminders.delete(id)
    })
  },

  async listOccurrencesForReminder(reminderId: string): Promise<ReminderOccurrenceEntity[]> {
    return (await db.reminderOccurrences.where('reminderId').equals(reminderId).toArray()).sort((a, b) => a.fireAt.localeCompare(b.fireAt))
  },

  async listOccurrencesForOwner(ownerType: ReminderEntity['ownerType'], ownerId: string): Promise<ReminderOccurrenceEntity[]> {
    return (await db.reminderOccurrences.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()).sort((a, b) => a.fireAt.localeCompare(b.fireAt))
  },

  async listDue(nowIso = now()): Promise<ReminderOccurrenceEntity[]> {
    const candidates = await db.reminderOccurrences.where('fireAt').belowOrEqual(nowIso).toArray()
    return candidates
      .filter((item) => item.status === 'scheduled' || item.status === 'snoozed')
      .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
  },

  async listOutstanding(): Promise<ReminderOccurrenceEntity[]> {
    const rows = await db.reminderOccurrences.where('status').anyOf('due', 'snoozed').toArray()
    return rows.sort((a, b) => (a.snoozedUntil ?? a.fireAt).localeCompare(b.snoozedUntil ?? b.fireAt))
  },

  async listUpcoming(limit = 30): Promise<ReminderOccurrenceEntity[]> {
    const rows = await db.reminderOccurrences.where('status').equals('scheduled').toArray()
    return rows.sort((a, b) => a.fireAt.localeCompare(b.fireAt)).slice(0, limit)
  },

  async putOccurrences(rows: ReminderOccurrenceEntity[]): Promise<void> {
    if (rows.length) await db.reminderOccurrences.bulkPut(rows)
  },

  async getOccurrence(id: string): Promise<ReminderOccurrenceEntity | undefined> {
    return db.reminderOccurrences.get(id)
  },

  async updateOccurrence(id: string, changes: Partial<ReminderOccurrenceEntity>): Promise<void> {
    await db.reminderOccurrences.update(id, { ...changes, updatedAt: now() })
  },

  async removeOccurrences(ids: string[]): Promise<void> {
    if (ids.length) await db.reminderOccurrences.bulkDelete(ids)
  },

  async setOccurrenceStatus(id: string, status: ReminderOccurrenceStatus, changes: Partial<ReminderOccurrenceEntity> = {}): Promise<void> {
    await db.reminderOccurrences.update(id, { ...changes, status, updatedAt: now() })
  },
}
