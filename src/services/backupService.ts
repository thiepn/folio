import { db, DATABASE_SCHEMA_VERSION } from '../db/database'
import { backupEnvelopeSchema } from '../domain/schemas'
import { backupTaskSchema, backupProjectSchema, backupHabitSchema, backupHabitEntrySchema, backupTimeBlockSchema, backupDailyPlanSchema, backupDailyPlanItemSchema, backupFocusSchema, backupSeriesSchema, backupSettingSchema, backupImportBatchSchema, backupPatchBatchSchema, backupCalendarBatchSchema } from './backupSchemas'
import type {
  CalendarImportBatchEntity,
  DailyPlanEntity,
  DailyPlanItemEntity,
  FocusSessionEntity,
  HabitEntity,
  HabitEntryEntity,
  ImportBatchEntity,
  PatchBatchEntity,
  ProjectEntity,
  RecurringSeriesEntity,
  SettingEntity,
  TaskEntity,
  TimeBlockEntity,
} from '../domain/models'

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
  }
}

export interface BackupPreview {
  backup: BackupEnvelope
  warnings: string[]
  counts: Record<keyof BackupEnvelope['data'], number>
}

const TABLE_KEYS = [
  'tasks', 'projects', 'habits', 'habitEntries', 'timeBlocks', 'dailyPlans', 'dailyPlanItems',
  'focusSessions', 'recurringSeries', 'settings', 'importBatches', 'patchBatches', 'calendarImportBatches',
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

function normalizeBackup(raw: ReturnType<typeof backupEnvelopeSchema.parse>): BackupEnvelope {
  if (raw.version < MIN_RESTORABLE_BACKUP_VERSION) {
    throw new Error(`Backup schema v${raw.version} is too old for direct restore. Restore it in an older compatible release first, then export a fresh backup.`)
  }
  if (raw.version > DATABASE_SCHEMA_VERSION) {
    throw new Error(`Backup schema v${raw.version} is newer than this app (v${DATABASE_SCHEMA_VERSION}). Update the app before restoring it.`)
  }

  return {
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
    },
  }
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

  const warnings: string[] = []
  for (const task of data.tasks) {
    if (task.projectId && !projectIds.has(task.projectId)) throw new Error(`Task “${task.title}” references a missing project.`)
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

  if (backup.version < DATABASE_SCHEMA_VERSION) warnings.push(`Backup schema v${backup.version} will be restored into current schema v${DATABASE_SCHEMA_VERSION}. Missing newer provenance collections will be initialized empty.`)
  const activeFocus = data.focusSessions.filter((session) => session.status === 'running' || session.status === 'paused')
  if (activeFocus.length > 1) throw new Error('Backup contains more than one active/paused Focus session.')
  if (activeFocus.length === 1) warnings.push('Backup contains an active or paused Focus session. It will be reconciled after restore.')
  return warnings
}

export async function createBackup(): Promise<BackupEnvelope> {
  const [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.habits.toArray(), db.habitEntries.toArray(),
    db.timeBlocks.toArray(), db.dailyPlans.toArray(), db.dailyPlanItems.toArray(), db.focusSessions.toArray(), db.recurringSeries.toArray(),
    db.settings.toArray(), db.importBatches.toArray(), db.patchBatches.toArray(), db.calendarImportBatches.toArray(),
  ])
  return {
    format: 'folio-backup',
    version: DATABASE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches },
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
    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches,
  ], async () => {
      await Promise.all(TABLE_KEYS.map((key) => (db[key] as any).clear()))
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
    },
  )
}
