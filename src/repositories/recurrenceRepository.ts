import { db } from '../db/database'
import { recurringSeriesCreateSchema, recurringSeriesUpdateSchema } from '../domain/schemas'
import type { z } from 'zod'
import type { LocalDate, RecurringSeriesEntity, TaskEntity } from '../domain/models'
import { organizationRepository } from './organizationRepository'

export type RecurringSeriesCreateInput = z.input<typeof recurringSeriesCreateSchema>
export type RecurringSeriesUpdateInput = z.input<typeof recurringSeriesUpdateSchema>

export const recurrenceRepository = {
  async listAll(): Promise<RecurringSeriesEntity[]> {
    return (await db.recurringSeries.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  async listActive(): Promise<RecurringSeriesEntity[]> {
    return (await db.recurringSeries.where('status').equals('active').toArray()).sort((a, b) => a.startDate.localeCompare(b.startDate))
  },
  async get(id: string): Promise<RecurringSeriesEntity | undefined> { return db.recurringSeries.get(id) },
  async create(input: RecurringSeriesCreateInput): Promise<RecurringSeriesEntity> {
    const parsed = recurringSeriesCreateSchema.parse(input)
    const now = new Date().toISOString()
    if (parsed.taskTemplate.listId) {
      const list = await organizationRepository.getList(parsed.taskTemplate.listId)
      if (!list || list.archived) throw new Error('List not found.')
    }
    if (parsed.taskTemplate.sectionId) {
      const section = await organizationRepository.getSection(parsed.taskTemplate.sectionId)
      if (!section || section.archived || section.listId !== parsed.taskTemplate.listId) throw new Error('Section does not belong to the selected list.')
    }
    const tags = parsed.taskTemplate.tags.length
      ? await organizationRepository.resolveTagNames(parsed.taskTemplate.tags)
      : (await Promise.all(parsed.taskTemplate.tagIds.map((id) => organizationRepository.getTag(id)))).filter(Boolean)
    const entity: RecurringSeriesEntity = {
      id: crypto.randomUUID(), title: parsed.title, timezone: parsed.timezone, status: 'active', startDate: parsed.startDate,
      rule: parsed.rule,
      taskTemplate: {
        ...parsed.taskTemplate,
        tags: tags.map((tag) => tag!.name),
        tagIds: tags.map((tag) => tag!.id),
      },
      exceptions: {}, createdAt: now, updatedAt: now,
    }
    await db.recurringSeries.add(entity)
    return entity
  },
  async update(id: string, input: RecurringSeriesUpdateInput): Promise<RecurringSeriesEntity> {
    const parsed = recurringSeriesUpdateSchema.parse(input)
    const current = await db.recurringSeries.get(id)
    if (!current) throw new Error('Recurring series not found.')
    let taskTemplate = parsed.taskTemplate ? { ...current.taskTemplate, ...parsed.taskTemplate } : current.taskTemplate
    if (parsed.taskTemplate) {
      if (taskTemplate.listId) {
        const list = await organizationRepository.getList(taskTemplate.listId)
        if (!list || list.archived) throw new Error('List not found.')
      }
      if (taskTemplate.sectionId) {
        const section = await organizationRepository.getSection(taskTemplate.sectionId)
        if (!section || section.archived || section.listId !== taskTemplate.listId) throw new Error('Section does not belong to the selected list.')
      }
      if (Object.prototype.hasOwnProperty.call(parsed.taskTemplate, 'tags') || Object.prototype.hasOwnProperty.call(parsed.taskTemplate, 'tagIds')) {
        const tags = parsed.taskTemplate.tags?.length
          ? await organizationRepository.resolveTagNames(parsed.taskTemplate.tags)
          : (await Promise.all((parsed.taskTemplate.tagIds ?? []).map((tagId) => organizationRepository.getTag(tagId)))).filter(Boolean)
        taskTemplate = { ...taskTemplate, tags: tags.map((tag) => tag!.name), tagIds: tags.map((tag) => tag!.id) }
      }
    }
    const next: RecurringSeriesEntity = {
      ...current,
      ...parsed,
      rule: parsed.rule ?? current.rule,
      taskTemplate,
      updatedAt: new Date().toISOString(),
    }
    await db.recurringSeries.put(next)
    return next
  },
  async replace(series: RecurringSeriesEntity): Promise<void> { await db.recurringSeries.put(series) },
  async remove(id: string): Promise<void> { await db.recurringSeries.delete(id) },
  async listOccurrences(seriesId: string): Promise<TaskEntity[]> {
    return (await db.tasks.where('seriesId').equals(seriesId).toArray()).sort((a, b) => (a.recurrenceDate ?? a.plannedDate ?? '').localeCompare(b.recurrenceDate ?? b.plannedDate ?? ''))
  },
  async getOccurrence(seriesId: string, recurrenceDate: LocalDate): Promise<TaskEntity | undefined> {
    return db.tasks.where('[seriesId+recurrenceDate]').equals([seriesId, recurrenceDate]).first()
  },
}
