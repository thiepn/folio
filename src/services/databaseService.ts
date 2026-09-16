import Dexie from 'dexie'
import { db, DATABASE_NAME, DATABASE_SCHEMA_VERSION, ProductivityDatabase } from '../db/database'
import { installDemoWorkspace, seedDatabaseIfNeeded } from '../db/seed'
import { appearanceSchema } from '../domain/schemas'
import { LEGACY_APPEARANCE_KEY, LEGACY_DATABASE_NAME } from '../legacy/compat'
import { recurrenceService } from './recurrenceService'
import { focusService } from './focusService'
import { initializeStorageSafety } from './storageSafetyService'

export interface DatabaseHealth {
  schemaVersion: number
  counts: Record<string, number>
  persistentStorage: boolean | null
}

const CONTENT_TABLES = [
  'tasks', 'projects', 'habits', 'habitEntries', 'timeBlocks', 'dailyPlans', 'dailyPlanItems',
  'focusSessions', 'recurringSeries', 'importBatches', 'patchBatches', 'calendarImportBatches', 'reviewRecords',
] as const

/**
 * One-time product rename migration. Existing users keep all local data while
 * the active IndexedDB database adopts the Folio name. The legacy database is
 * deleted only after every table has been copied and count-verified.
 */
async function migrateLegacyDatabaseName() {
  if (!(await Dexie.exists(LEGACY_DATABASE_NAME))) return

  if (await Dexie.exists(DATABASE_NAME)) {
    await db.open()
    const currentCounts = await Promise.all(CONTENT_TABLES.map((key) => db[key].count()))
    if (currentCounts.some((count) => count > 0)) return
  }

  const legacy = new ProductivityDatabase(LEGACY_DATABASE_NAME)
  await legacy.open()
  const [
    tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems,
    focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords,
  ] = await Promise.all([
    legacy.tasks.toArray(), legacy.projects.toArray(), legacy.habits.toArray(), legacy.habitEntries.toArray(),
    legacy.timeBlocks.toArray(), legacy.dailyPlans.toArray(), legacy.dailyPlanItems.toArray(), legacy.focusSessions.toArray(),
    legacy.recurringSeries.toArray(), legacy.settings.toArray(), legacy.importBatches.toArray(), legacy.patchBatches.toArray(), legacy.calendarImportBatches.toArray(), legacy.reviewRecords.toArray(),
  ])

  await db.open()
  await db.transaction('rw', [
    db.tasks, db.projects, db.habits, db.habitEntries, db.timeBlocks, db.dailyPlans, db.dailyPlanItems,
    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches, db.reviewRecords,
  ], async () => {
      await Promise.all([
        db.tasks.clear(), db.projects.clear(), db.habits.clear(), db.habitEntries.clear(), db.timeBlocks.clear(),
        db.dailyPlans.clear(), db.dailyPlanItems.clear(), db.focusSessions.clear(), db.recurringSeries.clear(), db.settings.clear(),
        db.importBatches.clear(), db.patchBatches.clear(), db.calendarImportBatches.clear(), db.reviewRecords.clear(),
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
    },
  )

  const expected = [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords].map((rows) => rows.length)
  const actual = await Promise.all(CONTENT_TABLES.map((key) => db[key].count()))
  if (expected.some((count, index) => count !== actual[index])) {
    legacy.close()
    throw new Error('Folio could not verify the legacy workspace migration. The original database was kept intact.')
  }

  legacy.close()
  await Dexie.delete(LEGACY_DATABASE_NAME)
}

export async function initializeDatabase() {
  await migrateLegacyDatabaseName()
  await db.open()
  await migrateLegacyLocalStorage()
  await seedDatabaseIfNeeded()
  await recurrenceService.materializeAll()
  await focusService.reconcileActive()
  await initializeStorageSafety()
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
  const [tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords] = await Promise.all([
    db.tasks.count(), db.projects.count(), db.habits.count(), db.timeBlocks.count(), db.dailyPlans.count(), db.dailyPlanItems.count(),
    db.focusSessions.count(), db.recurringSeries.count(), db.importBatches.count(), db.patchBatches.count(), db.calendarImportBatches.count(), db.reviewRecords.count(),
  ])
  const persistentStorage = navigator.storage?.persisted ? await navigator.storage.persisted() : null
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    counts: { tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords },
    persistentStorage,
  }
}

export async function loadDemoWorkspace(): Promise<DatabaseHealth> {
  const entityCounts = await Promise.all([
    db.tasks.count(), db.projects.count(), db.habits.count(), db.habitEntries.count(), db.timeBlocks.count(),
    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(), db.reviewRecords.count(),
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
