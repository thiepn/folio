import type { Transaction } from 'dexie'
import type { HabitEntity } from '../domain/models'

/**
 * v15 adds durable habit pause intervals plus optional Focus session context.
 * Focus additions are optional, so only habits need a backfill.
 */
export async function migrateV14ToV15(tx: Transaction) {
  const habits = tx.table('habits')
  await habits.toCollection().modify((habit: HabitEntity & { pauses?: unknown }) => {
    if (!Array.isArray(habit.pauses)) habit.pauses = []
  })
}
