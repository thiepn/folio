import { db } from '../db/database'
import type { ReviewKind, ReviewRecordEntity } from '../domain/models'

function newestFirst(a: ReviewRecordEntity, b: ReviewRecordEntity) {
  return b.periodEnd.localeCompare(a.periodEnd) || b.updatedAt.localeCompare(a.updatedAt)
}

export const reviewRecordRepository = {
  async listAll(): Promise<ReviewRecordEntity[]> {
    return (await db.reviewRecords.toArray()).sort(newestFirst)
  },

  async get(id: string): Promise<ReviewRecordEntity | undefined> {
    return db.reviewRecords.get(id)
  },

  async getForPeriod(kind: ReviewKind, periodStart: string): Promise<ReviewRecordEntity | undefined> {
    return db.reviewRecords.where('[kind+periodStart]').equals([kind, periodStart]).first()
  },

  async put(record: ReviewRecordEntity): Promise<void> {
    await db.reviewRecords.put(record)
  },

  async remove(id: string): Promise<void> {
    await db.reviewRecords.delete(id)
  },

  async replace(record: ReviewRecordEntity): Promise<void> {
    await db.reviewRecords.put(record)
  },
}
