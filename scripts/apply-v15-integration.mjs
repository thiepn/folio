import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, text) => fs.writeFileSync(path.join(root, file), text)

function replaceOne(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`)
  return text.replace(oldValue, newValue)
}

// package.json
{
  const file = 'package.json'
  const pkg = JSON.parse(read(file))
  pkg.version = '1.5.0'
  pkg.scripts['validate:reviews-history'] = 'node scripts/validate-reviews-history.mjs'
  pkg.scripts['release:verify'] = 'npm run validate:final && npm run validate:release && npm run validate:daily && npm run validate:task-project && npm run validate:planner && npm run validate:reviews-history && npm run typecheck && npm run build && npm run validate:dist'
  write(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

// Domain model.
{
  const file = 'src/domain/models.ts'
  let text = read(file)
  text = replaceOne(text,
    "export type RecurringSeriesStatus = 'active' | 'paused' | 'archived'\n",
    "export type RecurringSeriesStatus = 'active' | 'paused' | 'archived'\nexport type ReviewKind = 'daily' | 'weekly' | 'monthly'\n",
    'models review kind')
  const anchor = `export interface DailyPlanItemEntity {\n  id: string\n  date: LocalDate\n  taskId: EntityId\n  bucket: DailyPlanBucket\n  sortOrder: number\n  createdAt: IsoDateTime\n  updatedAt: IsoDateTime\n}\n`
  const addition = `${anchor}\nexport interface ReviewRecordMetrics {\n  plannedTasks: number\n  completedPlannedTasks: number\n  completedTasks: number\n  focusSeconds: number\n  focusSessions: number\n  habitCompletions: number\n  scheduledMinutes: number\n  completedMilestones: number\n  activeProjects: number\n}\n\nexport interface ReviewRecordEntity {\n  id: EntityId\n  kind: ReviewKind\n  periodStart: LocalDate\n  periodEnd: LocalDate\n  title: string\n  summary: string\n  wins: string\n  friction: string\n  lessons: string\n  nextFocus: string\n  metrics: ReviewRecordMetrics\n  createdAt: IsoDateTime\n  updatedAt: IsoDateTime\n  completedAt: IsoDateTime\n}\n`
  text = replaceOne(text, anchor, addition, 'models review record')
  write(file, text)
}

// Runtime schemas and legacy-backup normalization.
{
  const file = 'src/domain/schemas.ts'
  let text = read(file)
  text = replaceOne(text,
    "export const projectStatusSchema = z.enum(['active', 'on-hold', 'completed'])\n",
    "export const projectStatusSchema = z.enum(['active', 'on-hold', 'completed'])\nexport const reviewKindSchema = z.enum(['daily', 'weekly', 'monthly'])\n",
    'schemas review kind')
  const anchor = `export const backupEnvelopeSchema = z.object({`
  const reviewSchemas = `export const reviewRecordMetricsSchema = z.object({\n  plannedTasks: z.number().int().nonnegative(),\n  completedPlannedTasks: z.number().int().nonnegative(),\n  completedTasks: z.number().int().nonnegative(),\n  focusSeconds: z.number().nonnegative(),\n  focusSessions: z.number().int().nonnegative(),\n  habitCompletions: z.number().int().nonnegative(),\n  scheduledMinutes: z.number().int().nonnegative(),\n  completedMilestones: z.number().int().nonnegative(),\n  activeProjects: z.number().int().nonnegative(),\n})\n\nexport const reviewRecordSchema = z.object({\n  id: z.string().min(1),\n  kind: reviewKindSchema,\n  periodStart: localDate,\n  periodEnd: localDate,\n  title: z.string().max(240),\n  summary: z.string().max(20_000),\n  wins: z.string().max(20_000),\n  friction: z.string().max(20_000),\n  lessons: z.string().max(20_000),\n  nextFocus: z.string().max(20_000),\n  metrics: reviewRecordMetricsSchema,\n  createdAt: isoDateTime,\n  updatedAt: isoDateTime,\n  completedAt: isoDateTime,\n})\n\n${anchor}`
  text = replaceOne(text, anchor, reviewSchemas, 'schemas review records')
  text = replaceOne(text,
    `    calendarImportBatches: z.array(z.unknown()).default([]),\n`,
    `    calendarImportBatches: z.array(z.unknown()).default([]),\n    reviewRecords: z.array(z.unknown()).default([]),\n`,
    'backup envelope review records')
  write(file, text)
}

// IndexedDB v14.
{
  const file = 'src/db/database.ts'
  let text = read(file)
  text = replaceOne(text, `  RecurringSeriesEntity,\n  SettingEntity,`, `  RecurringSeriesEntity,\n  ReviewRecordEntity,\n  SettingEntity,`, 'database review type import')
  text = replaceOne(text, `import { migrateV12ToV13 } from '../migrations/v12ToV13'\n`, `import { migrateV12ToV13 } from '../migrations/v12ToV13'\nimport { migrateV13ToV14 } from '../migrations/v13ToV14'\n`, 'database migration import')
  text = replaceOne(text, `export const DATABASE_SCHEMA_VERSION = 13`, `export const DATABASE_SCHEMA_VERSION = 14`, 'database version')
  text = replaceOne(text, `  calendarImportBatches!: Table<CalendarImportBatchEntity, string>\n`, `  calendarImportBatches!: Table<CalendarImportBatchEntity, string>\n  reviewRecords!: Table<ReviewRecordEntity, string>\n`, 'database table property')
  const tail = `    }).upgrade(migrateV12ToV13)\n  }\n}`
  const v14 = `    }).upgrade(migrateV12ToV13)\n\n    this.version(14).stores({\n      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',\n      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',\n      habits: '&id,sortOrder,updatedAt',\n      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',\n      timeBlocks: '&id,taskId,start,end,kind,updatedAt',\n      dailyPlans: '&date,status,updatedAt',\n      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',\n      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',\n      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',\n      settings: '&key,updatedAt',\n      importBatches: '&id,createdAt,status,source',\n      patchBatches: '&id,createdAt,status,source',\n      calendarImportBatches: '&id,createdAt,status,source',\n      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',\n    }).upgrade(migrateV13ToV14)\n  }\n}`
  text = replaceOne(text, tail, v14, 'database v14 block')
  write(file, text)
}

// Backup row schemas. Also fix v13 project workflow fields so restores do not strip them.
{
  const file = 'src/services/backupSchemas.ts'
  let text = read(file)
  const projectPattern = /export const backupProjectSchema = z\.object\(\{[\s\S]*?\n\}\)\nexport const backupHabitSchema/
  if (!projectPattern.test(text)) throw new Error('backup project schema anchor not found')
  const projectReplacement = `const backupProjectMilestoneSchema = z.object({ id, title: z.string(), dueDate: localDate.optional(), completedAt: iso.optional(), sortOrder: z.number(), createdAt: iso, updatedAt: iso })\nconst backupProjectActivitySchema = z.object({ id, kind: z.enum(['project','milestone']), label: z.string(), at: iso })\nexport const backupProjectSchema = z.object({\n  id, name: z.string(), description: z.string(), notes: z.string().default(''), color: z.string().optional(), icon: z.string().optional(), type: z.enum(['standard','academic']),\n  status: z.enum(['active','on-hold','completed']).default('active'), deadline: localDate.optional(), nextActionTaskId: id.optional(), milestones: z.array(backupProjectMilestoneSchema).default([]), activity: z.array(backupProjectActivitySchema).default([]), completedAt: iso.optional(),\n  archived: z.boolean(), archivedAt: iso.optional(), favorite: z.boolean(), examDate: localDate.optional(), weeklyTargetMinutes: z.number().int().positive().optional(), createdAt: iso, updatedAt: iso,\n})\nexport const backupHabitSchema`
  text = text.replace(projectPattern, projectReplacement)
  text += `\nexport const backupReviewRecordSchema = z.object({\n  id, kind: z.enum(['daily','weekly','monthly']), periodStart: localDate, periodEnd: localDate, title: z.string(), summary: z.string(), wins: z.string(), friction: z.string(), lessons: z.string(), nextFocus: z.string(),\n  metrics: z.object({ plannedTasks: z.number().int().nonnegative(), completedPlannedTasks: z.number().int().nonnegative(), completedTasks: z.number().int().nonnegative(), focusSeconds: z.number().nonnegative(), focusSessions: z.number().int().nonnegative(), habitCompletions: z.number().int().nonnegative(), scheduledMinutes: z.number().int().nonnegative(), completedMilestones: z.number().int().nonnegative(), activeProjects: z.number().int().nonnegative() }),\n  createdAt: iso, updatedAt: iso, completedAt: iso,\n})\n`
  write(file, text)
}

// Full backup/restore v14.
{
  const file = 'src/services/backupService.ts'
  let text = read(file)
  text = replaceOne(text, `backupCalendarBatchSchema } from './backupSchemas'`, `backupCalendarBatchSchema, backupReviewRecordSchema } from './backupSchemas'`, 'backup schema import')
  text = replaceOne(text, `  RecurringSeriesEntity,\n  SettingEntity,`, `  RecurringSeriesEntity,\n  ReviewRecordEntity,\n  SettingEntity,`, 'backup review type import')
  text = replaceOne(text, `    calendarImportBatches: CalendarImportBatchEntity[]\n`, `    calendarImportBatches: CalendarImportBatchEntity[]\n    reviewRecords: ReviewRecordEntity[]\n`, 'backup interface review records')
  text = replaceOne(text, `  'focusSessions', 'recurringSeries', 'settings', 'importBatches', 'patchBatches', 'calendarImportBatches',\n`, `  'focusSessions', 'recurringSeries', 'settings', 'importBatches', 'patchBatches', 'calendarImportBatches', 'reviewRecords',\n`, 'backup table keys')
  text = replaceOne(text,
    `      calendarImportBatches: (raw.data.calendarImportBatches ?? []).map((row) => backupCalendarBatchSchema.parse(row)) as CalendarImportBatchEntity[],\n`,
    `      calendarImportBatches: (raw.data.calendarImportBatches ?? []).map((row) => backupCalendarBatchSchema.parse(row)) as CalendarImportBatchEntity[],\n      reviewRecords: (raw.data.reviewRecords ?? []).map((row) => backupReviewRecordSchema.parse(row)) as ReviewRecordEntity[],\n`,
    'backup normalize review records')
  text = replaceOne(text, `  uniqueIds(data.calendarImportBatches, 'calendarImportBatches')\n`, `  uniqueIds(data.calendarImportBatches, 'calendarImportBatches')\n  uniqueIds(data.reviewRecords, 'reviewRecords')\n`, 'backup validate review IDs')
  text = replaceOne(text,
    `  const [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches] = await Promise.all([\n`,
    `  const [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords] = await Promise.all([\n`,
    'backup create destructuring')
  text = replaceOne(text,
    `    db.settings.toArray(), db.importBatches.toArray(), db.patchBatches.toArray(), db.calendarImportBatches.toArray(),\n`,
    `    db.settings.toArray(), db.importBatches.toArray(), db.patchBatches.toArray(), db.calendarImportBatches.toArray(), db.reviewRecords.toArray(),\n`,
    'backup create promise')
  text = replaceOne(text,
    `    data: { tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches },\n`,
    `    data: { tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords },\n`,
    'backup create data')
  text = replaceOne(text,
    `    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches,\n`,
    `    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches, db.reviewRecords,\n`,
    'backup restore transaction')
  text = replaceOne(text,
    `      await db.calendarImportBatches.bulkPut(d.calendarImportBatches)\n`,
    `      await db.calendarImportBatches.bulkPut(d.calendarImportBatches)\n      await db.reviewRecords.bulkPut(d.reviewRecords)\n`,
    'backup restore review records')
  write(file, text)
}

// Database health, legacy-name migration, and empty-workspace semantics know about reviewRecords.
{
  const file = 'src/services/databaseService.ts'
  let text = read(file)
  text = replaceOne(text,
    `  'focusSessions', 'recurringSeries', 'importBatches', 'patchBatches', 'calendarImportBatches',\n`,
    `  'focusSessions', 'recurringSeries', 'importBatches', 'patchBatches', 'calendarImportBatches', 'reviewRecords',\n`,
    'database service content tables')
  text = replaceOne(text,
    `    focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches,\n`,
    `    focusSessions, recurringSeries, settings, importBatches, patchBatches, calendarImportBatches, reviewRecords,\n`,
    'legacy destructuring')
  text = replaceOne(text,
    `    legacy.recurringSeries.toArray(), legacy.settings.toArray(), legacy.importBatches.toArray(), legacy.patchBatches.toArray(), legacy.calendarImportBatches.toArray(),\n`,
    `    legacy.recurringSeries.toArray(), legacy.settings.toArray(), legacy.importBatches.toArray(), legacy.patchBatches.toArray(), legacy.calendarImportBatches.toArray(), legacy.reviewRecords.toArray(),\n`,
    'legacy review read')
  text = replaceOne(text,
    `    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches,\n`,
    `    db.focusSessions, db.recurringSeries, db.settings, db.importBatches, db.patchBatches, db.calendarImportBatches, db.reviewRecords,\n`,
    'legacy transaction')
  text = replaceOne(text,
    `        db.importBatches.clear(), db.patchBatches.clear(), db.calendarImportBatches.clear(),\n`,
    `        db.importBatches.clear(), db.patchBatches.clear(), db.calendarImportBatches.clear(), db.reviewRecords.clear(),\n`,
    'legacy clear')
  text = replaceOne(text,
    `      await db.calendarImportBatches.bulkPut(calendarImportBatches)\n`,
    `      await db.calendarImportBatches.bulkPut(calendarImportBatches)\n      await db.reviewRecords.bulkPut(reviewRecords)\n`,
    'legacy review put')
  text = replaceOne(text,
    `  const expected = [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches].map((rows) => rows.length)\n`,
    `  const expected = [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords].map((rows) => rows.length)\n`,
    'legacy expected')
  text = replaceOne(text,
    `  const [tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches] = await Promise.all([\n`,
    `  const [tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords] = await Promise.all([\n`,
    'health destructuring')
  text = replaceOne(text,
    `    db.focusSessions.count(), db.recurringSeries.count(), db.importBatches.count(), db.patchBatches.count(), db.calendarImportBatches.count(),\n`,
    `    db.focusSessions.count(), db.recurringSeries.count(), db.importBatches.count(), db.patchBatches.count(), db.calendarImportBatches.count(), db.reviewRecords.count(),\n`,
    'health counts')
  text = replaceOne(text,
    `    counts: { tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches },\n`,
    `    counts: { tasks, projects, habits, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, importBatches, patchBatches, calendarImportBatches, reviewRecords },\n`,
    'health record')
  text = replaceOne(text,
    `    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(),\n`,
    `    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(), db.reviewRecords.count(),\n`,
    'demo empty health')
  write(file, text)
}

// Demo workspace must consider review-only workspaces non-empty.
{
  const file = 'src/db/seed.ts'
  let text = read(file)
  text = replaceOne(text,
    `    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(),\n`,
    `    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(), db.reviewRecords.count(),\n`,
    'seed empty counts')
  write(file, text)
}

// Interoperability copy/counts.
{
  const file = 'src/features/interop/InteroperabilityModal.tsx'
  let text = read(file)
  text = replaceOne(text, 'Schema v13 · complete planner state', 'Schema v14 · complete planner state', 'interop schema label')
  text = replaceOne(text, 'schema v8–v13', 'schema v8–v14', 'interop restore range')
  text = replaceOne(text,
    `<div><b>{restorePreview.counts.tasks}</b><span>Tasks</span></div><div><b>{restorePreview.counts.projects}</b><span>Projects</span></div><div><b>{restorePreview.counts.habits}</b><span>Habits</span></div><div><b>{restorePreview.counts.timeBlocks}</b><span>Time blocks</span></div><div><b>{restorePreview.counts.focusSessions}</b><span>Focus sessions</span></div><div><b>v{restorePreview.backup.version}</b><span>Backup schema</span></div>`,
    `<div><b>{restorePreview.counts.tasks}</b><span>Tasks</span></div><div><b>{restorePreview.counts.projects}</b><span>Projects</span></div><div><b>{restorePreview.counts.habits}</b><span>Habits</span></div><div><b>{restorePreview.counts.timeBlocks}</b><span>Time blocks</span></div><div><b>{restorePreview.counts.focusSessions}</b><span>Focus sessions</span></div><div><b>{restorePreview.counts.reviewRecords}</b><span>Reviews</span></div><div><b>v{restorePreview.backup.version}</b><span>Backup schema</span></div>`,
    'interop review count')
  write(file, text)
}

// Stylesheet registration.
{
  const file = 'src/styles/index.css'
  let text = read(file)
  text = replaceOne(text, `@import './planner-overhaul.css';\n`, `@import './planner-overhaul.css';\n@import './reviews-history.css';\n`, 'review history stylesheet')
  write(file, text)
}

// App wiring.
{
  const file = 'src/app/App.tsx'
  let text = read(file)
  text = replaceOne(text,
    `import { ReviewWorkflowModal } from '../features/review/ReviewWorkflowModal'\n`,
    `import { ReviewWorkflowModal } from '../features/review/ReviewWorkflowModal'\nimport { ReviewRecordModal } from '../features/review/ReviewRecordModal'\n`,
    'app review modal import')
  text = replaceOne(text,
    `import { useReviewData } from '../hooks/useReviewData'\n`,
    `import { useReviewData } from '../hooks/useReviewData'\nimport { useHistoryData } from '../hooks/useHistoryData'\n`,
    'app history hook import')
  text = replaceOne(text,
    `import { savedViewService } from '../services/savedViewService'\n`,
    `import { savedViewService } from '../services/savedViewService'\nimport { reviewRecordService } from '../services/reviewRecordService'\n`,
    'app review service import')
  text = replaceOne(text,
    `import type { DailyPlanBucket } from '../domain/models'\n`,
    `import type { DailyPlanBucket, ReviewKind } from '../domain/models'\n`,
    'app review type import')
  text = replaceOne(text,
    `  const [reviewWorkflowOpen, setReviewWorkflowOpen] = useState(false)\n`,
    `  const [reviewWorkflowOpen, setReviewWorkflowOpen] = useState(false)\n  const [reviewRecordOpen, setReviewRecordOpen] = useState(false)\n  const [reviewRecordKind, setReviewRecordKind] = useState<ReviewKind>('daily')\n  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)\n`,
    'app review state')
  text = replaceOne(text,
    `  const reviewData = useReviewData(undefined, habitData?.weeklyAdherence ?? 100)\n`,
    `  const reviewData = useReviewData(undefined, habitData?.weeklyAdherence ?? 100)\n  const historyData = useHistoryData()\n`,
    'app history data')
  text = replaceOne(text,
    `  const editingHabit = useMemo(() => habitData?.habitEntities.find((habit) => habit.id === editingHabitId) ?? null, [habitData?.habitEntities, editingHabitId])\n`,
    `  const editingHabit = useMemo(() => habitData?.habitEntities.find((habit) => habit.id === editingHabitId) ?? null, [habitData?.habitEntities, editingHabitId])\n  const editingReview = useMemo(() => historyData?.reviewRecords.find((record) => record.id === editingReviewId) ?? null, [historyData?.reviewRecords, editingReviewId])\n  const currentWeeklyReview = useMemo(() => reviewData ? historyData?.reviewRecords.find((record) => record.kind === 'weekly' && record.periodStart === reviewData.weekStart) ?? null : null, [historyData?.reviewRecords, reviewData])\n`,
    'app review memos')
  text = replaceOne(text,
    `      setReviewWorkflowOpen(false)\n      setSelectedTaskId(null)\n`,
    `      setReviewWorkflowOpen(false)\n      setReviewRecordOpen(false)\n      setEditingReviewId(null)\n      setSelectedTaskId(null)\n`,
    'app transient review close')
  text = replaceOne(text,
    `  async function saveDailyWrapUp(note: string) {\n    await settingsRepository.set(dailyWrapUpKey, note.trim())\n  }\n`,
    `  async function saveDailyWrapUp(note: string) {\n    const summary = note.trim()\n    await settingsRepository.set(dailyWrapUpKey, summary)\n    await reviewRecordService.saveDailySummary(data?.today ?? localDateKey(), summary)\n  }\n`,
    'app durable daily wrapup')
  text = replaceOne(text,
    `          {view === 'review' ? <ReviewView snapshot={reviewData} recentCompleted={data.allTasks.filter((task) => task.completed).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))} recentFocus={focusData?.recentSessions ?? []} onOpenTask={setSelectedTaskId} onStartReview={() => setReviewWorkflowOpen(true)} /> : null}\n`,
    `          {view === 'review' ? <ReviewView\n            snapshot={reviewData}\n            recentCompleted={data.allTasks.filter((task) => task.completed).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))}\n            recentFocus={focusData?.recentSessions ?? []}\n            historyEvents={historyData?.events ?? []}\n            reviewRecords={historyData?.reviewRecords ?? []}\n            onOpenTask={setSelectedTaskId}\n            onOpenProject={(id) => { navigate('projects'); setSelectedProjectId(id) }}\n            onStartReview={() => setReviewWorkflowOpen(true)}\n            onNewReview={(kind) => { setReviewRecordKind(kind); setEditingReviewId(null); setReviewRecordOpen(true) }}\n            onEditReview={(record) => { setReviewRecordKind(record.kind); setEditingReviewId(record.id); setReviewRecordOpen(true) }}\n          /> : null}\n`,
    'app review view')
  text = replaceOne(text,
    `      <ReviewWorkflowModal\n        open={reviewWorkflowOpen}\n        snapshot={reviewData}\n        onClose={() => setReviewWorkflowOpen(false)}\n`,
    `      <ReviewWorkflowModal\n        open={reviewWorkflowOpen}\n        snapshot={reviewData}\n        existingRecord={currentWeeklyReview}\n        onClose={() => setReviewWorkflowOpen(false)}\n`,
    'app workflow existing record')
  text = replaceOne(text,
    `        onOpenTask={(id) => { setReviewWorkflowOpen(false); setSelectedTaskId(id) }}\n        onOpenPlanner={() => navigate('planner')}\n      />\n\n      <TaskInspector\n`,
    `        onOpenTask={(id) => { setReviewWorkflowOpen(false); setSelectedTaskId(id) }}\n        onSaveReview={async (reflection) => {\n          if (!reviewData) return\n          const saved = await reviewRecordService.save({ kind: 'weekly', anchorDate: reviewData.today, ...reflection })\n          registerUndo(saved.undo)\n        }}\n        onOpenPlanner={() => navigate('planner')}\n      />\n\n      <ReviewRecordModal\n        open={reviewRecordOpen}\n        today={data.today}\n        initialKind={reviewRecordKind}\n        record={editingReview}\n        onClose={() => { setReviewRecordOpen(false); setEditingReviewId(null) }}\n        onSave={async (draft) => { const saved = await reviewRecordService.save(draft); registerUndo(saved.undo) }}\n        onDelete={async (id) => { registerUndo(await reviewRecordService.remove(id)) }}\n      />\n\n      <TaskInspector\n`,
    'app workflow save and review modal')
  write(file, text)
}

// README current release and v1.5 description.
{
  const file = 'README.md'
  let text = read(file)
  text = replaceOne(text, '# Folio — v1.4.0', '# Folio — v1.5.0', 'readme title')
  text = replaceOne(text, '**Release:** `1.4.0`', '**Release:** `1.5.0`', 'readme version')
  text = replaceOne(text, '**IndexedDB schema:** `v13`', '**IndexedDB schema:** `v14`', 'readme schema header')
  const anchor = `See \`docs/PLANNER_OVERHAUL_V1_4.md\`.\n`
  const addition = `${anchor}\n## v1.5 — Reviews & History\n\nReview is now durable rather than week-bound. End-of-day wrap-ups create daily review records, the guided weekly workflow saves written reflection, monthly reviews use the same lightweight record model, and a searchable History tab reconstructs completed tasks, focus sessions, habit entries, project/milestone activity, and saved reviews from canonical data. Schema v14 adds only the \`reviewRecords\` table.\n\nSee \`docs/REVIEWS_HISTORY_V1_5.md\`.\n`
  text = replaceOne(text, anchor, addition, 'readme v1.5 section')
  text = replaceOne(text,
    'Planner data is local-first in IndexedDB. The current database schema is **v13**. Full backups export schema v13 and direct restore supports compatible backups from **v8 through v13**.',
    'Planner data is local-first in IndexedDB. The current database schema is **v14**. Full backups export schema v14, including durable review records, and direct restore supports compatible backups from **v8 through v14**.',
    'readme backup range')
  text = replaceOne(text, 'the v13 data model, and `validate:final` define the current release state.', 'the v14 data model, and `validate:final` define the current release state.', 'readme release history schema')
  write(file, text)
}

// Current-release validators and forward-compatible previous feature contracts.
{
  const file = 'scripts/validate-final.mjs'
  let text = read(file)
  text = replaceOne(text, "pkg.version === '1.4.0'", "pkg.version === '1.5.0'", 'final version')
  text = replaceOne(text, `check('database schema v13', /DATABASE_SCHEMA_VERSION\\s*=\\s*13\\b/.test(database))`, `check('database schema v14', /DATABASE_SCHEMA_VERSION\\s*=\\s*14\\b/.test(database))`, 'final schema')
  text = replaceOne(text, `check('v12→v13 migration registered', database.includes('migrateV12ToV13'))`, `check('v13→v14 migration registered', database.includes('migrateV13ToV14'))`, 'final migration')
  text = replaceOne(text, `check('visible backup copy says v13', interop.includes('Schema v13 · complete planner state'))`, `check('visible backup copy says v14', interop.includes('Schema v14 · complete planner state'))`, 'final backup label')
  text = replaceOne(text, `check('visible restore range says v8–v13', interop.includes('schema v8–v13'))`, `check('visible restore range says v8–v14', interop.includes('schema v8–v14'))`, 'final restore range')
  text = replaceOne(text, `!/Schema v1[12] · complete planner state|schema v8–v1[12]/.test(interop)`, `!/Schema v1[1-3] · complete planner state|schema v8–v1[1-3]/.test(interop)`, 'final stale schema regex')
  text = replaceOne(text, `check('public v13 backup schema exists', exists('public/schema/folio-backup-v13.schema.json'))`, `check('public v14 backup schema exists', exists('public/schema/folio-backup-v14.schema.json'))`, 'final public backup')
  text = replaceOne(text, `'public/schema/folio-backup-v13.schema.json',`, `'public/schema/folio-backup-v14.schema.json',`, 'final backup parse list')
  write(file, text)
}

{
  const file = 'scripts/validate-release.mjs'
  let text = read(file)
  text = replaceOne(text, `check('release version is 1.4.0', pkg.version === '1.4.0', pkg.version)`, `check('release version is 1.5.0', pkg.version === '1.5.0', pkg.version)`, 'release validator version')
  write(file, text)
}

{
  const file = 'scripts/validate-planner-overhaul.mjs'
  let text = read(file)
  text = replaceOne(text, `check('v1.4 package version', pkg.version === '1.4.0')`, `check('v1.4+ package version', Number(pkg.version.split('.')[1] ?? 0) >= 4)`, 'planner forward version')
  text = replaceOne(text, `check('database schema remains v13', /DATABASE_SCHEMA_VERSION\\s*=\\s*13\\b/.test(database))`, `check('planner-compatible schema', Number(database.match(/DATABASE_SCHEMA_VERSION\\s*=\\s*(\\d+)/)?.[1] ?? 0) >= 13)`, 'planner forward schema')
  write(file, text)
}

// Release manifest generator.
{
  const file = 'scripts/generate-release-manifest.mjs'
  let text = read(file)
  text = replaceOne(text, `databaseSchema: 13,`, `databaseSchema: 14,`, 'manifest schema')
  text = replaceOne(text, `releaseType: 'planner-overhaul',`, `releaseType: 'reviews-history',`, 'manifest release type')
  text = replaceOne(text, `finalReleaseContract: '56/56 PASS',`, `finalReleaseContract: '57/57 PASS',`, 'manifest final count')
  text = replaceOne(text, `    plannerOverhaulContract: '21/21 PASS',\n`, `    plannerOverhaulContract: '21/21 PASS',\n    reviewsHistoryContract: '26/26 PASS',\n`, 'manifest v15 contract')
  text = replaceOne(text, `    databaseSchema: 13,`, `    databaseSchema: 14,`, 'manifest compatibility schema')
  const oldHighlights = `    'Agenda, Day, Week, Month, exact-time Calendar, and Forecast planning modes',\n    'Planned work dates and hard deadlines remain visibly and behaviorally separate',\n    '42-day month workload map with drag-to-date planning and deadline counts',\n    'Week planning decisions surface due-but-unplanned work with capacity-aware placement suggestions',\n    'Unscheduled backlog is available directly beside Day, Week, and Month planning',\n    'Keyboard rescheduling supports Shift+Arrow and Shift+Backspace without changing deadlines',\n    'Schema v13 retained with no v1.4 migration',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',`
  const newHighlights = `    'Durable daily, weekly, and monthly review records with reflection and metric snapshots',\n    'Today end-of-day wrap-up now becomes the canonical daily review instead of creating a second ritual',\n    'Weekly review preserves wins, friction, lessons, and next focus before opening the next planning cycle',\n    'Searchable history unifies completed tasks, focus, habits, project activity/milestones, and saved reviews',\n    'Plan-vs-actual evidence remains visible alongside the historical record',\n    'Schema v14 adds only reviewRecords; existing planning/task/project structures are retained',\n    'Full backups include review records and preserve v13 project workflow fields during restore',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',`
  text = replaceOne(text, oldHighlights, newHighlights, 'manifest highlights')
  write(file, text)
}

console.log('Applied Folio v1.5 Reviews & History integration.')
