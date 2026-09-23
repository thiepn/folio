import { db } from '../db/database'
import { taskCreateSchema, taskUpdateSchema } from '../domain/schemas'
import type { z } from 'zod'
import type { LocalDate, TaskEntity } from '../domain/models'

export type TaskCreateInput = z.input<typeof taskCreateSchema>
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>

function active(task: TaskEntity) { return !task.deletedAt && task.status !== 'cancelled' }
function root(task: TaskEntity) { return !task.parentTaskId }
function byOrder(a: TaskEntity, b: TaskEntity) { return a.sortOrder - b.sortOrder }
function normalizeTags(tags: string[]) { return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))] }
function appendActivity(task: TaskEntity, label: string, kind: TaskEntity['activity'][number]['kind'] = 'updated') {
  return [...(task.activity ?? []), { id: crypto.randomUUID(), kind, label, at: new Date().toISOString() }].slice(-200)
}

export const taskRepository = {
  async listSnapshot(): Promise<TaskEntity[]> {
    return (await db.tasks.toArray()).sort(byOrder)
  },

  async listAll(): Promise<TaskEntity[]> {
    return (await db.tasks.toArray()).filter(active).sort(byOrder)
  },

  async listRootTasks(): Promise<TaskEntity[]> {
    return (await db.tasks.toArray()).filter((task) => active(task) && root(task)).sort(byOrder)
  },

  async listToday(date: LocalDate): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('plannedDate').equals(date).toArray()
    return tasks.filter((task) => active(task) && root(task) && (task.status === 'todo' || task.status === 'completed')).sort(byOrder)
  },



  async listPlannedBetween(fromDate: LocalDate, throughDate: LocalDate): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('plannedDate').between(fromDate, throughDate, true, true).toArray()
    return tasks
      .filter((task) => active(task) && root(task) && (task.status === 'todo' || task.status === 'completed'))
      .sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || byOrder(a, b))
  },

  async listOverdue(beforeDate: LocalDate): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('status').equals('todo').toArray()
    return tasks
      .filter((task) => active(task) && root(task) && Boolean(task.plannedDate) && task.plannedDate! < beforeDate)
      .sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || byOrder(a, b))
  },

  async listInbox(): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('status').equals('inbox').toArray()
    return tasks.filter((task) => active(task) && root(task)).sort(byOrder)
  },

  async listOpen(): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('status').anyOf('todo', 'inbox').toArray()
    return tasks.filter((task) => active(task) && root(task)).sort(byOrder)
  },

  async listCarryover(beforeDate: LocalDate): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('status').equals('todo').toArray()
    return tasks.filter((task) => active(task) && root(task) && Boolean(task.plannedDate) && task.plannedDate! < beforeDate).sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || byOrder(a, b))
  },

  async listUpcomingDeadlines(fromDate: LocalDate, throughDate: LocalDate): Promise<TaskEntity[]> {
    const tasks = await db.tasks.where('status').equals('todo').toArray()
    return tasks.filter((task) => active(task) && root(task) && Boolean(task.deadline) && task.deadline! >= fromDate && task.deadline! <= throughDate).sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || byOrder(a, b))
  },

  async listTrash(): Promise<TaskEntity[]> {
    const all = await db.tasks.toArray()
    const byId = new Map(all.map((task) => [task.id, task]))
    return all
      .filter((task) => Boolean(task.deletedAt) && (!task.parentTaskId || !byId.get(task.parentTaskId)?.deletedAt))
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
  },

  async listSubtasks(parentTaskId: string): Promise<TaskEntity[]> {
    return (await db.tasks.where('parentTaskId').equals(parentTaskId).toArray()).filter(active).sort(byOrder)
  },

  async get(id: string): Promise<TaskEntity | undefined> {
    return db.tasks.get(id)
  },

  async create(input: TaskCreateInput): Promise<TaskEntity> {
    const parsed = taskCreateSchema.parse(input)
    const now = new Date().toISOString()
    const task: TaskEntity = {
      id: crypto.randomUUID(),
      title: parsed.title,
      description: parsed.description,
      projectId: parsed.projectId,
      parentTaskId: parsed.parentTaskId,
      priority: parsed.priority,
      status: parsed.status,
      lastOpenStatus: parsed.status === 'inbox' || parsed.status === 'todo' ? parsed.status : undefined,
      plannedDate: parsed.plannedDate,
      deadline: parsed.deadline,
      estimatedMinutes: parsed.estimatedMinutes,
      tags: normalizeTags(parsed.tags),
      checklist: parsed.checklist,
      progressMode: parsed.progressMode,
      progressPercent: parsed.progressPercent,
      sourceUrl: parsed.sourceUrl,
      location: parsed.location,
      pinned: parsed.pinned,
      comments: parsed.comments,
      activity: [{ id: crypto.randomUUID(), kind: 'created', label: 'Task created', at: now }],
      seriesId: parsed.seriesId,
      recurrenceDate: parsed.recurrenceDate,
      blockedByTaskIds: parsed.blockedByTaskIds,
      sortOrder: Date.now(),
      rescheduleCount: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: parsed.status === 'completed' ? now : undefined,
    }
    await db.tasks.add(task)
    return task
  },

  async update(id: string, input: TaskUpdateInput): Promise<TaskEntity> {
    const parsed = taskUpdateSchema.parse(input)
    const current = await db.tasks.get(id)
    if (!current) throw new Error('Task not found.')
    const normalized = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === null ? undefined : value])) as Partial<TaskEntity>
    if (normalized.tags) normalized.tags = normalizeTags(normalized.tags)
    const plannedChanged = Object.prototype.hasOwnProperty.call(parsed, 'plannedDate') && normalized.plannedDate !== current.plannedDate
    const next: TaskEntity = {
      ...current,
      ...normalized,
      rescheduleCount: current.rescheduleCount + (plannedChanged && current.plannedDate ? 1 : 0),
      activity: appendActivity(current, 'Task updated'),
      updatedAt: new Date().toISOString(),
    }
    await db.tasks.put(next)
    return next
  },

  async replace(task: TaskEntity): Promise<void> {
    await db.tasks.put(task)
  },

  async bulkReplace(tasks: TaskEntity[]): Promise<void> {
    await db.tasks.bulkPut(tasks)
  },

  async removePermanently(ids: string[]): Promise<void> {
    await db.tasks.bulkDelete(ids)
  },
}
