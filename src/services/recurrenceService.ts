import { db } from '../db/database'
import { addLocalDays, atTimeInZone, dateKeyInTimeZone } from '../domain/date'
import type { LocalDate, RecurringSeriesEntity, TaskEntity, TimeBlockEntity } from '../domain/models'
import type { RecurringSeriesCreateInput, RecurringSeriesUpdateInput } from '../repositories/recurrenceRepository'
import type { TaskUpdateInput } from '../repositories/taskRepository'
import { recurrenceRepository } from '../repositories/recurrenceRepository'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { calendarOccurrenceDates, defaultMaterializationThrough, nextCompletionRelativeDate } from '../features/recurrence/recurrenceLogic'
import type { UndoableMutation } from './undo'

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function freshChecklist(items: string[], now = new Date().toISOString()) {
  return items.map((text, index) => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))
}

function taskFields(series: RecurringSeriesEntity, recurrenceDate: LocalDate) {
  const exception = series.exceptions[recurrenceDate] ?? {}
  const template = series.taskTemplate
  const defaultDeadline = template.deadlineOffsetDays !== undefined ? addLocalDays(recurrenceDate, template.deadlineOffsetDays) : undefined
  return {
    title: exception.title ?? template.title,
    description: exception.description ?? template.description,
    projectId: hasOwn(exception, 'projectId') ? (exception.projectId ?? undefined) : template.projectId,
    listId: hasOwn(exception, 'listId') ? (exception.listId ?? undefined) : template.listId,
    sectionId: hasOwn(exception, 'sectionId') ? (exception.sectionId ?? undefined) : template.sectionId,
    priority: exception.priority ?? template.priority,
    estimatedMinutes: hasOwn(exception, 'estimatedMinutes') ? (exception.estimatedMinutes ?? undefined) : template.estimatedMinutes,
    tags: exception.tags ?? template.tags ?? [],
    tagIds: exception.tagIds ?? template.tagIds ?? [],
    checklist: exception.checklist ?? template.checklist ?? [],
    sourceUrl: hasOwn(exception, 'sourceUrl') ? (exception.sourceUrl ?? undefined) : template.sourceUrl,
    location: hasOwn(exception, 'location') ? (exception.location ?? undefined) : template.location,
    pinned: exception.pinned ?? template.pinned ?? false,
    plannedDate: hasOwn(exception, 'plannedDate') ? (exception.plannedDate ?? undefined) : recurrenceDate,
    deadline: hasOwn(exception, 'deadline') ? (exception.deadline ?? undefined) : defaultDeadline,
  }
}

async function createOccurrence(series: RecurringSeriesEntity, recurrenceDate: LocalDate): Promise<{ task?: TaskEntity; block?: TimeBlockEntity }> {
  const exception = series.exceptions[recurrenceDate]
  if (exception?.skip) return {}
  const existing = await recurrenceRepository.getOccurrence(series.id, recurrenceDate)
  if (existing) return { task: existing }
  const fields = taskFields(series, recurrenceDate)
  const now = new Date().toISOString()
  const task = await taskRepository.create({
    ...fields,
    checklist: freshChecklist(fields.checklist, now),
    status: 'todo',
    seriesId: series.id,
    recurrenceDate,
  })
  if (fields.plannedDate) {
    const plan = await db.dailyPlans.get(fields.plannedDate)
    if (plan?.status === 'committed') await db.dailyPlans.update(fields.plannedDate, { status: 'draft', committedAt: undefined, updatedAt: new Date().toISOString() })
  }
  const startMinute = exception?.startMinute ?? series.taskTemplate.startMinute
  const duration = exception?.blockDurationMinutes ?? series.taskTemplate.blockDurationMinutes ?? fields.estimatedMinutes
  let block: TimeBlockEntity | undefined
  if (startMinute !== undefined && duration && fields.plannedDate) {
    const start = atTimeInZone(fields.plannedDate, startMinute, series.timezone)
    block = await timeBlockRepository.create({
      taskId: task.id,
      title: task.title,
      kind: 'task',
      start,
      end: new Date(new Date(start).getTime() + duration * 60_000).toISOString(),
    })
  }
  return { task, block }
}

async function removeTasksAndBlocks(taskIds: string[]) {
  if (!taskIds.length) return
  const blocks = await timeBlockRepository.listForTaskIds(taskIds)
  await db.transaction('rw', db.timeBlocks, db.dailyPlanItems, db.tasks, async () => {
    await db.timeBlocks.bulkDelete(blocks.map((block) => block.id))
    await db.dailyPlanItems.where('taskId').anyOf(taskIds).delete()
    await db.tasks.bulkDelete(taskIds)
  })
}

function seriesMaterializationThrough(series: RecurringSeriesEntity) {
  return defaultMaterializationThrough(dateKeyInTimeZone(new Date(), series.timezone))
}

async function materializeSeriesInternal(series: RecurringSeriesEntity, through?: LocalDate): Promise<string[]> {
  if (series.status !== 'active') return []
  const targetThrough = through ?? seriesMaterializationThrough(series)
  const beforeIds = new Set((await recurrenceRepository.listOccurrences(series.id)).map((task) => task.id))
  if (series.rule.frequency === 'after-completion') {
    const occurrences = await recurrenceRepository.listOccurrences(series.id)
    if (!occurrences.length) await createOccurrence(series, series.startDate)
  } else {
    const dates = calendarOccurrenceDates(series, targetThrough)
    for (const date of dates) await createOccurrence(series, date)
  }
  const next = await recurrenceRepository.get(series.id)
  if (next) {
    next.materializedThrough = targetThrough
    next.updatedAt = new Date().toISOString()
    await recurrenceRepository.replace(next)
  }
  return (await recurrenceRepository.listOccurrences(series.id)).filter((task) => !beforeIds.has(task.id)).map((task) => task.id)
}

function changedTemplateFields(update?: RecurringSeriesUpdateInput['taskTemplate']) {
  if (!update) return [] as string[]
  return Object.keys(update)
}

async function applyTemplateChanges(task: TaskEntity, series: RecurringSeriesEntity, changed: string[]) {
  if (!task.recurrenceDate || task.status === 'completed') return
  const fields = taskFields(series, task.recurrenceDate)
  const patch: Record<string, unknown> = {}
  if (changed.includes('title')) patch.title = fields.title
  if (changed.includes('description')) patch.description = fields.description
  if (changed.includes('projectId')) patch.projectId = fields.projectId
  if (changed.includes('listId')) patch.listId = fields.listId
  if (changed.includes('sectionId')) patch.sectionId = fields.sectionId
  if (changed.includes('priority')) patch.priority = fields.priority
  if (changed.includes('estimatedMinutes')) patch.estimatedMinutes = fields.estimatedMinutes
  if (changed.includes('tags') || changed.includes('tagIds')) { patch.tags = fields.tags; patch.tagIds = fields.tagIds }
  if (changed.includes('checklist')) patch.checklist = freshChecklist(fields.checklist)
  if (changed.includes('sourceUrl')) patch.sourceUrl = fields.sourceUrl
  if (changed.includes('location')) patch.location = fields.location
  if (changed.includes('pinned')) patch.pinned = fields.pinned
  if (changed.includes('deadlineOffsetDays')) patch.deadline = fields.deadline
  if (Object.keys(patch).length) await db.tasks.update(task.id, { ...patch, updatedAt: new Date().toISOString() })
  if ((changed.includes('startMinute') || changed.includes('blockDurationMinutes')) && task.plannedDate) {
    const blocks = (await timeBlockRepository.listForTaskIds([task.id])).filter((block) => block.kind === 'task')
    const startMinute = series.taskTemplate.startMinute
    const duration = series.taskTemplate.blockDurationMinutes ?? fields.estimatedMinutes
    if (startMinute === undefined || !duration) {
      for (const block of blocks) await timeBlockRepository.remove(block.id)
    } else {
      const start = atTimeInZone(task.plannedDate, startMinute, series.timezone)
      const end = new Date(new Date(start).getTime() + duration * 60_000).toISOString()
      if (blocks[0]) {
        await timeBlockRepository.update(blocks[0].id, { title: fields.title, start, end })
        for (const extra of blocks.slice(1)) await timeBlockRepository.remove(extra.id)
      } else {
        await timeBlockRepository.create({ taskId: task.id, title: fields.title, kind: 'task', start, end })
      }
    }
  }
}

export const recurrenceService = {
  async materializeAll(through?: LocalDate): Promise<void> {
    const series = await recurrenceRepository.listActive()
    for (const item of series) await materializeSeriesInternal(item, through)
  },

  async materialize(seriesId: string, through?: LocalDate): Promise<void> {
    const series = await recurrenceRepository.get(seriesId)
    if (!series) throw new Error('Recurring series not found.')
    await materializeSeriesInternal(series, through)
  },

  async create(input: RecurringSeriesCreateInput): Promise<{ series: RecurringSeriesEntity; undo: UndoableMutation }> {
    const series = await recurrenceRepository.create(input)
    const createdIds = await materializeSeriesInternal(series)
    return {
      series,
      undo: {
        message: 'Recurring task created',
        undo: async () => { await removeTasksAndBlocks(createdIds); await recurrenceRepository.remove(series.id) },
      },
    }
  },

  async convertTask(taskId: string, input: Omit<RecurringSeriesCreateInput, 'title' | 'taskTemplate'> & { taskTemplate?: Partial<RecurringSeriesCreateInput['taskTemplate']> }): Promise<UndoableMutation> {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    if (task.seriesId) throw new Error('Task already belongs to a recurring series.')
    const previous = { ...task }
    const startDate = input.startDate ?? task.plannedDate ?? dateKeyInTimeZone(new Date(), input.timezone ?? 'local')
    const created = await recurrenceRepository.create({
      title: task.title,
      timezone: input.timezone,
      startDate,
      rule: input.rule,
      taskTemplate: {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        listId: task.listId,
        sectionId: task.sectionId,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
        tags: task.tags ?? [],
        tagIds: task.tagIds ?? [],
        checklist: (task.checklist ?? []).map((item) => item.text),
        sourceUrl: task.sourceUrl,
        location: task.location,
        pinned: task.pinned ?? false,
        ...input.taskTemplate,
      },
    })
    await db.tasks.update(taskId, { seriesId: created.id, recurrenceDate: startDate, plannedDate: task.plannedDate ?? startDate, updatedAt: new Date().toISOString() })
    const generatedIds = await materializeSeriesInternal(created)
    return {
      message: 'Task now repeats',
      undo: async () => { await removeTasksAndBlocks(generatedIds); await taskRepository.replace(previous); await recurrenceRepository.remove(created.id) },
    }
  },

  async onTaskCompleted(taskId: string, completedAt: string): Promise<UndoableMutation | null> {
    const task = await taskRepository.get(taskId)
    if (!task?.seriesId) return null
    const series = await recurrenceRepository.get(task.seriesId)
    if (!series || series.status !== 'active' || series.rule.frequency !== 'after-completion') return null
    const occurrences = await recurrenceRepository.listOccurrences(series.id)
    if (series.rule.count && occurrences.length >= series.rule.count) return null
    const nextDate = nextCompletionRelativeDate(series, completedAt)
    if (!nextDate) return null
    const existing = await recurrenceRepository.getOccurrence(series.id, nextDate)
    if (existing) return null
    const { task: created } = await createOccurrence(series, nextDate)
    return created ? { message: 'Next recurring task created', undo: async () => removeTasksAndBlocks([created.id]) } : null
  },

  async skipOccurrence(taskId: string): Promise<UndoableMutation> {
    const task = await taskRepository.get(taskId)
    if (!task?.seriesId || !task.recurrenceDate) throw new Error('This task is not a recurring occurrence.')
    const series = await recurrenceRepository.get(task.seriesId)
    if (!series) throw new Error('Recurring series not found.')
    const previousSeries = structuredClone(series)
    const previousTask = { ...task }
    const previousBlocks = await timeBlockRepository.listForTaskIds([task.id])
    series.exceptions = { ...series.exceptions, [task.recurrenceDate]: { ...(series.exceptions[task.recurrenceDate] ?? {}), skip: true } }
    series.updatedAt = new Date().toISOString()
    await db.transaction('rw', db.recurringSeries, db.tasks, db.timeBlocks, async () => {
      await recurrenceRepository.replace(series)
      await db.tasks.update(task.id, { status: 'cancelled', completedAt: undefined, updatedAt: new Date().toISOString() })
      await db.timeBlocks.bulkDelete(previousBlocks.map((block) => block.id))
    })
    return {
      message: 'Occurrence skipped',
      undo: async () => { await recurrenceRepository.replace(previousSeries); await taskRepository.replace(previousTask); if (previousBlocks.length) await db.timeBlocks.bulkPut(previousBlocks) },
    }
  },

  async recordOccurrenceException(taskId: string, changes: TaskUpdateInput): Promise<UndoableMutation> {
    const task = await taskRepository.get(taskId)
    if (!task?.seriesId || !task.recurrenceDate) return { message: 'Occurrence unchanged', undo: async () => {} }
    const series = await recurrenceRepository.get(task.seriesId)
    if (!series) throw new Error('Recurring series not found.')

    const previousSeries = structuredClone(series)
    const current = { ...(series.exceptions[task.recurrenceDate] ?? {}) }

    if (Object.prototype.hasOwnProperty.call(changes, 'title') && changes.title !== undefined) current.title = changes.title
    if (Object.prototype.hasOwnProperty.call(changes, 'description') && changes.description !== undefined) current.description = changes.description
    if (Object.prototype.hasOwnProperty.call(changes, 'projectId')) current.projectId = changes.projectId ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'listId')) current.listId = changes.listId ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'sectionId')) current.sectionId = changes.sectionId ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'priority') && changes.priority !== undefined) current.priority = changes.priority
    if (Object.prototype.hasOwnProperty.call(changes, 'estimatedMinutes')) current.estimatedMinutes = changes.estimatedMinutes ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'tags') && changes.tags !== undefined) {
      current.tags = changes.tags
      current.tagIds = task.tagIds ?? []
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'tagIds') && changes.tagIds !== undefined) current.tagIds = changes.tagIds
    if (Object.prototype.hasOwnProperty.call(changes, 'checklist') && changes.checklist !== undefined) current.checklist = changes.checklist.map((item) => item.text)
    if (Object.prototype.hasOwnProperty.call(changes, 'sourceUrl')) current.sourceUrl = changes.sourceUrl ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'location')) current.location = changes.location ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'pinned') && changes.pinned !== undefined) current.pinned = changes.pinned
    if (Object.prototype.hasOwnProperty.call(changes, 'plannedDate')) current.plannedDate = changes.plannedDate ?? null
    if (Object.prototype.hasOwnProperty.call(changes, 'deadline')) current.deadline = changes.deadline ?? null

    series.exceptions = { ...series.exceptions, [task.recurrenceDate]: current }
    series.updatedAt = new Date().toISOString()
    await recurrenceRepository.replace(series)

    return {
      message: 'Occurrence override saved',
      undo: async () => { await recurrenceRepository.replace(previousSeries) },
    }
  },

  async updateEntire(seriesId: string, input: RecurringSeriesUpdateInput): Promise<UndoableMutation> {
    const previousSeries = await recurrenceRepository.get(seriesId)
    if (!previousSeries) throw new Error('Recurring series not found.')
    const previousTasks = (await recurrenceRepository.listOccurrences(seriesId)).map((task) => ({ ...task }))
    const previousBlocks = await timeBlockRepository.listForTaskIds(previousTasks.map((task) => task.id))
    const changed = changedTemplateFields(input.taskTemplate)
    const next = await recurrenceRepository.update(seriesId, input)
    const through = next.materializedThrough ?? seriesMaterializationThrough(next)
    const allowed = next.rule.frequency === 'after-completion' ? null : new Set(calendarOccurrenceDates(next, through))
    for (const task of await recurrenceRepository.listOccurrences(seriesId)) {
      if (!task.recurrenceDate || task.status === 'completed') continue
      if (allowed && !allowed.has(task.recurrenceDate)) await db.tasks.update(task.id, { status: 'cancelled', updatedAt: new Date().toISOString() })
      else {
        if (task.status === 'cancelled' && !next.exceptions[task.recurrenceDate]?.skip) await db.tasks.update(task.id, { status: 'todo', updatedAt: new Date().toISOString() })
        await applyTemplateChanges(task, next, changed)
      }
    }
    const generatedIds = await materializeSeriesInternal(next, through)
    return {
      message: 'Entire series updated',
      undo: async () => {
        await removeTasksAndBlocks(generatedIds)
        const currentBlocks = await timeBlockRepository.listForTaskIds(previousTasks.map((task) => task.id))
        if (currentBlocks.length) await db.timeBlocks.bulkDelete(currentBlocks.map((block) => block.id))
        if (previousBlocks.length) await db.timeBlocks.bulkPut(previousBlocks)
        await recurrenceRepository.replace(previousSeries)
        await taskRepository.bulkReplace(previousTasks)
      },
    }
  },

  async updateFuture(taskId: string, input: RecurringSeriesUpdateInput): Promise<UndoableMutation> {
    const pivot = await taskRepository.get(taskId)
    if (!pivot?.seriesId || !pivot.recurrenceDate) throw new Error('This task is not a recurring occurrence.')
    const previousSeries = await recurrenceRepository.get(pivot.seriesId)
    if (!previousSeries) throw new Error('Recurring series not found.')
    if (previousSeries.rule.frequency === 'after-completion') return this.updateEntire(previousSeries.id, input)

    const allOccurrences = await recurrenceRepository.listOccurrences(previousSeries.id)
    const future = allOccurrences.filter((task) => (task.recurrenceDate ?? '') >= pivot.recurrenceDate!)
    const futureSnapshots = future.map((task) => ({ ...task }))
    const futureBlockSnapshots = await timeBlockRepository.listForTaskIds(future.map((task) => task.id))
    const oldSnapshot = structuredClone(previousSeries)
    const beforeDate = addLocalDays(pivot.recurrenceDate, -1)
    const oldRule = { ...previousSeries.rule, until: beforeDate, count: undefined }
    const earlierExceptions = Object.fromEntries(Object.entries(previousSeries.exceptions).filter(([date]) => date < pivot.recurrenceDate!))
    const futureExceptions = Object.fromEntries(Object.entries(previousSeries.exceptions).filter(([date]) => date >= pivot.recurrenceDate!))
    await recurrenceRepository.replace({
      ...previousSeries,
      rule: oldRule,
      exceptions: earlierExceptions,
      updatedAt: new Date().toISOString(),
    })

    const nextRule = input.rule ?? { ...previousSeries.rule, count: previousSeries.rule.count ? Math.max(1, previousSeries.rule.count - allOccurrences.filter((task) => (task.recurrenceDate ?? '') < pivot.recurrenceDate!).length) : undefined }
    const nextTemplate = { ...previousSeries.taskTemplate, ...(input.taskTemplate ?? {}) }
    let nextSeries = await recurrenceRepository.create({
      title: input.title ?? previousSeries.title,
      timezone: previousSeries.timezone,
      startDate: pivot.recurrenceDate,
      rule: nextRule,
      taskTemplate: nextTemplate,
    })
    const pivotException = { ...(futureExceptions[pivot.recurrenceDate] ?? {}) }
    for (const field of changedTemplateFields(input.taskTemplate)) delete (pivotException as Record<string, unknown>)[field]
    if (Object.keys(pivotException).length) futureExceptions[pivot.recurrenceDate] = pivotException
    else delete futureExceptions[pivot.recurrenceDate]
    nextSeries = { ...nextSeries, exceptions: futureExceptions, updatedAt: new Date().toISOString() }
    await recurrenceRepository.replace(nextSeries)
    const now = new Date().toISOString()
    await db.transaction('rw', db.tasks, async () => {
      for (const task of future) await db.tasks.update(task.id, { seriesId: nextSeries.id, updatedAt: now })
    })
    const nextAllowed = nextRule.frequency === 'after-completion' ? null : new Set(calendarOccurrenceDates({ ...nextSeries, taskTemplate: nextTemplate }, nextSeries.materializedThrough ?? seriesMaterializationThrough(nextSeries)))
    nextAllowed?.add(pivot.recurrenceDate)
    const changed = changedTemplateFields(input.taskTemplate)
    for (const task of await recurrenceRepository.listOccurrences(nextSeries.id)) {
      if (!task.recurrenceDate || task.status === 'completed') continue
      if (nextAllowed && !nextAllowed.has(task.recurrenceDate)) await db.tasks.update(task.id, { status: 'cancelled', updatedAt: now })
      else await applyTemplateChanges(task, { ...nextSeries, taskTemplate: nextTemplate }, changed)
    }
    const generatedIds = await materializeSeriesInternal(await recurrenceRepository.get(nextSeries.id) ?? nextSeries)
    return {
      message: 'This and future occurrences updated',
      undo: async () => {
        await removeTasksAndBlocks(generatedIds)
        await recurrenceRepository.remove(nextSeries.id)
        const currentBlocks = await timeBlockRepository.listForTaskIds(futureSnapshots.map((task) => task.id))
        if (currentBlocks.length) await db.timeBlocks.bulkDelete(currentBlocks.map((block) => block.id))
        if (futureBlockSnapshots.length) await db.timeBlocks.bulkPut(futureBlockSnapshots)
        await recurrenceRepository.replace(oldSnapshot)
        await taskRepository.bulkReplace(futureSnapshots)
      },
    }
  },

  async setStatus(seriesId: string, status: 'active' | 'paused' | 'archived'): Promise<UndoableMutation> {
    const previous = await recurrenceRepository.get(seriesId)
    if (!previous) throw new Error('Recurring series not found.')
    const previousTasks = (await recurrenceRepository.listOccurrences(seriesId)).map((task) => ({ ...task }))
    const next = await recurrenceRepository.update(seriesId, { status })
    const today = dateKeyInTimeZone(new Date(), next.timezone)
    const allowed = next.rule.frequency === 'after-completion' ? null : new Set(calendarOccurrenceDates(next, next.materializedThrough ?? seriesMaterializationThrough(next)))
    for (const task of await recurrenceRepository.listOccurrences(seriesId)) {
      if (!task.recurrenceDate || task.recurrenceDate < today || task.status === 'completed') continue
      if (status !== 'active') {
        if (task.status === 'todo') await db.tasks.update(task.id, { status: 'cancelled', updatedAt: new Date().toISOString() })
      } else if (!next.exceptions[task.recurrenceDate]?.skip && (!allowed || allowed.has(task.recurrenceDate))) {
        if (task.status === 'cancelled') await db.tasks.update(task.id, { status: 'todo', updatedAt: new Date().toISOString() })
      }
    }
    if (status === 'active') await materializeSeriesInternal(next)
    return {
      message: status === 'active' ? 'Series resumed' : status === 'paused' ? 'Series paused' : 'Series ended',
      undo: async () => { await recurrenceRepository.replace(previous); await taskRepository.bulkReplace(previousTasks) },
    }
  },
}
