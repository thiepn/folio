import type { Transaction } from 'dexie'
import type { DailyPlanEntity, DailyPlanItemEntity, TaskEntity } from '../domain/models'

export async function migrateV4ToV5(transaction: Transaction) {
  const tasks = (await transaction.table('tasks').toArray()) as TaskEntity[]
  const plannedRoots = tasks.filter((task) => !task.deletedAt && !task.parentTaskId && Boolean(task.plannedDate) && task.status !== 'cancelled')
  const now = new Date().toISOString()

  const dates = [...new Set(plannedRoots.map((task) => task.plannedDate!))]
  const plans: DailyPlanEntity[] = dates.map((date) => ({
    date,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }))
  const items: DailyPlanItemEntity[] = plannedRoots.map((task) => ({
    id: `${task.plannedDate}:${task.id}`,
    date: task.plannedDate!,
    taskId: task.id,
    bucket: task.priority === 'critical' || task.priority === 'high' ? 'must' : 'planned',
    sortOrder: task.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))

  if (plans.length) await transaction.table('dailyPlans').bulkPut(plans)
  if (items.length) await transaction.table('dailyPlanItems').bulkPut(items)
}
