import { db, DATABASE_SCHEMA_VERSION } from '../db/database'
import { backupEnvelopeSchema } from '../domain/schemas'
import { backupTaskSchema, backupProjectSchema, backupHabitSchema, backupHabitEntrySchema, backupTimeBlockSchema, backupDailyPlanSchema, backupDailyPlanItemSchema, backupFocusSchema, backupSeriesSchema, backupSettingSchema, backupImportBatchSchema, backupPatchBatchSchema, backupCalendarBatchSchema, backupReviewRecordSchema, backupReminderSchema, backupReminderOccurrenceSchema, backupFolderSchema, backupListSchema, backupSectionSchema, backupTagSchema, backupNoteSchema, backupAttachmentSchema } from './backupSchemas'
import type {
  CalendarImportBatchEntity,
  DailyPlanEntity,
  DailyPlanItemEntity,
  FocusSessionEntity,
  FolderEntity,
  ListEntity,
  SectionEntity,
  TagEntity,
  HabitEntity,
  HabitEntryEntity,
  ImportBatchEntity,
  PatchBatchEntity,
  ProjectEntity,
  RecurringSeriesEntity,
  ReminderEntity,
  ReminderOccurrenceEntity,
  ReviewRecordEntity,
  SettingEntity,
  TaskEntity,
  TimeBlockEntity,
  NoteEntity,
} from '../domain/models'
import { deserializeAttachment, serializeAttachment, type PortableAttachment } from './attachmentService'
import { contentSearchService } from './contentSearchService'

export const MIN_RESTORABLE_BACKUP_VERSION = 8

export interface BackupEnvelope {
  format: 'folio-backup'
  version: number
  exportedAt: string
  data: {
    tasks: TaskEntity[]
    projects: ProjectEntity[]
    habits: HabitEntity[]
    habitEntries: HabitEntryEntity[]
    timeBlocks: TimeBlockEntity[]
    dailyPlans: DailyPlanEntity[]
    dailyPlanItems: DailyPlanItemEntity[]
    focusSessions: FocusSessionEntity[]
    recurringSeries: RecurringSeriesEntity[]
    settings: SettingEntity[]
    importBatches: ImportBatchEntity[]
    patchBatches: PatchBatchEntity[]
    calendarImportBatches: CalendarImportBatchEntity[]
    reviewRecords: ReviewRecordEntity[]
    reminders: ReminderEntity[]
    reminderOccurrences: ReminderOccurrenceEntity[]
    folders: FolderEntity[]
    lists: ListEntity[]
    sections: SectionEntity[]
    tags: TagEntity[]
    notes: NoteEntity[]
    attachments: PortableAttachment[]
  }
}

export interface BackupPreview {
  backup: BackupEnvelope
  warnings: string[]
  counts: Record<keyof BackupEnvelope['data'], number>
}

const TABLE_KEYS = [
  'tasks', 'projects', 'habits', 'habitEntries', 'timeBlocks', 'dailyPlans', 'dailyPlanItems',
  'focusSessions', 'recurringSeries', 'settings', 'importBatches', 'patchBatches', 'calendarImportBatches', 'reviewRecords', 'reminders', 'reminderOccurrences', 'folders', 'lists', 'sections', 'tags', 'notes', 'attachments',
] as const

function objectRow(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} contains a non-object row.`)
  return value as Record<string, unknown>
}

function requireString(row: Record<string, unknown>, key: string, label: string) {
  if (typeof row[key] !== 'string' || !row[key]) throw new Error(`${label} is missing ${key}.`)
}

function uniqueIds(rows: unknown[], label: string, idKey = 'id') {
  const seen = new Set<string>()
  for (const [index, raw] of rows.entries()) {
    const row = objectRow(raw, `${label}[${index}]`)
    requireString(row, idKey, `${label}[${index}]`)
    const id = row[idKey] as string
    if (seen.has(id)) throw new Error(`${label} contains duplicate ${idKey} ${id}.`)
    seen.add(id)
  }
  return seen
}

function normalizeImportBatch(batch: any): ImportBatchEntity {
  const { affectedEntityIds: _legacyIds, ...rest } = batch
  return {
    ...rest,
    title: batch.title ?? 'Legacy import',
    affectedEntities: Array.isArray(batch.affectedEntities)
      ? batch.affectedEntities
      : (Array.isArray(batch.affectedEntityIds) ? batch.affectedEntityIds.map((id: string) => ({ type: 'task', id })) : []),
    createdSnapshots: Array.isArray(batch.createdSnapshots) ? batch.createdSnapshots : [],
    priorDailyPlans: Array.isArray(batch.priorDailyPlans) ? batch.priorDailyPlans : [],
  }
}

function normalizeLegacyTagName(value: string) {
  return value.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase()
}

function legacyTagIdFor(normalized: string) {
  let hash = 2166136261
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `tag-v19-${(hash >>> 0).toString(36)}`
}

function upgradeBackupOrganizationV19(backup: BackupEnvelope) {
  if (backup.version >= 19) return

  const names = new Map<string, string>()
  const remember = (value: string) => {
    const name = value.trim().replace(/^#/, '').replace(/\s+/g, ' ')
    if (!name) return
    const normalized = normalizeLegacyTagName(name)
    if (!names.has(normalized)) names.set(normalized, name)
  }

  for (const task of backup.data.tasks) for (const value of task.tags ?? []) remember(value)
  for (const series of backup.data.recurringSeries) {
    for (const value of series.taskTemplate.tags ?? []) remember(value)
    for (const exception of Object.values(series.exceptions ?? {})) for (const value of exception.tags ?? []) remember(value)
  }

  const stamp = backup.exportedAt
  backup.data.tags = [...names.entries()].map(([normalizedName, name], index) => ({
    id: legacyTagIdFor(normalizedName),
    name,
    normalizedName,
    favorite: false,
    archived: false,
    sortOrder: index,
    createdAt: stamp,
    updatedAt: stamp,
  }))
  const idByName = new Map(backup.data.tags.map((tag) => [tag.normalizedName, tag.id]))
  const idsFor = (values: string[] = []) => [...new Set(values.flatMap((value) => {
    const id = idByName.get(normalizeLegacyTagName(value))
    return id ? [id] : []
  }))]

  for (const task of backup.data.tasks) task.tagIds = idsFor(task.tags)
  for (const series of backup.data.recurringSeries) {
    series.taskTemplate.tagIds = idsFor(series.taskTemplate.tags)
    for (const [date, exception] of Object.entries(series.exceptions ?? {})) {
      if (exception.timelineEnd && !exception.timelineStart) throw new Error(`Recurring series “${series.title}” exception ${date} has a timeline end without a start.`)
      if (exception.timelineStart && exception.timelineEnd && exception.timelineEnd < exception.timelineStart) throw new Error(`Recurring series “${series.title}” exception ${date} has an invalid timeline span.`)
      if (exception.timelineMilestone && exception.timelineStart && exception.timelineEnd && exception.timelineEnd !== exception.timelineStart) throw new Error(`Recurring series “${series.title}” exception ${date} milestone spans multiple days.`)
      series.exceptions[date] = { ...exception, tagIds: idsFor(exception.tags ?? []) }
    }
  }
}

function upgradeBackupTimelineV20(backup: BackupEnvelope) {
  if (backup.version >= 20) return
  for (const task of backup.data.tasks) {
    task.timelineStart = task.timelineStart ?? undefined
    task.timelineEnd = task.timelineEnd ?? undefined
    task.timelineMilestone = Boolean(task.timelineMilestone)
  }
}

function normalizeBackup(raw: ReturnType<typeof backupEnvelopeSchema.parse>): BackupEnvelope {
  if (raw.version < MIN_RESTORABLE_BACKUP_VERSION) {
    throw new Error(`Backup schema v${raw.version} is too old for direct restore. Restore it in an older compatible release first, then export a fresh backup.`)
  }
  if (raw.version > DATABASE_SCHEMA_VERSION) {
    throw new Error(`Backup schema v${raw.version} is newer than this app (v${DATABASE_SCHEMA_VERSION}). Update the app before restoring it.`)
  }

  const normalized: BackupEnvelope = {
    format: raw.format,
    version: raw.version,
    exportedAt: raw.exportedAt,
    data: {
      tasks: raw.data.tasks.map((row) => backupTaskSchema.parse(row)) as TaskEntity[],
      projects: raw.data.projects.map((row) => backupProjectSchema.parse(row)) as ProjectEntity[],
      habits: raw.data.habits.map((row) => backupHabitSchema.parse(row)) as HabitEntity[],
      habitEntries: raw.data.habitEntries.map((row) => backupHabitEntrySchema.parse(row)) as HabitEntryEntity[],
      timeBlocks: raw.data.timeBlocks.map((row) => backupTimeBlockSchema.parse(row)) as TimeBlockEntity[],
      dailyPlans: raw.data.dailyPlans.map((row) => backupDailyPlanSchema.parse(row)) as DailyPlanEntity[],
      dailyPlanItems: raw.data.dailyPlanItems.map((row) => backupDailyPlanItemSchema.parse(row)) as DailyPlanItemEntity[],
      focusSessions: raw.data.focusSessions.map((row) => backupFocusSchema.parse(row)) as FocusSessionEntity[],
      recurringSeries: raw.data.recurringSeries.map((row) => backupSeriesSchema.parse(row)) as RecurringSeriesEntity[],
      settings: raw.data.settings.map((row) => backupSettingSchema.parse(row)) as SettingEntity[],
      importBatches: raw.data.importBatches.map(normalizeImportBatch).map((row) => backupImportBatchSchema.parse(row)) as ImportBatchEntity[],
      patchBatches: (raw.data.patchBatches ?? []).map((row) => backupPatchBatchSchema.parse(row)) as PatchBatchEntity[],
      calendarImportBatches: (raw.data.calendarImportBatches ?? []).map((row) => backupCalendarBatchSchema.parse(row)) as CalendarImportBatchEntity[],
      reviewRecords: (raw.data.reviewRecords ?? []).map((row) => backupReviewRecordSchema.parse(row)) as ReviewRecordEntity[],
      reminders: (raw.data.reminders ?? []).map((row) => backupReminderSchema.parse(row)) as ReminderEntity[],
      reminderOccurrences: (raw.data.reminderOccurrences ?? []).map((row) => backupReminderOccurrenceSchema.parse(row)) as ReminderOccurrenceEntity[],
      folders: (raw.data.folders ?? []).map((row) => backupFolderSchema.parse(row)) as FolderEntity[],
      lists: (raw.data.lists ?? []).map((row) => backupListSchema.parse(row)) as ListEntity[],
      sections: (raw.data.sections ?? []).map((row) => backupSectionSchema.parse(row)) as SectionEntity[],
      tags: (raw.data.tags ?? []).map((row) => backupTagSchema.parse(row)) as TagEntity[],
      notes: (raw.data.notes ?? []).map((row) => backupNoteSchema.parse(row)) as NoteEntity[],
      attachments: (raw.data.attachments ?? []).map((row) => backupAttachmentSchema.parse(row)) as PortableAttachment[],
    },
  }
  upgradeBackupOrganizationV19(normalized)
  upgradeBackupTimelineV20(normalized)
  return normalized
}

function validateBackupSemantics(backup: BackupEnvelope): string[] {
  const { data } = backup
  const taskIds = uniqueIds(data.tasks, 'tasks')
  const projectIds = uniqueIds(data.projects, 'projects')
  const habitIds = uniqueIds(data.habits, 'habits')
  uniqueIds(data.habitEntries, 'habitEntries')
  uniqueIds(data.timeBlocks, 'timeBlocks')
  uniqueIds(data.dailyPlans, 'dailyPlans', 'date')
  uniqueIds(data.dailyPlanItems, 'dailyPlanItems')
  uniqueIds(data.focusSessions, 'focusSessions')
  const seriesIds = uniqueIds(data.recurringSeries, 'recurringSeries')
  uniqueIds(data.settings, 'settings', 'key')
  uniqueIds(data.importBatches, 'importBatches')
  uniqueIds(data.patchBatches, 'patchBatches')
  uniqueIds(data.calendarImportBatches, 'calendarImportBatches')
  uniqueIds(data.reviewRecords, 'reviewRecords')
  const reminderIds = uniqueIds(data.reminders, 'reminders')
  uniqueIds(data.reminderOccurrences, 'reminderOccurrences')
  const folderIds = uniqueIds(data.folders, 'folders')
  const listIds = uniqueIds(data.lists, 'lists')
  const sectionIds = uniqueIds(data.sections, 'sections')
  const tagIds = uniqueIds(data.tags, 'tags')
  uniqueIds(data.tags, 'tags', 'normalizedName')
  const noteIds = uniqueIds(data.notes, 'notes')
  uniqueIds(data.attachments, 'attachments')

  const warnings: string[] = []
  for (const note of data.notes) if (note.sourceTaskId && !taskIds.has(note.sourceTaskId)) warnings.push(`Note “${note.title}” references a task that is no longer present; the note will still be restored.`)
  for (const attachment of data.attachments) {
    if (attachment.ownerType === 'task' && !taskIds.has(attachment.ownerId)) throw new Error(`Attachment “${attachment.name}” references a missing task.`)
    if (attachment.ownerType === 'note' && !noteIds.has(attachment.ownerId)) throw new Error(`Attachment “${attachment.name}” references a missing note.`)
    if (attachment.kind !== 'link' && !attachment.dataBase64) warnings.push(`Attachment “${attachment.name}” has metadata but no binary payload.`)
  }
  for (const task of data.tasks) {
    if (task.timelineEnd && !task.timelineStart) throw new Error(`Task “${task.title}” has a timeline end without a start.`)
    if (task.timelineStart && task.timelineEnd && task.timelineEnd < task.timelineStart) throw new Error(`Task “${task.title}” has an invalid timeline span.`)
    if (task.timelineMilestone && task.timelineStart && task.timelineEnd && task.timelineEnd !== task.timelineStart) throw new Error(`Task “${task.title}” milestone spans multiple days.`)
    if (task.projectId && !projectIds.has(task.projectId)) throw new Error(`Task “${task.title}” references a missing project.`)
    if (task.listId && !listIds.has(task.listId)) throw new Error(`Task “${task.title}” references a missing list.`)
    if (task.sectionId && !sectionIds.has(task.sectionId)) throw new Error(`Task “${task.title}” references a missing section.`)
    for (const tagId of task.tagIds ?? []) if (!tagIds.has(tagId)) throw new Error(`Task “${task.title}” references missing tag ${tagId}.`)
    if (task.parentTaskId && !taskIds.has(task.parentTaskId)) throw new Error(`Task “${task.title}” references a missing parent task.`)
    if (task.seriesId && !seriesIds.has(task.seriesId)) throw new Error(`Task “${task.title}” references a missing recurring series.`)
    for (const blockerId of task.blockedByTaskIds ?? []) {
      if (!taskIds.has(blockerId)) throw new Error(`Task “${task.title}” references missing blocker ${blockerId}.`)
      if (blockerId === task.id) throw new Error(`Task “${task.title}” cannot block itself.`)
    }
  }
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visitDependency(taskId: string) {
    if (visiting.has(taskId)) throw new Error('Backup contains a task dependency cycle.')
    if (visited.has(taskId)) return
    visiting.add(taskId)
    const task = taskMap.get(taskId)
    for (const blockerId of task?.blockedByTaskIds ?? []) visitDependency(blockerId)
    visiting.delete(taskId)
    visited.add(taskId)
  }
  for (const taskId of taskIds) visitDependency(taskId)
  for (const habitEntry of data.habitEntries) if (!habitIds.has(habitEntry.habitId)) throw new Error(`Habit history references missing habit ${habitEntry.habitId}.`)
  for (const block of data.timeBlocks) if (block.taskId && !taskIds.has(block.taskId)) throw new Error(`Time block “${block.title}” references a missing task.`)
  for (const item of data.dailyPlanItems) if (!taskIds.has(item.taskId)) throw new Error(`Daily plan item references missing task ${item.taskId}.`)
  for (const session of data.focusSessions) {
    if (session.taskId && !taskIds.has(session.taskId)) warnings.push(`Focus session ${session.id} references a task that is no longer present; historical snapshot data will be retained.`)
  }
  for (const series of data.recurringSeries) if (series.taskTemplate.projectId && !projectIds.has(series.taskTemplate.projectId)) throw new Error(`Recurring series “${series.title}” references a missing project.`)
  for (const list of data.lists) if (list.folderId && !folderIds.has(list.folderId)) throw new Error(`List “${list.name}” references a missing folder.`)
  for (const section of data.sections) if (!listIds.has(section.listId)) throw new Error(`Section “${section.name}” references a missing list.`)
  const tagParent = new Map(data.tags.map((tag) => [tag.id, tag.parentTagId]))
  for (const tag of data.tags) {
    if (tag.parentTagId && !tagIds.has(tag.parentTagId)) throw new Error(`Tag “${tag.name}” references a missing parent tag.`)
    if (tag.parentTagId === tag.id) throw new Error(`Tag “${tag.name}” cannot parent itself.`)
    const seen = new Set([tag.id])
    let cursor = tag.parentTagId
    while (cursor) {
      if (seen.has(cursor)) throw new Error('Backup contains a tag hierarchy cycle.')
      seen.add(cursor)
      cursor = tagParent.get(cursor)
    }
  }
  const sectionById = new Map(data.sections.map((section) => [section.id, section]))
  for (const task of data.tasks) {
    if (task.sectionId && !task.listId) throw new Error(`Task “${task.title}” has a section but no list.`)
    if (task.sectionId && sectionById.get(task.sectionId)?.listId !== task.listId) throw new Error(`Task “${task.title}” has a section from another list.`)
  }
  for (const series of data.recurringSeries) {
    if (series.taskTemplate.listId && !listIds.has(series.taskTemplate.listId)) throw new Error(`Recurring series “${series.title}” references a missing list.`)
    if (series.taskTemplate.sectionId && !sectionIds.has(series.taskTemplate.sectionId)) throw new Error(`Recurring series “${series.title}” references a missing section.`)
    if (series.taskTemplate.sectionId && !series.taskTemplate.listId) throw new Error(`Recurring series “${series.title}” has a section but no list.`)
    if (series.taskTemplate.sectionId && sectionById.get(series.taskTemplate.sectionId)?.listId !== series.taskTemplate.listId) throw new Error(`Recurring series “${series.title}” has a section from another list.`)
    for (const tagId of series.taskTemplate.tagIds ?? []) if (!tagIds.has(tagId)) throw new Error(`Recurring series “${series.title}” references missing tag ${tagId}.`)
    for (const [date, exception] of Object.entries(series.exceptions ?? {})) {
      if (exception.listId && !listIds.has(exception.listId)) throw new Error(`Recurring series “${series.title}” exception ${date} references a missing list.`)
      if (exception.sectionId && !sectionIds.has(exception.sectionId)) throw new Error(`Recurring series “${series.title}” exception ${date} references a missing section.`)
      const effectiveListId = Object.prototype.hasOwnProperty.call(exception, 'listId') ? (exception.listId ?? undefined) : series.taskTemplate.listId
      if (exception.sectionId && !effectiveListId) throw new Error(`Recurring series “${series.title}” exception ${date} has a section but no list.`)
      if (exception.sectionId && sectionById.get(exception.sectionId)?.listId !== effectiveListId) throw new Error(`Recurring series “${series.title}” exception ${date} has a section from another list.`)
      for (const tagId of exception.tagIds ?? []) if (!tagIds.has(tagId)) throw new Error(`Recurring series “${series.title}” exception ${date} references missing tag ${tagId}.`)
    }
  }
  for (const reminder of data.reminders) {
    if (reminder.ownerType === 'task' && !taskIds.has(reminder.ownerId)) throw new Error(`Reminder ${reminder.id} references a missing task.`)
    if (reminder.ownerType === 'series' && !seriesIds.has(reminder.ownerId)) throw new Error(`Reminder ${reminder.id} references a missing recurring series.`)
    if (reminder.ownerType === 'habit' && !habitIds.has(reminder.ownerId)) throw new Error(`Reminder ${reminder.id} references a missing habit.`)
  }
  for (const occurrence of data.reminderOccurrences) {
    if (!reminderIds.has(occurrence.reminderId)) throw new Error(`Reminder occurrence ${occurrence.id} references a missing reminder.`)
    if (occurrence.targetTaskId && !taskIds.has(occurrence.targetTaskId)) warnings.push(`Reminder occurrence ${occurrence.id} references a task that is no longer present; the historical alert record will be retained.`)
  }

  if (backup.version < DATABASE_SCHEMA_VERSION) warnings.push(`Backup schema v${backup.version} will be restored into current schema v${DATABASE_SCHEMA_VERSION}. Missing newer provenance collections will be initialized empty.`)
  const activeFocus = data.focusSessions.filter((session) => session.status === 'running' || session.status === 'paused')
  if (activeFocus.length > 1) throw new Error('Backup contains more than one active/paused Focus session.')
  if (activeFocus.length === 1) warnings.push('Backup contains an active or paused Focus session. It will be reconciled after restore.')
  return warnings
}

export async function createBackup(): Promise<BackupEnvelope> {
  const [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, rawAttachments] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.habits.toArray(), db.habitEntries.toArray(),
    db.timeBlocks.toArray(), db.dailyPlans.toArray(), db.dailyPlanItems.toArray(), db.focusSessions.toArray(), db.recurringSeries.toArray(),
    db.settings.toArray(), db.importBatches.toArray(), db.patchBatches.toArray(), db.calendarImportBatches.toArray(), db.reviewRecords.toArray(),
    db.reminders.toArray(), db.reminderOccurrences.toArray(), db.folders.toArray(), db.lists.toArray(), db.sections.toArray(), db.tags.toArray(), db.notes.toArray(), db.attachments.toArray(),
  ])
  const attachments = await Promise.all(rawAttachments.map(serializeAttachment))
  return {
    format: 'folio-backup',
    version: DATABASE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, attachments },
  }
}

export function previewBackup(value: unknown): BackupPreview {
  const parsed = backupEnvelopeSchema.parse(value)
  const backup = normalizeBackup(parsed)
  const warnings = validateBackupSemantics(backup)
  const counts = Object.fromEntries(TABLE_KEYS.map((key) => [key, backup.data[key].length])) as BackupPreview['counts']
  return { backup, warnings, counts }
}

export function validateBackup(value: unknown) {
  return previewBackup(value).backup
}

/** Replace-only restore. Callers must explicitly preview/confirm first. */
export async function restoreBackup(preview: BackupPreview): Promise<void> {
  // Re-run validation immediately before the write transaction.
  const verified = previewBackup(preview.backup)
  const d = verified.backup.data
  await db.transaction('rw', [
    db.tasks, db.projects, db.habits, db.habitEntries, db.timeBlocks, db.dailyPlans, db.dailyPlanItems,
    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches, db.reviewRecords, db.reminders, db.reminderOccurrences, db.folders, db.lists, db.sections, db.tags, db.notes, db.attachments, db.searchDocuments,
  ], async () => {
      await Promise.all(TABLE_KEYS.map((key) => (db[key] as any).clear()))
      await db.searchDocuments.clear()
      await db.projects.bulkPut(d.projects)
      await db.recurringSeries.bulkPut(d.recurringSeries)
      await db.tasks.bulkPut(d.tasks)
      await db.habits.bulkPut(d.habits)
      await db.habitEntries.bulkPut(d.habitEntries)
      await db.timeBlocks.bulkPut(d.timeBlocks)
      await db.dailyPlans.bulkPut(d.dailyPlans)
      await db.dailyPlanItems.bulkPut(d.dailyPlanItems)
      await db.focusSessions.bulkPut(d.focusSessions)
      await db.settings.bulkPut(d.settings)
      await db.importBatches.bulkPut(d.importBatches)
      await db.patchBatches.bulkPut(d.patchBatches)
      await db.calendarImportBatches.bulkPut(d.calendarImportBatches)
      await db.reviewRecords.bulkPut(d.reviewRecords)
      await db.reminders.bulkPut(d.reminders)
      await db.reminderOccurrences.bulkPut(d.reminderOccurrences)
      await db.folders.bulkPut(d.folders)
      await db.lists.bulkPut(d.lists)
      await db.sections.bulkPut(d.sections)
      await db.tags.bulkPut(d.tags)
      await db.notes.bulkPut(d.notes)
      await db.attachments.bulkPut(d.attachments.map(deserializeAttachment))
    },
  )
  await contentSearchService.rebuildAll()
}
