import type { Transaction } from 'dexie'
import type { TaskEntity } from '../domain/models'

/**
 * Phase 3 extends tasks with hierarchy, reopening semantics, and postponement metadata.
 * Existing rows are upgraded in-place and remain fully compatible.
 */
export async function migrateV2ToV3(transaction: Transaction) {
  await transaction.table('tasks').toCollection().modify((task: Partial<TaskEntity>) => {
    if (typeof task.rescheduleCount !== 'number') task.rescheduleCount = 0
    if (!task.lastOpenStatus) {
      if (task.status === 'inbox' || task.status === 'todo') task.lastOpenStatus = task.status
      else if (task.status === 'completed') task.lastOpenStatus = task.plannedDate ? 'todo' : 'inbox'
    }
  })
}
