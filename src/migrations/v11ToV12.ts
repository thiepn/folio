import type { Table } from 'dexie'
import type { TaskEntity } from '../domain/models'

export async function migrateV11ToV12(transaction: { table(name: string): Table<any, any> }) {
  await transaction.table('tasks').toCollection().modify((task: Partial<TaskEntity>) => {
    if (!Array.isArray(task.blockedByTaskIds)) task.blockedByTaskIds = []
  })
}
