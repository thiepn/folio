import type { Transaction } from 'dexie'
import type { LegacyTaskV1, TaskEntity } from '../domain/models'

export async function migrateV1ToV2(transaction: Transaction) {
  const now = new Date().toISOString()

  await transaction.table('tasks').toCollection().modify((record: LegacyTaskV1 & Partial<TaskEntity> & { completed?: boolean }) => {
    record.description ??= ''
    record.priority ??= 'normal'
    record.status = record.completed ? 'completed' : (record.plannedDate ? 'todo' : 'inbox')
    record.sortOrder ??= Date.now()
    record.createdAt ??= now
    record.updatedAt ??= now
    if (record.completed && !record.completedAt) record.completedAt = now
    delete record.completed
  })

  await transaction.table('projects').toCollection().modify((record: Record<string, unknown>) => {
    record.description ??= ''
    record.type ??= 'standard'
    record.archived ??= false
    record.createdAt ??= now
    record.updatedAt ??= now
  })

  await transaction.table('settings').toCollection().modify((record: Record<string, unknown>) => {
    record.updatedAt ??= now
  })
}
