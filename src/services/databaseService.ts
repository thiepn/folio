import Dexie from 'dexie'
import { db, DATABASE_NAME, DATABASE_SCHEMA_VERSION, ProductivityDatabase } from '../db/database'
import { installDemoWorkspace, seedDatabaseIfNeeded } from '../db/seed'
import { appearanceSchema } from '../domain/schemas'
import { LEGACY_APPEARANCE_KEY, LEGACY_DATABASE_NAME } from '../legacy/compat'
import { recurrenceService } from './recurrenceService'
import { focusService } from './focusService'
import { initializeStorageSafety } from './storageSafetyService'
import { attachmentService } from './attachmentService'
import { contentSearchService } from './contentSearchService'
import { automationService } from './automationService'
import { localDateKey } from '../domain/date'
import { reportRuntimeIssue } from './runtimeIssueService'

export interface DatabaseHealth {
  schemaVersion: number
  counts: Record<string, number>
  persistentStorage: boolean | null
}

const CONTENT_TABLES = [
  'tasks', 'projects', 'habits', 'habitEntries', 'timeBlocks', 'dailyPlans', 'dailyPlanItems',
  'focusSessions', 'recurringSeries', 'importBatches', 'patchBatches', 'calendarImportBatches', 'reviewRecords', 'reminders', 'reminderOccurrences', 'folders', 'lists', 'sections', 'tags', 'notes', 'attachments', 'habitGroups', 'habitTemplates',
] as const

type DatabaseInfoFactory = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string; version?: number }>>
}

async function withStartupTimeout<T>(value: PromiseLike<T>, label: string, milliseconds = 3000): Promise<T> {
  let timeoutId: number | undefined
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(label + ' timed out.')), milliseconds)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

async function listKnownDatabaseNames(): Promise<Set<string> | null> {
  const factory = indexedDB as DatabaseInfoFactory
  if (typeof factory.databases !== 'function') return null
  try {
    const rows = await withStartupTimeout(factory.databases(), 'IndexedDB database listing')
    return new Set(rows.map((row) => row.name).filter((name): name is string => Boolean(name)))
  } catch (error) {
    console.warn('Could not list IndexedDB databases; using the bounded legacy probe.', error)
    return null
  }
}

async function databaseExists(name: string, knownNames: Set<string> | null) {
  if (knownNames) return knownNames.has(name)
  return withStartupTimeout(Dexie.exists(name), 'IndexedDB existence check for ' + name)
}

/**
 * One-time product rename migration. Existing users keep all local data while
 * the active IndexedDB database adopts the Folio name. The legacy database is
 * deleted only after every table has been copied and count-verified.
 */
async function migrateLegacyDatabaseName() {
  const knownDatabaseNames = await listKnownDatabaseNames()
  if (!(await databaseExists(LEGACY_DATABASE_NAME, knownDatabaseNames))) return

  if (await databaseExists(DATABASE_NAME, knownDatabaseNames)) {
    await db.open()
    const currentCounts = await Promise.all(CONTENT_TABLES.map((key) => db[key].count()))
    if (currentCounts.some((count) => count > 0)) return
  }

  const legacy = new ProductivityDatabase(LEGACY_DATABASE_NAME)
  await legacy.open()
  const [
    tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems,
    focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, attachments, habitGroups, habitTemplates,
  ] = await Promise.all([
    legacy.tasks.toArray(), legacy.projects.toArray(), legacy.habits.toArray(), legacy.habitEntries.toArray(),
    legacy.timeBlocks.toArray(), legacy.dailyPlans.toArray(), legacy.dailyPlanItems.toArray(), legacy.focusSessions.toArray(),
    legacy.recurringSeries.toArray(), legacy.settings.toArray(), legacy.importBatches.toArray(), legacy.patchBatches.toArray(), legacy.calendarImportBatches.toArray(), legacy.reviewRecords.toArray(),
    legacy.reminders.toArray(), legacy.reminderOccurrences.toArray(), legacy.folders.toArray(), legacy.lists.toArray(), legacy.sections.toArray(), legacy.tags.toArray(), legacy.notes.toArray(), legacy.attachments.toArray(), legacy.habitGroups.toArray(), legacy.habitTemplates.toArray(),
  ])

  await db.open()
  await db.transaction('rw', [
    db.tasks, db.projects, db.habits, db.habitEntries, db.timeBlocks, db.dailyPlans, db.dailyPlanItems,
    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches, db.reviewRecords, db.reminders, db.reminderOccurrences, db.folders, db.lists, db.sections, db.tags, db.notes, db.attachments, db.habitGroups, db.habitTemplates, db.searchDocuments,
  ], async () => {
      await Promise.all([
        db.tasks.clear(), db.projects.clear(), db.habits.clear(), db.habitEntries.clear(), db.timeBlocks.clear(),
        db.dailyPlans.clear(), db.dailyPlanItems.clear(), db.focusSessions.clear(), db.recurringSeries.clear(), db.settings.clear(),
        db.importBatches.clear(), db.patchBatches.clear(), db.calendarImportBatches.clear(), db.reviewRecords.clear(), db.reminders.clear(), db.reminderOccurrences.clear(), db.folders.clear(), db.lists.clear(), db.sections.clear(), db.tags.clear(), db.notes.clear(), db.attachments.clear(), db.habitGroups.clear(), db.habitTemplates.clear(), db.searchDocuments.clear(),
      ])
      await db.projects.bulkPut(projects)
      await db.recurringSeries.bulkPut(recurringSeries)
      await db.tasks.bulkPut(tasks)
      await db.habits.bulkPut(habits)
      await db.habitEntries.bulkPut(habitEntries)
      await db.timeBlocks.bulkPut(timeBlocks)
      await db.dailyPlans.bulkPut(dailyPlans)
      await db.dailyPlanItems.bulkPut(dailyPlanItems)
      await db.focusSessions.bulkPut(focusSessions)
      await db.settings.bulkPut(settings)
      await db.importBatches.bulkPut(importBatches)
      await db.patchBatches.bulkPut(patchBatches)
      await db.calendarImportBatches.bulkPut(calendarImportBatches)
      await db.reviewRecords.bulkPut(reviewRecords)
      await db.reminders.bulkPut(reminders)
      await db.reminderOccurrences.bulkPut(reminderOccurrences)
      await db.folders.bulkPut(folders)
      await db.lists.bulkPut(lists)
      await db.sections.bulkPut(sections)
      await db.tags.bulkPut(tags)
      await db.notes.bulkPut(notes)
      await db.attachments.bulkPut(attachments)
      await db.habitGroups.bulkPut(habitGroups)
      await db.habitTemplates.bulkPut(habitTemplates)
    },
  )

  const expected = [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, attachments, habitGroups, habitTemplates].map((rows) => rows.length)
  const actual = await Promise.all(CONTENT_TABLES.map((key) => db[key].count()))
  if (expected.some((count, index) => count !== actual[index])) {
    legacy.close()
    throw new Error('Folio could not verify the legacy workspace migration. The original database was kept intact.')
  }

  legacy.close()
  await Dexie.delete(LEGACY_DATABASE_NAME)
}

async function runRecoverableStartupStep(label: string, run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    console.error('Startup maintenance failed: ' + label, error)
    reportRuntimeIssue('recovery', error, label + ' failed during startup. Folio continued without resetting the workspace.')
  }
}

export async function initializeDatabase() {
  await migrateLegacyDatabaseName()
  await db.open()
  await migrateLegacyLocalStorage()
  await seedDatabaseIfNeeded()
}

export async function runStartupMaintenance() {
  const maintenanceSteps: Array<[string, () => Promise<unknown>]> = [
    ['Recurring task materialization', () => recurrenceService.materializeAll()],
    ['Focus session reconciliation', () => focusService.reconcileActive()],
    ['Storage safety initialization', () => initializeStorageSafety()],
    ['Attachment orphan cleanup', () => attachmentService.cleanupOrphans()],
    ['Search index rebuild', () => contentSearchService.rebuildAll()],
    ['Daily automation', () => automationService.runDaily(localDateKey())],
  ]
  for (const [label, run] of maintenanceSteps) await runRecoverableStartupStep(label, run)
}

async function migrateLegacyLocalStorage() {
  const existing = await db.settings.get('appearance')
  if (existing) return
  const legacy = localStorage.getItem(LEGACY_APPEARANCE_KEY)
  if (!legacy) return
  try {
    const parsed = appearanceSchema.safeParse(JSON.parse(legacy))
    if (!parsed.success) return
    await db.settings.put({ key: 'appearance', value: parsed.data, updatedAt: new Date().toISOString() })
    localStorage.removeItem(LEGACY_APPEARANCE_KEY)
  } catch {
    // A malformed legacy preference must never block database initialization.
  }
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const [tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, attachments, habitGroups, habitTemplates, syncShadows, syncQueue, syncConflicts] = await Promise.all([
    db.tasks.count(), db.projects.count(), db.habits.count(), db.timeBlocks.count(), db.dailyPlans.count(), db.dailyPlanItems.count(),
    db.focusSessions.count(), db.recurringSeries.count(), db.importBatches.count(), db.patchBatches.count(), db.calendarImportBatches.count(), db.reviewRecords.count(),
    db.reminders.count(), db.reminderOccurrences.count(), db.folders.count(), db.lists.count(), db.sections.count(), db.tags.count(), db.notes.count(), db.attachments.count(), db.habitGroups.count(), db.habitTemplates.count(), db.syncShadows.count(), db.syncQueue.count(), db.syncConflicts.count(),
  ])
  const persistentStorage = navigator.storage?.persisted ? await navigator.storage.persisted() : null
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    counts: { tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords, reminders, reminderOccurrences, folders, lists, sections, tags, notes, attachments, habitGroups, habitTemplates, syncShadows, syncQueue, syncConflicts },
    persistentStorage,
  }
}

export async function loadDemoWorkspace(): Promise<DatabaseHealth> {
  const entityCounts = await Promise.all([
    db.tasks.count(), db.projects.count(), db.habits.count(), db.habitEntries.count(), db.timeBlocks.count(),
    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(), db.reviewRecords.count(), db.reminders.count(), db.reminderOccurrences.count(), db.folders.count(), db.lists.count(), db.sections.count(), db.tags.count(), db.notes.count(), db.attachments.count(), db.habitGroups.count(), db.habitTemplates.count(),
  ])
  if (entityCounts.some(Boolean)) throw new Error('Demo workspace can only be loaded into an empty workspace.')
  await installDemoWorkspace()
  return getDatabaseHealth()
}

export async function resetDatabase() {
  db.close()
  await db.delete()
  await initializeDatabase()
}
