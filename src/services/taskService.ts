import { db } from '../db/database'
import type { LocalDate, TaskEntity } from '../domain/models'
import type { TaskCreateInput, TaskUpdateInput } from '../repositories/taskRepository'
import { taskRepository } from '../repositories/taskRepository'
import type { UndoableMutation } from './undo'
import { recurrenceService } from './recurrenceService'

export type UndoableTaskMutation = UndoableMutation

async function descendants(id: string): Promise<TaskEntity[]> {
  return (await db.tasks.where('parentTaskId').equals(id).toArray()).filter((task) => !task.deletedAt)
}


async function updateTaskWithSemantics(id: string, input: TaskUpdateInput): Promise<void> {
  const previous = await taskRepository.get(id)
  if (!previous) throw new Error('Task not found.')
  const normalized: TaskUpdateInput = input.status === 'inbox' ? { ...input, plannedDate: null, projectId: null } : input
  await taskRepository.update(id, normalized)
  if (normalized.status && normalized.status !== previous.status) {
    const now = new Date().toISOString()
    await db.tasks.update(id, {
      completedAt: normalized.status === 'completed' ? now : undefined,
      lastOpenStatus: normalized.status === 'completed'
        ? (previous.status === 'inbox' || previous.status === 'todo' ? previous.status : previous.lastOpenStatus)
        : (normalized.status === 'inbox' || normalized.status === 'todo' ? normalized.status : previous.lastOpenStatus),
      updatedAt: now,
    })
  }
}

async function setCompletedTask(id: string, completed: boolean): Promise<UndoableTaskMutation> {
  const task = await taskRepository.get(id)
  if (!task) throw new Error('Task not found.')
  const children = await descendants(id)
  const previous = [task, ...children].map((item) => ({ ...item }))
  const now = new Date().toISOString()
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.update(id, {
      status: completed ? 'completed' : (task.lastOpenStatus ?? (task.plannedDate ? 'todo' : 'inbox')),
      lastOpenStatus: completed
        ? (task.status === 'inbox' || task.status === 'todo' ? task.status : task.lastOpenStatus)
        : task.lastOpenStatus,
      completedAt: completed ? now : undefined,
      updatedAt: now,
    })
    if (completed && children.length) {
      await Promise.all(children.filter((child) => child.status !== 'completed').map((child) => db.tasks.update(child.id, { status: 'completed', completedAt: now, updatedAt: now })))
    }
  })
  const recurrenceUndo = completed ? await recurrenceService.onTaskCompleted(id, now) : null
  return {
    message: completed ? (recurrenceUndo ? 'Task completed · next occurrence created' : 'Task completed') : 'Task reopened',
    undo: async () => {
      if (recurrenceUndo) await recurrenceUndo.undo()
      await taskRepository.bulkReplace(previous)
    },
  }
}

export const taskService = {
  async create(input: TaskCreateInput) {
    const normalized = input.status === 'inbox' ? { ...input, plannedDate: undefined } : input
    return taskRepository.create(normalized)
  },

  async createUndoable(input: TaskCreateInput): Promise<{ task: TaskEntity; undo: UndoableTaskMutation }> {
    const normalized = input.status === 'inbox' ? { ...input, plannedDate: undefined } : input
    const task = await taskRepository.create(normalized)
    return {
      task,
      undo: {
        message: 'Task added',
        undo: async () => { await taskRepository.removePermanently([task.id]) },
      },
    }
  },

  async update(id: string, input: TaskUpdateInput): Promise<UndoableTaskMutation> {
    const previous = await taskRepository.get(id)
    if (!previous) throw new Error('Task not found.')
    await updateTaskWithSemantics(id, input)
    return {
      message: 'Task updated',
      undo: async () => { await taskRepository.replace(previous) },
    }
  },

  setCompleted: setCompletedTask,

  async toggleCompleted(id: string): Promise<UndoableTaskMutation> {
    const task = await taskRepository.get(id)
    if (!task) throw new Error('Task not found.')
    return setCompletedTask(id, task.status !== 'completed')
  },

  async createSubtask(parentId: string, title: string): Promise<TaskEntity> {
    const parent = await taskRepository.get(parentId)
    if (!parent) throw new Error('Parent task not found.')
    if (parent.parentTaskId) throw new Error('Nested subtasks are intentionally limited to one level.')
    if (parent.status === 'completed') {
      const now = new Date().toISOString()
      await db.tasks.update(parentId, {
        status: parent.lastOpenStatus ?? 'todo',
        completedAt: undefined,
        updatedAt: now,
      })
    }
    return taskRepository.create({
      title,
      description: '',
      parentTaskId: parentId,
      projectId: parent.projectId,
      priority: 'normal',
      status: 'todo',
    })
  },

  async duplicate(id: string): Promise<{ id: string; undo: UndoableTaskMutation }> {
    const source = await taskRepository.get(id)
    if (!source) throw new Error('Task not found.')
    const children = await descendants(id)
    const now = new Date().toISOString()
    const copyId = crypto.randomUUID()
    const root: TaskEntity = {
      ...source,
      id: copyId,
      title: `${source.title} — copy`,
      status: source.status === 'completed' ? 'todo' : source.status,
      completedAt: undefined,
      deletedAt: undefined,
      seriesId: undefined,
      recurrenceDate: undefined,
      blockedByTaskIds: [],
      rescheduleCount: 0,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now,
    }
    const copies = children.map((child, index): TaskEntity => ({
      ...child,
      id: crypto.randomUUID(),
      parentTaskId: copyId,
      status: child.status === 'completed' ? 'todo' : child.status,
      completedAt: undefined,
      deletedAt: undefined,
      seriesId: undefined,
      recurrenceDate: undefined,
      blockedByTaskIds: [],
      rescheduleCount: 0,
      sortOrder: Date.now() + index + 1,
      createdAt: now,
      updatedAt: now,
    }))
    await db.tasks.bulkAdd([root, ...copies])
    return {
      id: copyId,
      undo: {
        message: 'Task duplicated',
        undo: async () => { await taskRepository.removePermanently([copyId, ...copies.map((copy) => copy.id)]) },
      },
    }
  },

  async softDelete(id: string): Promise<UndoableTaskMutation> {
    const root = await taskRepository.get(id)
    if (!root) throw new Error('Task not found.')
    const children = await descendants(id)
    const ids = [id, ...children.map((child) => child.id)]
    const taskSnapshots = [root, ...children].map((task) => ({ ...task }))
    const now = new Date().toISOString()
    await db.transaction('rw', db.tasks, async () => {
      await Promise.all(ids.map((taskId) => db.tasks.update(taskId, { deletedAt: now, updatedAt: now })))
    })
    return {
      message: 'Task moved to trash',
      undo: async () => { await taskRepository.bulkReplace(taskSnapshots) },
    }
  },

  async restore(id: string): Promise<UndoableTaskMutation> {
    const task = await taskRepository.get(id)
    if (!task) throw new Error('Task not found.')
    const children = await db.tasks.where('parentTaskId').equals(id).toArray()
    const previous = [task, ...children].map((item) => ({ ...item }))
    const now = new Date().toISOString()
    await db.transaction('rw', db.tasks, async () => {
      await Promise.all(previous.map((item) => db.tasks.update(item.id, { deletedAt: undefined, updatedAt: now })))
    })
    return {
      message: 'Task restored',
      undo: async () => { await taskRepository.bulkReplace(previous) },
    }
  },

  async reschedule(id: string, plannedDate?: LocalDate): Promise<UndoableTaskMutation> {
    const task = await taskRepository.get(id)
    if (!task) throw new Error('Task not found.')
    const previous = { ...task }
    await taskRepository.update(id, {
      plannedDate: plannedDate ?? null,
      status: task.status === 'inbox' ? 'todo' : task.status,
    })
    return { message: plannedDate ? 'Task rescheduled' : 'Task unplanned', undo: async () => { await taskRepository.replace(previous) } }
  },

  async processInbox(id: string, options: { plannedDate?: LocalDate; projectId?: string } = {}): Promise<UndoableTaskMutation> {
    const task = await taskRepository.get(id)
    if (!task) throw new Error('Task not found.')
    const previous = { ...task }
    await taskRepository.update(id, {
      status: 'todo',
      plannedDate: options.plannedDate ?? null,
      projectId: Object.prototype.hasOwnProperty.call(options, 'projectId') ? (options.projectId || null) : task.projectId,
    })
    return { message: options.plannedDate ? 'Inbox task planned' : 'Inbox task processed', undo: async () => { await taskRepository.replace(previous) } }
  },

  async bulkUpdate(ids: string[], changes: TaskUpdateInput): Promise<UndoableTaskMutation> {
    const previous = (await db.tasks.bulkGet(ids)).filter((task): task is TaskEntity => Boolean(task)).map((task) => ({ ...task }))
    for (const id of ids) await updateTaskWithSemantics(id, changes)
    return { message: `${previous.length} tasks updated`, undo: async () => { await taskRepository.bulkReplace(previous) } }
  },
}
