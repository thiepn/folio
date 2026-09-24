import { z } from 'zod'
import { db } from '../db/database'
import { habitCreateSchema, habitUpdateSchema } from '../domain/schemas'
import { habitScheduledForDate } from '../domain/habit'
import type { HabitEntity, HabitEntryEntity, LocalDate } from '../domain/models'

export type HabitCreateInput = z.input<typeof habitCreateSchema>
export type HabitUpdateInput = z.input<typeof habitUpdateSchema>

export interface HabitWithEntry extends HabitEntity {
  entry?: HabitEntryEntity
  currentValue: number
  completed: boolean
  skipped: boolean
}

function id() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `habit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function withEntry(habit: HabitEntity, entry?: HabitEntryEntity): HabitWithEntry {
  const currentValue = entry?.value ?? 0
  return {
    ...habit,
    entry,
    currentValue,
    completed: entry?.status === 'completed' || currentValue >= habit.target,
    skipped: entry?.status === 'skipped',
  }
}

async function validateGroup(groupId?: string | null) {
  if (!groupId) return undefined
  const group = await db.habitGroups.get(groupId)
  if (!group) throw new Error('Habit group not found.')
  return groupId
}

export const habitRepository = {
  async get(habitId: string) { return db.habits.get(habitId) },

  async listActive(): Promise<HabitEntity[]> {
    return db.habits.toArray().then((items) => items.filter((habit) => !habit.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)))
  },

  async listArchived(): Promise<HabitEntity[]> {
    return db.habits.toArray().then((items) => items.filter((habit) => habit.archived).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')))
  },

  async listAllForDate(date: LocalDate): Promise<HabitWithEntry[]> {
    const [habits, entries] = await Promise.all([this.listActive(), db.habitEntries.where('date').equals(date).toArray()])
    const byHabit = new Map<string, HabitEntryEntity>(entries.map((entry: HabitEntryEntity) => [entry.habitId, entry]))
    return habits.map((habit) => withEntry(habit, byHabit.get(habit.id)))
  },

  async listForDate(date: LocalDate): Promise<HabitWithEntry[]> {
    const [habits, entries] = await Promise.all([this.listActive(), db.habitEntries.where('date').equals(date).toArray()])
    const byHabit = new Map<string, HabitEntryEntity>(entries.map((entry: HabitEntryEntity) => [entry.habitId, entry]))
    return habits.filter((habit) => habitScheduledForDate(habit, date) || byHabit.has(habit.id)).map((habit) => withEntry(habit, byHabit.get(habit.id)))
  },

  async listForDates(dates: LocalDate[]): Promise<Map<LocalDate, HabitWithEntry[]>> {
    const result = new Map<LocalDate, HabitWithEntry[]>()
    await Promise.all(dates.map(async (date) => result.set(date, await this.listForDate(date))))
    return result
  },

  async listEntriesForHabit(habitId: string, start?: LocalDate, end?: LocalDate): Promise<HabitEntryEntity[]> {
    const entries = await db.habitEntries.where('habitId').equals(habitId).toArray()
    return entries.filter((entry) => (!start || entry.date >= start) && (!end || entry.date <= end)).sort((a, b) => a.date.localeCompare(b.date))
  },

  async listEntriesBetween(start: LocalDate, end: LocalDate): Promise<HabitEntryEntity[]> {
    return db.habitEntries.where('date').between(start, end, true, true).toArray()
  },

  async listAllEntries(): Promise<HabitEntryEntity[]> { return db.habitEntries.toArray() },
  async getEntry(habitId: string, date: LocalDate) { return db.habitEntries.get(`${habitId}:${date}`) },

  async create(input: HabitCreateInput): Promise<HabitEntity> {
    const parsed = habitCreateSchema.parse(input)
    const now = new Date().toISOString()
    const groupId = await validateGroup(parsed.groupId)
    const habit: HabitEntity = {
      id: id(),
      title: parsed.title,
      description: parsed.description,
      kind: parsed.kind,
      target: parsed.kind === 'check' ? 1 : parsed.target,
      unit: parsed.kind === 'quantity' ? (parsed.unit ?? 'units') : undefined,
      color: parsed.color,
      groupId,
      schedule: parsed.schedule,
      countsTowardCapacity: parsed.kind === 'duration' ? parsed.countsTowardCapacity : false,
      pauses: parsed.pauses,
      archived: false,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now,
    }
    await db.habits.add(habit)
    return habit
  },

  async update(habitId: string, input: HabitUpdateInput): Promise<HabitEntity> {
    const parsed = habitUpdateSchema.parse(input)
    const existing = await db.habits.get(habitId)
    if (!existing) throw new Error('Habit not found.')
    const kind = parsed.kind ?? existing.kind
    const groupId = Object.prototype.hasOwnProperty.call(parsed, 'groupId') ? await validateGroup(parsed.groupId) : existing.groupId
    const next: HabitEntity = {
      ...existing,
      ...parsed,
      groupId,
      target: kind === 'check' ? 1 : (parsed.target ?? existing.target),
      unit: kind === 'quantity' ? (parsed.unit ?? existing.unit ?? 'units') : undefined,
      countsTowardCapacity: kind === 'duration' ? (parsed.countsTowardCapacity ?? existing.countsTowardCapacity) : false,
      archivedAt: parsed.archived === true ? (existing.archivedAt ?? new Date().toISOString()) : parsed.archived === false ? undefined : existing.archivedAt,
      updatedAt: new Date().toISOString(),
    }
    await db.habits.put(next)
    return next
  },

  async replace(habit: HabitEntity) { await db.habits.put(habit) },

  async remove(habitId: string) {
    await db.transaction('rw', db.habits, db.habitEntries, db.reminders, db.reminderOccurrences, async () => {
      await db.habits.delete(habitId)
      const entryIds = await db.habitEntries.where('habitId').equals(habitId).primaryKeys()
      await db.habitEntries.bulkDelete(entryIds as string[])
      const reminders = await db.reminders.where('[ownerType+ownerId]').equals(['habit', habitId]).toArray()
      for (const reminder of reminders) await db.reminderOccurrences.where('reminderId').equals(reminder.id).delete()
      if (reminders.length) await db.reminders.bulkDelete(reminders.map((item) => item.id))
    })
  },

  async putEntry(entry: HabitEntryEntity) { await db.habitEntries.put(entry) },
  async removeEntry(habitId: string, date: LocalDate) { await db.habitEntries.delete(`${habitId}:${date}`) },
}
