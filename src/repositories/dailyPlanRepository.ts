import { db } from '../db/database'
import type { DailyPlanBucket, DailyPlanEntity, DailyPlanItemEntity, LocalDate } from '../domain/models'

function defaultBucket(priority: 'normal' | 'high' | 'critical'): DailyPlanBucket {
  return priority === 'critical' || priority === 'high' ? 'must' : 'planned'
}

export const dailyPlanRepository = {
  async get(date: LocalDate): Promise<DailyPlanEntity | undefined> {
    return db.dailyPlans.get(date)
  },



  async listRange(fromDate: LocalDate, throughDate: LocalDate): Promise<DailyPlanEntity[]> {
    return db.dailyPlans.where('date').between(fromDate, throughDate, true, true).toArray()
  },

  async listItemsRange(fromDate: LocalDate, throughDate: LocalDate): Promise<DailyPlanItemEntity[]> {
    const dates = await db.dailyPlans.where('date').between(fromDate, throughDate, true, true).primaryKeys()
    if (!dates.length) return []
    const all = await db.dailyPlanItems.toArray()
    const dateSet = new Set(dates as string[])
    return all.filter((item) => dateSet.has(item.date)).sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder)
  },

  async ensure(date: LocalDate): Promise<DailyPlanEntity> {
    const existing = await db.dailyPlans.get(date)
    if (existing) return existing
    const now = new Date().toISOString()
    const plan: DailyPlanEntity = { date, status: 'draft', createdAt: now, updatedAt: now }
    await db.dailyPlans.add(plan)
    return plan
  },

  async listItems(date: LocalDate): Promise<DailyPlanItemEntity[]> {
    return (await db.dailyPlanItems.where('date').equals(date).toArray()).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async ensureItem(date: LocalDate, taskId: string, priority: 'normal' | 'high' | 'critical', sortOrder = Date.now()): Promise<DailyPlanItemEntity> {
    const id = `${date}:${taskId}`
    const existing = await db.dailyPlanItems.get(id)
    if (existing) return existing
    const now = new Date().toISOString()
    const item: DailyPlanItemEntity = { id, date, taskId, bucket: defaultBucket(priority), sortOrder, createdAt: now, updatedAt: now }
    await db.dailyPlanItems.add(item)
    return item
  },

  async upsertItem(date: LocalDate, taskId: string, bucket: DailyPlanBucket, sortOrder: number): Promise<DailyPlanItemEntity> {
    const id = `${date}:${taskId}`
    const current = await db.dailyPlanItems.get(id)
    const now = new Date().toISOString()
    const item: DailyPlanItemEntity = current
      ? { ...current, bucket, sortOrder, updatedAt: now }
      : { id, date, taskId, bucket, sortOrder, createdAt: now, updatedAt: now }
    await db.dailyPlanItems.put(item)
    return item
  },

  async setBucket(date: LocalDate, taskId: string, bucket: DailyPlanBucket, fallbackOrder = Date.now()): Promise<void> {
    const id = `${date}:${taskId}`
    const existing = await db.dailyPlanItems.get(id)
    await this.upsertItem(date, taskId, bucket, existing?.sortOrder ?? fallbackOrder)
  },

  async setOrder(date: LocalDate, taskId: string, sortOrder: number, fallbackBucket: DailyPlanBucket): Promise<void> {
    const id = `${date}:${taskId}`
    const existing = await db.dailyPlanItems.get(id)
    await this.upsertItem(date, taskId, existing?.bucket ?? fallbackBucket, sortOrder)
  },

  async setCapacity(date: LocalDate, capacityMinutes?: number): Promise<void> {
    const plan = await this.ensure(date)
    await db.dailyPlans.put({ ...plan, capacityMinutes, updatedAt: new Date().toISOString() })
  },

  async commit(date: LocalDate): Promise<void> {
    const plan = await this.ensure(date)
    const now = new Date().toISOString()
    await db.dailyPlans.put({ ...plan, status: 'committed', committedAt: now, updatedAt: now })
  },

  async reopen(date: LocalDate): Promise<void> {
    const plan = await this.ensure(date)
    await db.dailyPlans.put({ ...plan, status: 'draft', committedAt: undefined, updatedAt: new Date().toISOString() })
  },
}
