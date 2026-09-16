import { db } from '../db/database'
import type { ImportBatchEntity } from '../domain/models'

export const importBatchRepository = {
  async list(): Promise<ImportBatchEntity[]> {
    return (await db.importBatches.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async get(id: string) { return db.importBatches.get(id) },
  async put(batch: ImportBatchEntity) { await db.importBatches.put(batch) },
  async update(id: string, changes: Partial<ImportBatchEntity>) { await db.importBatches.update(id, changes) },
}
