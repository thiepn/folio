import type { Transaction } from 'dexie'

export async function migrateV7ToV8(tx: Transaction) {
  const habits = tx.table('habits')
  const habitEntries = tx.table('habitEntries')

  await habits.toCollection().modify((habit: any) => {
    habit.description = habit.description ?? ''
    habit.sortOrder = Number.isFinite(habit.sortOrder) ? habit.sortOrder : Date.parse(habit.createdAt ?? '') || Date.now()
    habit.archivedAt = habit.archived ? (habit.archivedAt ?? habit.updatedAt ?? new Date().toISOString()) : undefined
  })

  await habitEntries.toCollection().modify((entry: any) => {
    if (!entry.status) entry.status = entry.value > 0 && entry.completedAt ? 'completed' : 'open'
    if (entry.status === 'completed' && !entry.completedAt) entry.completedAt = entry.updatedAt ?? new Date().toISOString()
    if (entry.status !== 'skipped') entry.skippedAt = undefined
  })
}
