import { db } from '../db/database'
import type { PatchBatchEntity } from '../domain/models'

export const patchBatchRepository = {
  async list(): Promise<PatchBatchEntity[]> { return (await db.patchBatches.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  async get(id: string) { return db.patchBatches.get(id) },
  async put(batch: PatchBatchEntity) { await db.patchBatches.put(batch) },
  async update(id: string, changes: Partial<PatchBatchEntity>) { await db.patchBatches.update(id, changes) },
}
