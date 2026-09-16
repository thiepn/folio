import { db } from '../db/database'
import { localDateKey, localDateToDate } from '../domain/date'
import type {
  DailyPlanEntity,
  ImportBatchEntity,
  PatchSnapshot,
  ProjectEntity,
  RecurringSeriesEntity,
  TaskEntity,
} from '../domain/models'
import { importDocumentSchema } from '../features/import/importSchema'
import { buildImportAnalysis, type ImportAnalysisContext } from '../features/import/importLogic'
import type { ImportAnalysis, ImportDocumentV1 } from '../features/import/importTypes'
import { isoAtMinute } from '../features/planner/calendarLogic'
import { defaultMaterializationThrough } from '../features/recurrence/recurrenceLogic'
import { importBatchRepository } from '../repositories/importBatchRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { makeHabitEntity, makeProjectEntity, makeSeriesEntity, makeTaskEntity, makeTimeBlockEntity } from './entityFactory'
import { materializeSeriesGraph } from './recurrenceGraph'
import type { UndoableMutation } from './undo'

function snapshot(type: PatchSnapshot['type'], id: string, value: unknown): PatchSnapshot { return { type, id, value: structuredClone(value) } }
function parseRaw(raw: string | unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { throw new Error('The pasted content is not valid JSON.') }
}

async function analysisContext(): Promise<ImportAnalysisContext> {
  const [projects, tasks, habits, timeBlocks, dailyPlans, defaultCapacityMinutes] = await Promise.all([
    db.projects.toArray(), db.tasks.toArray(), db.habits.toArray(), db.timeBlocks.toArray(), db.dailyPlans.toArray(), settingsRepository.getDailyCapacityMinutes(),
  ])
  return { projects, tasks, habits, timeBlocks, dailyPlans, defaultCapacityMinutes }
}

export async function analyzeImport(raw: string | unknown): Promise<ImportAnalysis> {
  let value: unknown
  try { value = parseRaw(raw) } catch (error) {
    return { issues: [{ severity: 'error', code: 'invalid_json', message: error instanceof Error ? error.message : 'Invalid JSON.' }], counts: { projects: 0, tasks: 0, habits: 0, timeBlocks: 0, recurringSeries: 0, generatedOccurrences: 0 }, dayImpacts: [] }
  }
  const parsed = importDocumentSchema.safeParse(value)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((entry) => ({ severity: 'error' as const, code: 'schema', message: entry.message, path: entry.path.join('.') })),
      counts: { projects: 0, tasks: 0, habits: 0, timeBlocks: 0, recurringSeries: 0, generatedOccurrences: 0 }, dayImpacts: [],
    }
  }
  return buildImportAnalysis(parsed.data, await analysisContext())
}

function resolveProject(document: ImportDocumentV1, projectIds: Map<string, string>, projectRef?: string, projectId?: string) {
  if (projectRef) return projectIds.get(projectRef)
  return projectId
}

function scheduleMatches(schedule: ImportDocumentV1['habits'][number]['schedule'], date: string) {
  const weekday = localDateToDate(date).getDay()
  if (schedule.type === 'daily') return true
  if (schedule.type === 'weekdays') return weekday >= 1 && weekday <= 5
  if (schedule.type === 'selected-days') return schedule.weekdays?.includes(weekday) ?? false
  return false
}

function equalIgnoringSeriesMaterialization(a: any, b: any) {
  const clean = (value: any) => {
    if (!value || typeof value !== 'object') return value
    const copy = structuredClone(value)
    delete copy.updatedAt
    if ('materializedThrough' in copy) delete copy.materializedThrough
    return copy
  }
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b))
}

async function safeImportRevert(batch: ImportBatchEntity) {
  if (batch.status !== 'applied') throw new Error('This import is not currently applied.')
  const affected = new Map(batch.affectedEntities.map((entry) => [`${entry.type}:${entry.id}`, entry]))
  const snapshotMap = new Map(batch.createdSnapshots.map((entry) => [`${entry.type}:${entry.id}`, entry]))
  const importedTaskIds = new Set(batch.affectedEntities.filter((entry) => entry.type === 'task').map((entry) => entry.id))
  const importedProjectIds = new Set(batch.affectedEntities.filter((entry) => entry.type === 'project').map((entry) => entry.id))
  const importedSeriesIds = new Set(batch.affectedEntities.filter((entry) => entry.type === 'recurringSeries').map((entry) => entry.id))

  for (const entry of batch.affectedEntities) {
    let current: any
    if (entry.type === 'task') current = await db.tasks.get(entry.id)
    else if (entry.type === 'project') current = await db.projects.get(entry.id)
    else if (entry.type === 'habit') current = await db.habits.get(entry.id)
    else if (entry.type === 'timeBlock') current = await db.timeBlocks.get(entry.id)
    else current = await db.recurringSeries.get(entry.id)
    if (!current) continue
    const expected = snapshotMap.get(`${entry.type}:${entry.id}`)?.value
    if (!expected) continue
    const same = entry.type === 'recurringSeries' ? equalIgnoringSeriesMaterialization(current, expected) : JSON.stringify(current) === JSON.stringify(expected)
    if (!same) throw new Error(`Revert blocked: imported ${entry.type} “${entry.id}” has been changed since the import.`)
  }

  const focus = await db.focusSessions.where('taskId').anyOf([...importedTaskIds]).toArray()
  if (focus.length) throw new Error('Revert blocked: Focus time has been logged against imported tasks.')
  for (const habitId of batch.affectedEntities.filter((entry) => entry.type === 'habit').map((entry) => entry.id)) {
    if (await db.habitEntries.where('habitId').equals(habitId).count()) throw new Error('Revert blocked: an imported Habit now has history.')
  }
  for (const projectId of importedProjectIds) {
    const linked = await db.tasks.where('projectId').equals(projectId).toArray()
    if (linked.some((task) => !importedTaskIds.has(task.id))) throw new Error('Revert blocked: later tasks now use an imported Project.')
  }

  // Untouched future recurrence descendants materialized after Apply are safe to remove.
  const extraSeriesTasks: TaskEntity[] = []
  for (const seriesId of importedSeriesIds) {
    const series = await db.recurringSeries.get(seriesId)
    if (!series) continue
    const tasks = await db.tasks.where('seriesId').equals(seriesId).toArray()
    for (const task of tasks.filter((item) => !importedTaskIds.has(item.id))) {
      if (task.updatedAt !== task.createdAt || task.completedAt || task.deletedAt || task.plannedDate !== task.recurrenceDate) throw new Error('Revert blocked: a later recurring occurrence has user changes.')
      const blocks = await db.timeBlocks.where('taskId').equals(task.id).toArray()
      if (blocks.length > 1 || blocks.some((block) => block.updatedAt !== block.createdAt)) throw new Error('Revert blocked: a later recurring occurrence has calendar changes.')
      if (await db.focusSessions.where('taskId').equals(task.id).count()) throw new Error('Revert blocked: Focus time exists on a later recurring occurrence.')
      extraSeriesTasks.push(task)
    }
  }

  const taskIdsToRemove = new Set([...importedTaskIds, ...extraSeriesTasks.map((task) => task.id)])
  const extraBlocks = taskIdsToRemove.size ? await db.timeBlocks.where('taskId').anyOf([...taskIdsToRemove]).toArray() : []
  const explicitBlockIds = batch.affectedEntities.filter((entry) => entry.type === 'timeBlock').map((entry) => entry.id)

  await db.transaction('rw', [db.timeBlocks, db.dailyPlanItems, db.tasks, db.recurringSeries, db.habitEntries, db.habits, db.projects, db.dailyPlans, db.importBatches], async () => {
    await db.timeBlocks.bulkDelete([...new Set([...explicitBlockIds, ...extraBlocks.map((block) => block.id)])])
    if (taskIdsToRemove.size) {
      await db.dailyPlanItems.where('taskId').anyOf([...taskIdsToRemove]).delete()
      await db.tasks.bulkDelete([...taskIdsToRemove])
    }
    for (const seriesId of importedSeriesIds) await db.recurringSeries.delete(seriesId)
    for (const habitId of batch.affectedEntities.filter((entry) => entry.type === 'habit').map((entry) => entry.id)) await db.habits.delete(habitId)
    for (const projectId of importedProjectIds) await db.projects.delete(projectId)
    for (const prior of batch.priorDailyPlans) {
      if (prior.before) await db.dailyPlans.put(prior.before)
      else await db.dailyPlans.delete(prior.date)
    }
    const now = new Date().toISOString()
    await db.importBatches.update(batch.id, { status: 'reverted', revertedAt: now, updatedAt: now })
  })
}

export async function applyImport(raw: string | unknown, source: ImportBatchEntity['source'] = 'chatgpt'): Promise<{ batchId: string; undo: UndoableMutation }> {
  const analysis = await analyzeImport(raw)
  if (!analysis.document || analysis.issues.some((entry) => entry.severity === 'error')) throw new Error(analysis.issues.find((entry) => entry.severity === 'error')?.message ?? 'Import validation failed.')
  const document = analysis.document
  const now = new Date().toISOString()
  const projectIds = new Map<string, string>()
  const taskIds = new Map<string, string>()
  const projects = document.projects.map((item) => {
    const entity = makeProjectEntity({ name: item.name, description: item.description, type: item.type, color: item.color, icon: item.icon, favorite: item.favorite, examDate: item.examDate, weeklyTargetMinutes: item.weeklyTargetMinutes }, crypto.randomUUID(), now)
    projectIds.set(item.ref, entity.id)
    return entity
  })
  for (const item of document.tasks) taskIds.set(item.ref, crypto.randomUUID())
  const tasks = document.tasks.map((item, index) => makeTaskEntity({
    title: item.title, description: item.description, projectId: resolveProject(document, projectIds, item.projectRef, item.projectId), parentTaskId: item.parentRef ? taskIds.get(item.parentRef) : undefined,
    priority: item.priority, status: item.status, plannedDate: item.plannedDate, deadline: item.deadline, estimatedMinutes: item.estimatedMinutes,
  }, taskIds.get(item.ref)!, now, Date.now() + index))
  const habits = document.habits.map((item, index) => makeHabitEntity({ title: item.title, description: item.description, kind: item.kind, target: item.target, schedule: item.schedule, countsTowardCapacity: item.countsTowardCapacity }, crypto.randomUUID(), now, Date.now() + 10_000 + index))
  const explicitBlocks = document.timeBlocks.map((item) => {
    const taskId = item.taskRef ? taskIds.get(item.taskRef) : undefined
    const linkedTask = taskId ? tasks.find((task) => task.id === taskId) : undefined
    return makeTimeBlockEntity({ taskId, title: item.kind === 'task' ? (linkedTask?.title ?? 'Task') : item.title!, kind: item.kind, start: isoAtMinute(item.date, item.startMinute), end: isoAtMinute(item.date, item.startMinute + item.durationMinutes) }, crypto.randomUUID(), now)
  })

  const seriesGraphs = document.recurringSeries.map((item) => {
    const projectId = resolveProject(document, projectIds, item.taskTemplate.projectRef, item.taskTemplate.projectId)
    const series = makeSeriesEntity({ title: item.title, timezone: item.timezone, startDate: item.startDate, rule: item.rule, taskTemplate: { title: item.taskTemplate.title, description: item.taskTemplate.description, projectId, priority: item.taskTemplate.priority, estimatedMinutes: item.taskTemplate.estimatedMinutes, deadlineOffsetDays: item.taskTemplate.deadlineOffsetDays, startMinute: item.taskTemplate.startMinute, blockDurationMinutes: item.taskTemplate.blockDurationMinutes } }, crypto.randomUUID(), now)
    return materializeSeriesGraph(series, defaultMaterializationThrough(), now)
  })
  const series = seriesGraphs.map((graph) => graph.series)
  const occurrenceTasks = seriesGraphs.flatMap((graph) => graph.tasks)
  const occurrenceBlocks = seriesGraphs.flatMap((graph) => graph.timeBlocks)
  const allTasks = [...tasks, ...occurrenceTasks]
  const allBlocks = [...explicitBlocks, ...occurrenceBlocks]

  const affectedDates = new Set<string>([...allTasks.map((task) => task.plannedDate).filter((date): date is string => Boolean(date)), ...allBlocks.map((block) => localDateKey(new Date(block.start)))])
  const existingPlans = await db.dailyPlans.toArray()
  for (const habit of document.habits) {
    if (habit.kind !== 'duration' || !habit.countsTowardCapacity || habit.schedule.type === 'times-per-week') continue
    for (const plan of existingPlans) if (scheduleMatches(habit.schedule, plan.date)) affectedDates.add(plan.date)
  }
  const priorDailyPlans = [...affectedDates].map((date) => ({ date, before: existingPlans.find((plan) => plan.date === date) ? structuredClone(existingPlans.find((plan) => plan.date === date)!) : undefined }))

  const affectedEntities = [
    ...projects.map((item) => ({ type: 'project' as const, id: item.id })),
    ...allTasks.map((item) => ({ type: 'task' as const, id: item.id })),
    ...habits.map((item) => ({ type: 'habit' as const, id: item.id })),
    ...allBlocks.map((item) => ({ type: 'timeBlock' as const, id: item.id })),
    ...series.map((item) => ({ type: 'recurringSeries' as const, id: item.id })),
  ]
  const createdSnapshots: PatchSnapshot[] = [
    ...projects.map((item) => snapshot('project', item.id, item)), ...allTasks.map((item) => snapshot('task', item.id, item)), ...habits.map((item) => snapshot('habit', item.id, item)), ...allBlocks.map((item) => snapshot('timeBlock', item.id, item)), ...series.map((item) => snapshot('recurringSeries', item.id, item)),
  ]
  const batch: ImportBatchEntity = { id: crypto.randomUUID(), title: document.title, source, status: 'applied', affectedEntities, createdSnapshots, priorDailyPlans, createdAt: now, updatedAt: now }

  await db.transaction('rw', [db.projects, db.tasks, db.habits, db.timeBlocks, db.recurringSeries, db.dailyPlans, db.importBatches], async () => {
    if (projects.length) await db.projects.bulkAdd(projects)
    if (allTasks.length) await db.tasks.bulkAdd(allTasks)
    if (habits.length) await db.habits.bulkAdd(habits)
    if (allBlocks.length) await db.timeBlocks.bulkAdd(allBlocks)
    if (series.length) await db.recurringSeries.bulkAdd(series)
    for (const date of affectedDates) {
      const plan = await db.dailyPlans.get(date)
      if (plan?.status === 'committed') await db.dailyPlans.put({ ...plan, status: 'draft', committedAt: undefined, updatedAt: now })
    }
    await db.importBatches.add(batch)
  })

  return { batchId: batch.id, undo: { message: `Imported ${document.title}`, undo: async () => { const latest = await importBatchRepository.get(batch.id); if (latest) await safeImportRevert(latest) } } }
}

export async function revertImport(batchId: string): Promise<void> {
  const batch = await importBatchRepository.get(batchId)
  if (!batch) throw new Error('Import batch not found.')
  await safeImportRevert(batch)
}

export async function listImportHistory() { return importBatchRepository.list() }
