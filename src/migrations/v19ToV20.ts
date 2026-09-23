import type { Transaction } from 'dexie'

export async function migrateV19ToV20(tx: Transaction) {
  await tx.table('tasks').toCollection().modify((task: any) => {
    task.timelineMilestone = Boolean(task.timelineMilestone)
    task.timelineStart = task.timelineStart ?? undefined
    task.timelineEnd = task.timelineEnd ?? undefined
  })
}
