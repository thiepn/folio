import type { Transaction } from 'dexie'

export async function migrateV9ToV10(tx: Transaction) {
  // Patch batches are introduced as a new table. Existing entity data needs no transformation.
  // Touch ImportBatch records only to ensure all v9 provenance arrays are present for backups restored from early RCs.
  await tx.table('importBatches').toCollection().modify((batch: any) => {
    batch.affectedEntities = Array.isArray(batch.affectedEntities) ? batch.affectedEntities : []
    batch.createdSnapshots = Array.isArray(batch.createdSnapshots) ? batch.createdSnapshots : []
    batch.priorDailyPlans = Array.isArray(batch.priorDailyPlans) ? batch.priorDailyPlans : []
  })
}
