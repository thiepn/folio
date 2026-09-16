import type { TaskEntity } from '../../domain/models'

export function isActiveBlocker(task: TaskEntity | undefined) {
  return Boolean(task && !task.deletedAt && task.status !== 'inbox' && task.status !== 'completed' && task.status !== 'cancelled')
}

export function activeBlockers(task: TaskEntity, tasks: Map<string, TaskEntity>) {
  return (task.blockedByTaskIds ?? []).map((id) => tasks.get(id)).filter((item): item is TaskEntity => isActiveBlocker(item))
}

export function dependencyPathExists(fromId: string, targetId: string, tasks: Map<string, TaskEntity>, visiting = new Set<string>()): boolean {
  if (fromId === targetId) return true
  if (visiting.has(fromId)) return false
  visiting.add(fromId)
  const task = tasks.get(fromId)
  if (!task) return false
  return (task.blockedByTaskIds ?? []).some((nextId) => dependencyPathExists(nextId, targetId, tasks, visiting))
}

export function wouldCreateDependencyCycle(taskId: string, blockerIds: string[], tasks: Map<string, TaskEntity>) {
  return blockerIds.some((blockerId) => blockerId === taskId || dependencyPathExists(blockerId, taskId, tasks))
}
