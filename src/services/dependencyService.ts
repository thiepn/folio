import { db } from '../db/database'
import { taskRepository } from '../repositories/taskRepository'
import type { UndoableMutation } from './undo'
import { activeBlockers, wouldCreateDependencyCycle } from '../features/planner/dependencyLogic'

export const dependencyService = {
  async setBlockers(taskId: string, blockerIds: string[]): Promise<UndoableMutation> {
    const [task, all] = await Promise.all([taskRepository.get(taskId), db.tasks.toArray()])
    if (!task || task.deletedAt || task.status === 'cancelled') throw new Error('Task not found.')
    if (task.parentTaskId) throw new Error('Dependencies are intentionally limited to top-level tasks.')
    const unique = [...new Set(blockerIds)].filter(Boolean)
    if (task.status === 'inbox' && unique.length) throw new Error('Process the Inbox capture before adding dependencies.')

    const tasks = new Map(all.map((item) => [item.id, item]))
    for (const blockerId of unique) {
      const blocker = tasks.get(blockerId)
      if (!blocker || blocker.deletedAt || blocker.status === 'cancelled' || blocker.status === 'inbox') throw new Error('Prerequisites must be processed tasks.')
      if (blocker.parentTaskId) throw new Error('Subtasks cannot be used as cross-task prerequisites.')
    }
    if (wouldCreateDependencyCycle(taskId, unique, tasks)) throw new Error('This dependency would create a cycle.')

    const previous = { ...task, blockedByTaskIds: [...(task.blockedByTaskIds ?? [])] }
    await taskRepository.update(taskId, { blockedByTaskIds: unique })
    return {
      message: unique.length ? 'Task dependencies updated' : 'Task dependencies cleared',
      undo: async () => { await taskRepository.replace(previous) },
    }
  },


  async clearEdgesForInbox(taskId: string): Promise<UndoableMutation> {
    const all = await taskRepository.listAll()
    const current = all.find((item) => item.id === taskId) ?? await taskRepository.get(taskId)
    if (!current) throw new Error('Task not found.')
    if (current.status !== 'inbox') throw new Error('Dependency cleanup is only valid for Inbox tasks.')

    const snapshots: typeof all = []
    const replacements: typeof all = []
    const now = new Date().toISOString()
    for (const task of all) {
      const owns = task.id === taskId && (task.blockedByTaskIds ?? []).length > 0
      const references = task.id !== taskId && (task.blockedByTaskIds ?? []).includes(taskId)
      if (!owns && !references) continue
      snapshots.push({ ...task, blockedByTaskIds: [...(task.blockedByTaskIds ?? [])] })
      replacements.push({
        ...task,
        blockedByTaskIds: task.id === taskId ? [] : (task.blockedByTaskIds ?? []).filter((id) => id !== taskId),
        updatedAt: now,
      })
    }
    if (replacements.length) await taskRepository.bulkReplace(replacements)
    return {
      message: replacements.length ? 'Inbox task detached from dependencies' : 'Task dependencies already clear',
      undo: async () => { if (snapshots.length) await taskRepository.bulkReplace(snapshots) },
    }
  },

  async getBlockingState(taskId: string) {
    const [task, all] = await Promise.all([taskRepository.get(taskId), db.tasks.toArray()])
    if (!task) return { blocked: false, blockers: [] }
    const map = new Map(all.map((item) => [item.id, item]))
    const blockers = activeBlockers(task, map)
    return { blocked: blockers.length > 0, blockers }
  },
}
