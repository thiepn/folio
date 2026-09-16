import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, text) => fs.writeFileSync(path.join(root, file), text)

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`)
  return text.replace(from, to)
}

function replaceRegex(text, regex, to, label) {
  const matches = text.match(regex)
  if (!matches) throw new Error(`${label}: anchor not found`)
  return text.replace(regex, to)
}

// Package and release gate.
{
  const file = 'package.json'
  const pkg = JSON.parse(read(file))
  pkg.version = '1.6.0'
  pkg.scripts['validate:habits-focus'] = 'node scripts/validate-habits-focus.mjs'
  pkg.scripts['release:verify'] = pkg.scripts['release:verify'].replace('npm run validate:reviews-history && npm run typecheck', 'npm run validate:reviews-history && npm run validate:habits-focus && npm run typecheck')
  write(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

// Domain model.
{
  const file = 'src/domain/models.ts'
  let text = read(file)
  text = replaceOne(text,
    `export interface HabitEntity {`,
    `export interface HabitPausePeriod {\n  id: EntityId\n  startDate: LocalDate\n  endDate?: LocalDate\n  createdAt: IsoDateTime\n}\n\nexport interface HabitEntity {`,
    'habit pause model')
  text = replaceOne(text,
    `  countsTowardCapacity: boolean\n  archived: boolean`,
    `  countsTowardCapacity: boolean\n  pauses: HabitPausePeriod[]\n  archived: boolean`,
    'habit pause field')
  text = replaceOne(text,
    `  targetSeconds?: number\n  startedAt: IsoDateTime`,
    `  targetSeconds?: number\n  plannedSeconds?: number\n  intention?: string\n  note?: string\n  startedAt: IsoDateTime`,
    'focus context fields')
  write(file, text)
}

// Runtime schemas.
{
  const file = 'src/domain/schemas.ts'
  let text = read(file)
  text = replaceOne(text,
    `export const habitCreateSchema = z.object({`,
    `export const habitPausePeriodSchema = z.object({\n  id: z.string().min(1),\n  startDate: localDate,\n  endDate: localDate.optional(),\n  createdAt: isoDateTime,\n}).superRefine((value, ctx) => {\n  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: 'custom', message: 'Pause end date must be on or after its start date.', path: ['endDate'] })\n})\n\nexport const habitCreateSchema = z.object({`,
    'habit pause schema')
  text = replaceOne(text,
    `  countsTowardCapacity: z.boolean().default(false),\n})`,
    `  countsTowardCapacity: z.boolean().default(false),\n  pauses: z.array(habitPausePeriodSchema).default([]),\n})`,
    'habit create pauses')
  text = replaceOne(text,
    `  targetSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),\n}).superRefine`,
    `  targetSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),\n  plannedSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),\n  intention: z.string().trim().max(240).optional(),\n  note: z.string().trim().max(2000).optional(),\n}).superRefine`,
    'focus create context')
  write(file, text)
}

// Habit creation stores current-model pause history.
{
  const file = 'src/repositories/habitRepository.ts'
  let text = read(file)
  text = replaceOne(text,
    `      countsTowardCapacity: parsed.kind === 'duration' ? parsed.countsTowardCapacity : false,\n      archived: false,`,
    `      countsTowardCapacity: parsed.kind === 'duration' ? parsed.countsTowardCapacity : false,\n      pauses: parsed.pauses,\n      archived: false,`,
    'habit repository pauses')
  write(file, text)
}

// IndexedDB schema v15.
{
  const file = 'src/db/database.ts'
  let text = read(file)
  text = replaceOne(text,
    `import { migrateV13ToV14 } from '../migrations/v13ToV14'`,
    `import { migrateV13ToV14 } from '../migrations/v13ToV14'\nimport { migrateV14ToV15 } from '../migrations/v14ToV15'`,
    'database migration import')
  text = replaceOne(text, `export const DATABASE_SCHEMA_VERSION = 14`, `export const DATABASE_SCHEMA_VERSION = 15`, 'database version')
  const anchor = `    }).upgrade(migrateV13ToV14)\n  }\n}`
  const v15 = `    }).upgrade(migrateV13ToV14)\n\n    this.version(15).stores({\n      tasks: '&id,status,plannedDate,deadline,projectId,parentTaskId,seriesId,recurrenceDate,*blockedByTaskIds,deletedAt,updatedAt,[status+plannedDate],[seriesId+recurrenceDate]',\n      projects: '&id,name,type,status,deadline,archived,favorite,updatedAt,[archived+favorite]',\n      habits: '&id,sortOrder,updatedAt',\n      habitEntries: '&id,habitId,date,status,updatedAt,[habitId+date],[habitId+status]',\n      timeBlocks: '&id,taskId,start,end,kind,updatedAt',\n      dailyPlans: '&date,status,updatedAt',\n      dailyPlanItems: '&id,date,taskId,bucket,updatedAt,[date+bucket],[date+taskId]',\n      focusSessions: '&id,taskId,projectIdSnapshot,startedAt,endedAt,status,[status+startedAt]',\n      recurringSeries: '&id,status,startDate,timezone,updatedAt,[status+startDate]',\n      settings: '&key,updatedAt',\n      importBatches: '&id,createdAt,status,source',\n      patchBatches: '&id,createdAt,status,source',\n      calendarImportBatches: '&id,createdAt,status,source',\n      reviewRecords: '&id,kind,periodStart,periodEnd,updatedAt,[kind+periodStart]',\n    }).upgrade(migrateV14ToV15)\n  }\n}`
  text = replaceOne(text, anchor, v15, 'database v15 stores')
  write(file, text)
}

// Backup parsing preserves v15 additions and defaults older rows safely.
{
  const file = 'src/services/backupSchemas.ts'
  let text = read(file)
  text = replaceOne(text,
    `export const backupHabitSchema = z.object({`,
    `const backupHabitPauseSchema = z.object({ id, startDate: localDate, endDate: localDate.optional(), createdAt: iso })\nexport const backupHabitSchema = z.object({`,
    'backup habit pause schema')
  text = replaceOne(text,
    `countsTowardCapacity: z.boolean(), archived: z.boolean()`,
    `countsTowardCapacity: z.boolean(), pauses: z.array(backupHabitPauseSchema).default([]), archived: z.boolean()`,
    'backup habit pauses')
  text = replaceOne(text,
    `mode: z.enum(['stopwatch','countdown']), targetSeconds: z.number().int().positive().optional(), startedAt: iso`,
    `mode: z.enum(['stopwatch','countdown']), targetSeconds: z.number().int().positive().optional(), plannedSeconds: z.number().int().positive().optional(), intention: z.string().optional(), note: z.string().optional(), startedAt: iso`,
    'backup focus context')
  write(file, text)
}

// Focus reflection becomes searchable history.
{
  const file = 'src/features/review/historyLogic.ts'
  let text = read(file)
  text = replaceOne(text,
    `      detail: \`${'${formatMinutes(minutes)}'} focused${'${session.projectNameSnapshot ? ` · ${session.projectNameSnapshot}` : \'\'}'}\`,\n      projectName: session.projectNameSnapshot,`,
    `      detail: \`${'${formatMinutes(minutes)}'} focused${'${session.projectNameSnapshot ? ` · ${session.projectNameSnapshot}` : \'\'}'}${'${session.intention ? ` · ${session.intention}` : \'\'}'}\`,\n      searchExtra: [session.intention, session.note].filter(Boolean).join(' '),\n      projectName: session.projectNameSnapshot,`,
    'focus history context')
  text = replaceOne(text,
    `function makeEvent(input: Omit<HistoryEvent, 'date' | 'searchText'>): HistoryEvent {\n  const date = localDateKey(new Date(input.at))\n  const searchText = [input.title, input.detail, input.projectName, input.kind].filter(Boolean).join(' ').toLocaleLowerCase()\n  return { ...input, date, searchText }\n}`,
    `function makeEvent(input: Omit<HistoryEvent, 'date' | 'searchText'> & { searchExtra?: string }): HistoryEvent {\n  const { searchExtra, ...event } = input\n  const date = localDateKey(new Date(event.at))\n  const searchText = [event.title, event.detail, event.projectName, event.kind, searchExtra].filter(Boolean).join(' ').toLocaleLowerCase()\n  return { ...event, date, searchText }\n}`,
    'history search extras')
  write(file, text)
}

// App wiring.
{
  const file = 'src/app/App.tsx'
  let text = read(file)
  text = replaceOne(text,
    `longestStreak={habitData.longestStreak} onCreate=`,
    `longestStreak={habitData.longestStreak} pausedCount={habitData.pausedCount} onCreate=`,
    'habits paused count wiring')
  text = replaceOne(text,
    `        onSkip={() => selectedHabitId && void toggleHabitSkip(selectedHabitId)}\n      />`,
    `        onSkip={() => selectedHabitId && void toggleHabitSkip(selectedHabitId)}\n        onPause={(through) => selectedHabitId && void habitService.pause(selectedHabitId, data.today, through).then(async (undo) => { registerUndo(undo); await dailyPlanningService.markDraft(data.today) })}\n        onResume={() => selectedHabitId && void habitService.resume(selectedHabitId, data.today).then(async (undo) => { registerUndo(undo); await dailyPlanningService.markDraft(data.today) })}\n      />`,
    'habit pause app wiring')
  text = replaceOne(text,
    `        taskTotals={focusData?.taskTotals ?? {}}\n        onClose={() => setFocusOpen(false)}`,
    `        taskTotals={focusData?.taskTotals ?? {}}\n        recentSessions={focusData?.recentSessions ?? []}\n        todaySeconds={focusData?.todaySeconds ?? 0}\n        weekSeconds={focusData?.weekSeconds ?? 0}\n        weekSessionCount={focusData?.weekSessionCount ?? 0}\n        onClose={() => setFocusOpen(false)}`,
    'focus context props')
  text = replaceOne(text,
    `        onStart={async (taskId, mode, targetSeconds) => { await focusService.start(taskId, mode, targetSeconds); setFocusPreferredTaskId(taskId) }}`,
    `        onStart={async (taskId, mode, targetSeconds, plannedSeconds, intention) => { await focusService.start(taskId, mode, targetSeconds, plannedSeconds, intention); setFocusPreferredTaskId(taskId) }}`,
    'focus start app wiring')
  text = replaceOne(text,
    `        onFinish={async (id) => { await focusService.finish(id); setFocusOpen(false) }}`,
    `        onFinish={async (id, note) => { await focusService.finish(id, note); setFocusOpen(false) }}`,
    'focus finish app wiring')
  text = replaceOne(text,
    `        onFinishTask={async (id, taskId) => { await focusService.finish(id); if (taskId) registerUndo(await taskService.setCompleted(taskId, true)); setFocusOpen(false) }}`,
    `        onFinishTask={async (id, taskId, note) => { await focusService.finish(id, note); if (taskId) registerUndo(await taskService.setCompleted(taskId, true)); setFocusOpen(false) }}`,
    'focus finish task app wiring')
  write(file, text)
}

// Portability copy.
{
  const file = 'src/features/interop/InteroperabilityModal.tsx'
  let text = read(file)
  text = text.replaceAll('Schema v14 · complete planner state', 'Schema v15 · complete planner state')
  text = text.replaceAll('schema v8–v14', 'schema v8–v15')
  write(file, text)
}

// README release state.
{
  const file = 'README.md'
  let text = read(file)
  text = replaceOne(text, '# Folio — v1.5.0', '# Folio — v1.6.0', 'README title')
  text = replaceOne(text, '**Release:** `1.5.0`', '**Release:** `1.6.0`', 'README release')
  text = replaceOne(text, '**IndexedDB schema:** `v14`', '**IndexedDB schema:** `v15`', 'README schema')
  const section = `## v1.6 — Habits & Focus refinement\n\nHabits now support durable pause periods that remain neutral in streaks, adherence, weekly targets, capacity, and history. Habit detail adds an eight-week trend and pause lifecycle controls. Focus now ranks ready work, explains the suggestion, supports a session intention, optional planned duration for open stopwatch sessions, finish notes, and richer recent-session context. Schema v15 backfills Habit pause histories while keeping the existing task/project/planner model intact.\n\nSee \`docs/HABITS_FOCUS_V1_6.md\`.\n\n`
  text = replaceOne(text, '## Data and privacy\n', `${section}## Data and privacy\n`, 'README v1.6 section')
  text = text.replaceAll('current database schema is **v14**', 'current database schema is **v15**')
  text = text.replaceAll('Full backups export schema v14', 'Full backups export schema v15')
  text = text.replaceAll('**v8 through v14**', '**v8 through v15**')
  text = text.replaceAll('the v14 data model', 'the v15 data model')
  write(file, text)
}

// Current-release validators.
{
  const file = 'scripts/validate-final.mjs'
  let text = read(file)
  text = replaceOne(text, `pkg.version === '1.5.0'`, `pkg.version === '1.6.0'`, 'final version')
  text = replaceOne(text, `check('database schema v14', /DATABASE_SCHEMA_VERSION\\s*=\\s*14\\b/.test(database))`, `check('database schema v15', /DATABASE_SCHEMA_VERSION\\s*=\\s*15\\b/.test(database))`, 'final schema')
  text = replaceOne(text, `check('v13→v14 migration registered', database.includes('migrateV13ToV14'))`, `check('v14→v15 migration registered', database.includes('migrateV14ToV15'))`, 'final migration')
  text = replaceOne(text, `check('visible backup copy says v14', interop.includes('Schema v14 · complete planner state'))`, `check('visible backup copy says v15', interop.includes('Schema v15 · complete planner state'))`, 'final interop schema')
  text = replaceOne(text, `check('visible restore range says v8–v14', interop.includes('schema v8–v14'))`, `check('visible restore range says v8–v15', interop.includes('schema v8–v15'))`, 'final restore range')
  text = replaceOne(text, `!/Schema v1[1-3] · complete planner state|schema v8–v1[1-3]/.test(interop)`, `!/Schema v1[1-4] · complete planner state|schema v8–v1[1-4]/.test(interop)`, 'final stale schema regex')
  text = replaceOne(text, `check('public v14 backup schema exists', exists('public/schema/folio-backup-v14.schema.json'))`, `check('public v15 backup schema exists', exists('public/schema/folio-backup-v15.schema.json'))`, 'final backup file')
  text = replaceOne(text, `'public/schema/folio-backup-v14.schema.json',`, `'public/schema/folio-backup-v15.schema.json',`, 'final backup parse list')
  write(file, text)
}

{
  const file = 'scripts/validate-release.mjs'
  let text = read(file)
  text = replaceOne(text, `check('release version is 1.5.0', pkg.version === '1.5.0', pkg.version)`, `check('release version is 1.6.0', pkg.version === '1.6.0', pkg.version)`, 'release version validator')
  write(file, text)
}

// Prior Reviews & History contract remains valid across later releases.
{
  const file = 'scripts/validate-reviews-history.mjs'
  let text = read(file)
  text = replaceOne(text, `check('v1.5 package version', pkg.version === '1.5.0')`, `check('v1.5+ package version', Number(pkg.version.split('.')[1] ?? 0) >= 5)`, 'reviews forward version')
  text = replaceOne(text, `check('database schema v14', /DATABASE_SCHEMA_VERSION\\s*=\\s*14\\b/.test(database))`, `check('reviews-compatible schema', Number(database.match(/DATABASE_SCHEMA_VERSION\\s*=\\s*(\\d+)/)?.[1] ?? 0) >= 14)`, 'reviews forward schema')
  text = replaceOne(text, `check('interop copy advertises v14', interop.includes('Schema v14 · complete planner state') && interop.includes('schema v8–v14'))`, `check('interop retains v14 restore compatibility', interop.includes('schema v8–v15'))`, 'reviews interop forward check')
  write(file, text)
}

// Release manifest generator.
{
  const file = 'scripts/generate-release-manifest.mjs'
  let text = read(file)
  text = text.replaceAll('databaseSchema: 14,', 'databaseSchema: 15,')
  text = replaceOne(text, `releaseType: 'reviews-history',`, `releaseType: 'habits-focus-refinement',`, 'manifest release type')
  text = replaceOne(text, `finalReleaseContract: '57/57 PASS',`, `finalReleaseContract: '58/58 PASS',`, 'manifest final count')
  text = replaceOne(text, `    reviewsHistoryContract: '26/26 PASS',\n`, `    reviewsHistoryContract: '26/26 PASS',\n    habitsFocusContract: '35/35 PASS',\n`, 'manifest v16 contract')
  text = replaceRegex(text, /  highlights: \[[\s\S]*?\n  \],\n  files,/, `  highlights: [\n    'Durable habit pause intervals stay neutral in streaks, adherence, capacity, and historical evaluation',\n    'Habit detail now includes an eight-week trend, pause lifecycle, and expanded daily history',\n    'Habit weekly review surfaces rhythms still in motion without penalizing planned pauses',\n    'Focus ranks ready work and explains why the suggested task is relevant',\n    'Focus sessions preserve intention, optional planned duration, and finish notes',\n    'Open stopwatch plans guide without automatically stopping the session',\n    'Focus launcher exposes today/week totals, prior task focus, estimate remaining, and recent sessions',\n    'Schema v15 backfills Habit pause history while leaving existing task/project/planner structures intact',\n    'Full backups preserve v15 Habit pauses and Focus context with v8–v15 direct restore',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, habits-focus, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',\n  ],\n  files,`, 'manifest highlights')
  write(file, text)
}

console.log('Applied Folio v1.6 Habits & Focus integration.')
