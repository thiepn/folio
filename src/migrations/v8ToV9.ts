import type { Transaction } from 'dexie'

export async function migrateV8ToV9(tx: Transaction) {
  await tx.table('importBatches').toCollection().modify((batch: any) => {
    batch.title = batch.title ?? 'Legacy import'
    batch.affectedEntities = Array.isArray(batch.affectedEntities)
      ? batch.affectedEntities
      : (batch.affectedEntityIds ?? []).map((id: string) => ({ type: 'task', id }))
    batch.createdSnapshots = Array.isArray(batch.createdSnapshots) ? batch.createdSnapshots : []
    batch.priorDailyPlans = Array.isArray(batch.priorDailyPlans) ? batch.priorDailyPlans : []
    delete batch.affectedEntityIds
  })
}
