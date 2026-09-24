import { db } from '../db/database'
import { addLocalDays, atTimeInZone, dateKeyInTimeZone, localDateRange } from '../domain/date'
import { habitPausedForDate, habitPeriodProgress, habitScheduledForDate } from '../domain/habit'
import type {
  HabitEntity,
  LocalDate,
  ReminderEntity,
  ReminderOccurrenceEntity,
  TaskEntity,
} from '../domain/models'
import { reminderRepository } from '../repositories/reminderRepository'

const LOOKBACK_DAYS = 14
const HORIZON_DAYS = 45

function occurrenceId(reminderId: string, sourceKey: string) {
  return `${reminderId}::${sourceKey}`
}

function inWindow(iso: string, nowMs: number, lookbackDays = LOOKBACK_DAYS, horizonDays = HORIZON_DAYS) {
  const value = Date.parse(iso)
  return Number.isFinite(value)
    && value >= nowMs - lookbackDays * 86_400_000
    && value <= nowMs + horizonDays * 86_400_000
}

function offsetInstant(iso: string, minutes = 0) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString()
}

function taskDateOccurrence(reminder: ReminderEntity, task: TaskEntity): ReminderOccurrenceEntity | undefined {
  if (!reminder.taskDateField || reminder.minuteOfDay === undefined) return undefined
  const baseDate = task[reminder.taskDateField]
  if (!baseDate) return undefined
  const date = addLocalDays(baseDate, reminder.dayOffset ?? 0)
  const fireAt = atTimeInZone(date, reminder.minuteOfDay, reminder.timeZone)
  const sourceKey = `task-date:${task.id}:${reminder.taskDateField}:${fireAt}`
  return makeOccurrence(reminder, sourceKey, fireAt, fireAt, task.id, task.title, taskDateBody(reminder, task))
}

function taskDateBody(reminder: ReminderEntity, task: TaskEntity) {
  const label = reminder.taskDateField === 'deadline' ? 'Deadline reminder' : 'Planned-task reminder'
  return task.projectId ? `${label} · linked project` : label
}

function timeBlockOccurrences(reminder: ReminderEntity, task: TaskEntity, blocks: Awaited<ReturnType<typeof blocksForTask>>) {
  if (!reminder.blockEdge) return [] as ReminderOccurrenceEntity[]
  return blocks.map((block) => {
    const scheduledFor = reminder.blockEdge === 'end' ? block.end : block.start
    const fireAt = offsetInstant(scheduledFor, reminder.offsetMinutes ?? 0)
    const sourceKey = `time-block:${task.id}:${block.id}:${reminder.blockEdge}:${fireAt}`
    const body = reminder.offsetMinutes
      ? `${Math.abs(reminder.offsetMinutes)} min ${reminder.offsetMinutes < 0 ? 'before' : 'after'} calendar block ${reminder.blockEdge}`
      : `Calendar block ${reminder.blockEdge}`
    return makeOccurrence(reminder, sourceKey, scheduledFor, fireAt, task.id, task.title, body)
  })
}

async function blocksForTask(taskId: string) {
  return (await db.timeBlocks.where('taskId').equals(taskId).toArray())
    .filter((block) => block.kind === 'task')
    .sort((a, b) => a.start.localeCompare(b.start))
}

function makeOccurrence(
  reminder: ReminderEntity,
  sourceKey: string,
  scheduledFor: string,
  fireAt: string,
  targetTaskId: string | undefined,
  titleSnapshot: string,
  bodySnapshot?: string,
): ReminderOccurrenceEntity {
  const timestamp = new Date().toISOString()
  return {
    id: occurrenceId(reminder.id, sourceKey),
    reminderId: reminder.id,
    ownerType: reminder.ownerType,
    ownerId: reminder.ownerId,
    targetTaskId,
    sourceKey,
    scheduledFor,
    fireAt,
    status: 'scheduled',
    deliveryCount: 0,
    titleSnapshot: reminder.label?.trim() || titleSnapshot,
    bodySnapshot,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

async function taskTargets(reminder: ReminderEntity): Promise<TaskEntity[]> {
  if (reminder.ownerType === 'task') {
    const task = await db.tasks.get(reminder.ownerId)
    return task ? [task] : []
  }
  if (reminder.ownerType === 'series') {
    return (await db.tasks.where('seriesId').equals(reminder.ownerId).toArray())
      .filter((task) => Boolean(task.recurrenceDate))
  }
  return []
}

function taskEligible(task: TaskEntity) {
  return !task.deletedAt && task.status !== 'cancelled' && task.status !== 'completed'
}

async function desiredTaskOccurrences(reminder: ReminderEntity, nowMs: number) {
  if (reminder.triggerType === 'absolute') {
    if (!reminder.absoluteAt || !inWindow(reminder.absoluteAt, nowMs)) return []
    if (reminder.ownerType === 'series') return []
    const targets = await taskTargets(reminder)
    const target = targets[0]
    if (reminder.ownerType === 'task' && (!target || !taskEligible(target))) return []
    return [makeOccurrence(
      reminder,
      `absolute:${reminder.absoluteAt}`,
      reminder.absoluteAt,
      reminder.absoluteAt,
      target?.id,
      target?.title ?? reminder.label ?? 'Folio reminder',
      'Exact-time reminder',
    )]
  }

  const targets = (await taskTargets(reminder)).filter(taskEligible)
  const rows: ReminderOccurrenceEntity[] = []
  for (const task of targets) {
    if (reminder.triggerType === 'task-date') {
      const row = taskDateOccurrence(reminder, task)
      if (row && inWindow(row.fireAt, nowMs)) rows.push(row)
    } else if (reminder.triggerType === 'time-block') {
      const blocks = await blocksForTask(task.id)
      for (const row of timeBlockOccurrences(reminder, task, blocks)) if (inWindow(row.fireAt, nowMs)) rows.push(row)
    }
  }
  return rows
}

function habitReminderDateEligible(habit: HabitEntity, reminder: ReminderEntity, date: LocalDate) {
  if (habitPausedForDate(habit, date)) return false
  const flexible = habit.schedule.type === 'times-per-week' || habit.schedule.type === 'times-per-month'
  if (!flexible) return habitScheduledForDate(habit, date)
  if (!reminder.weekdays?.length) return true
  const weekday = new Date(`${date}T12:00:00`).getDay()
  return reminder.weekdays.includes(weekday)
}

async function desiredHabitOccurrences(reminder: ReminderEntity, now: Date) {
  if (reminder.triggerType !== 'habit-time' || reminder.minuteOfDay === undefined) return [] as ReminderOccurrenceEntity[]
  const habit = await db.habits.get(reminder.ownerId)
  if (!habit || habit.archived) return []
  const today = dateKeyInTimeZone(now, reminder.timeZone)
  const dates = localDateRange(today, HORIZON_DAYS + 1)
  return dates
    .filter((date) => habitReminderDateEligible(habit, reminder, date))
    .map((date) => {
      const fireAt = atTimeInZone(date, reminder.minuteOfDay!, reminder.timeZone)
      const sourceKey = `habit:${habit.id}:${date}:${reminder.minuteOfDay}`
      return makeOccurrence(reminder, sourceKey, fireAt, fireAt, undefined, reminder.label?.trim() || habit.title, 'Habit reminder')
    })
}

function dailyDates(reminder: ReminderEntity, now: Date): LocalDate[] {
  const today = dateKeyInTimeZone(now, reminder.timeZone)
  return localDateRange(today, HORIZON_DAYS + 1)
    .filter((date) => {
      if (!reminder.weekdays?.length) return true
      const weekday = new Date(`${date}T12:00:00`).getDay()
      return reminder.weekdays.includes(weekday)
    })
}

function desiredSystemOccurrences(reminder: ReminderEntity, now: Date) {
  if (reminder.triggerType !== 'daily' || reminder.minuteOfDay === undefined) return [] as ReminderOccurrenceEntity[]
  return dailyDates(reminder, now).map((date) => {
    const fireAt = atTimeInZone(date, reminder.minuteOfDay!, reminder.timeZone)
    const sourceKey = `daily:${reminder.ownerId}:${date}:${reminder.minuteOfDay}`
    const title = reminder.ownerId === 'overdue-summary' ? 'Overdue tasks' : reminder.ownerId === 'daily-planning' ? 'Plan today' : reminder.label || 'Folio reminder'
    const body = reminder.ownerId === 'overdue-summary'
      ? 'Review tasks that passed their deadline.'
      : reminder.ownerId === 'daily-planning'
        ? 'Review carryover, deadlines, capacity, and your Top 3.'
        : undefined
    return makeOccurrence(reminder, sourceKey, fireAt, fireAt, undefined, title, body)
  })
}

export async function desiredReminderOccurrences(reminder: ReminderEntity, now = new Date()): Promise<ReminderOccurrenceEntity[]> {
  if (!reminder.enabled) return []
  const nowMs = now.getTime()
  if (reminder.ownerType === 'task' || reminder.ownerType === 'series') return desiredTaskOccurrences(reminder, nowMs)
  if (reminder.ownerType === 'habit') return desiredHabitOccurrences(reminder, now)
  if (reminder.ownerType === 'system') return desiredSystemOccurrences(reminder, now)
  return []
}

export async function reconcileReminder(reminder: ReminderEntity, now = new Date()) {
  const desired = await desiredReminderOccurrences(reminder, now)
  const desiredById = new Map(desired.map((row) => [row.id, row]))
  const existing = await reminderRepository.listOccurrencesForReminder(reminder.id)
  const existingById = new Map(existing.map((row) => [row.id, row]))
  const upserts: ReminderOccurrenceEntity[] = []

  for (const row of desired) {
    const prior = existingById.get(row.id)
    if (!prior) {
      upserts.push(row)
      continue
    }
    if (prior.status === 'cancelled') {
      upserts.push({ ...row, createdAt: prior.createdAt, updatedAt: new Date().toISOString() })
      continue
    }
    if (prior.status === 'scheduled') {
      upserts.push({
        ...prior,
        scheduledFor: row.scheduledFor,
        fireAt: row.fireAt,
        targetTaskId: row.targetTaskId,
        titleSnapshot: row.titleSnapshot,
        bodySnapshot: row.bodySnapshot,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  for (const row of existing) {
    if (desiredById.has(row.id)) continue
    if (row.status === 'scheduled' || row.status === 'snoozed') {
      upserts.push({ ...row, status: 'cancelled', snoozedUntil: undefined, updatedAt: new Date().toISOString() })
    }
  }

  await reminderRepository.putOccurrences(upserts)
}

export async function reconcileAllReminders(now = new Date()) {
  const definitions = await reminderRepository.listDefinitions()
  for (const reminder of definitions) await reconcileReminder(reminder, now)
}

export async function reminderSuppressionReason(occurrence: ReminderOccurrenceEntity, now = new Date()): Promise<string | undefined> {
  const reminder = await reminderRepository.get(occurrence.reminderId)
  if (!reminder || !reminder.enabled) return 'Reminder disabled.'

  if (occurrence.targetTaskId) {
    const task = await db.tasks.get(occurrence.targetTaskId)
    if (!task || task.deletedAt || task.status === 'cancelled') return 'Task is no longer active.'
    if (task.status === 'completed') return 'Task is already complete.'
  }

  if (reminder.ownerType === 'habit') {
    const habit = await db.habits.get(reminder.ownerId)
    if (!habit || habit.archived) return 'Habit is no longer active.'
    const date = dateKeyInTimeZone(occurrence.scheduledFor, reminder.timeZone)
    const entry = await db.habitEntries.get(`${habit.id}:${date}`)
    if (entry?.status === 'completed' || entry?.status === 'skipped') return 'Habit is already resolved for this date.'
    if (!habitReminderDateEligible(habit, reminder, date)) return 'Habit is not scheduled for this reminder date.'
    if (habit.schedule.type === 'times-per-week' || habit.schedule.type === 'times-per-month') {
      const entries = await db.habitEntries.where('habitId').equals(habit.id).toArray()
      const progress = habitPeriodProgress(habit, entries, date)
      if (progress.target > 0 && progress.completed >= progress.target) return 'Habit frequency target is already complete for this period.'
    }
  }

  if (reminder.ownerType === 'system' && reminder.ownerId === 'daily-planning') {
    const date = dateKeyInTimeZone(now, reminder.timeZone)
    const plan = await db.dailyPlans.get(date)
    if (plan?.status === 'committed') return 'Today is already planned.'
  }

  if (reminder.ownerType === 'system' && reminder.ownerId === 'overdue-summary') {
    const today = dateKeyInTimeZone(now, reminder.timeZone)
    const overdue = (await db.tasks.where('status').equals('todo').toArray())
      .filter((task) => !task.deletedAt && !task.parentTaskId && Boolean(task.deadline) && task.deadline! < today)
    if (!overdue.length) return 'No overdue tasks.'
  }

  return undefined
}

export async function dynamicReminderCopy(occurrence: ReminderOccurrenceEntity, now = new Date()) {
  const reminder = await reminderRepository.get(occurrence.reminderId)
  if (reminder?.ownerType === 'system' && reminder.ownerId === 'overdue-summary') {
    const today = dateKeyInTimeZone(now, reminder.timeZone)
    const overdue = (await db.tasks.where('status').equals('todo').toArray())
      .filter((task) => !task.deletedAt && !task.parentTaskId && Boolean(task.deadline) && task.deadline! < today)
    const titles = overdue.slice(0, 3).map((task) => task.title)
    return {
      title: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`,
      body: titles.length ? titles.join(' · ') : occurrence.bodySnapshot,
    }
  }
  return { title: occurrence.titleSnapshot, body: occurrence.bodySnapshot }
}
