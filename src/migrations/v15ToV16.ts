import type { Transaction } from 'dexie'

export async function migrateV15ToV16(tx: Transaction) {
  const table = tx.table('tasks')
  await table.toCollection().modify((task: any) => {
    task.tags = Array.isArray(task.tags) ? task.tags : []
    task.checklist = Array.isArray(task.checklist) ? task.checklist : []
    task.progressMode = task.progressMode === 'manual' ? 'manual' : 'auto'
    task.progressPercent = Number.isFinite(task.progressPercent) ? Math.max(0, Math.min(100, Math.round(task.progressPercent))) : 0
    task.sourceUrl = typeof task.sourceUrl === 'string' && task.sourceUrl ? task.sourceUrl : undefined
    task.location = typeof task.location === 'string' && task.location ? task.location : undefined
    task.pinned = Boolean(task.pinned)
    task.comments = Array.isArray(task.comments) ? task.comments : []
    task.activity = Array.isArray(task.activity) && task.activity.length
      ? task.activity
      : [{
          id: `v16-created-${task.id}`,
          kind: 'created',
          label: 'Existing task migrated to Task Engine V2',
          at: task.createdAt ?? task.updatedAt ?? new Date().toISOString(),
        }]
  })
}
