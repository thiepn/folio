import type { Transaction } from 'dexie'

export async function migrateV21ToV22(tx: Transaction) {
  await tx.table('habits').toCollection().modify((habit: any) => {
    habit.unit = habit.unit ?? undefined
    habit.color = habit.color ?? undefined
    habit.groupId = habit.groupId ?? undefined
    habit.schedule = habit.schedule ?? { type: 'daily' }
    habit.schedule.timesPerMonth = habit.schedule.timesPerMonth ?? undefined
  })
}
