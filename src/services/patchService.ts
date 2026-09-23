import { db } from '../db/database'
import { addLocalDays, atTimeInZone, dateKeyInTimeZone, localDateKey } from '../domain/date'
import type {
  DailyPlanEntity,
  DailyPlanItemEntity,
  HabitEntity,
  PatchBatchEntity,
  PatchSnapshot,
  ProjectEntity,
  RecurringSeriesEntity,
  TaskEntity,
  TimeBlockEntity,
} from '../domain/models'
import { buildPatchInstructions } from '../features/patch/patchInstructions'
import { buildPatchAnalysis, type PatchAnalysisContext } from '../features/patch/patchLogic'
import { patchDocumentSchema } from '../features/patch/patchSchema'
import type { PatchAnalysis, PatchDocumentV1, PatchOperationV1 } from '../features/patch/patchTypes'
import { durationMinutes, isoAtMinute, localDateFromIso, minuteOfDayFromIso } from '../features/planner/calendarLogic'
import { calendarOccurrenceDates, defaultMaterializationThrough } from '../features/recurrence/recurrenceLogic'
import { patchBatchRepository } from '../repositories/patchBatchRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { makeHabitEntity, makeProjectEntity, makeSeriesEntity, makeTaskEntity, makeTimeBlockEntity } from './entityFactory'
import { materializeSeriesGraph } from './recurrenceGraph'
import type { UndoableMutation } from './undo'

type SnapshotType = PatchSnapshot['type']
interface Workspace {
  projects: Map<string, ProjectEntity>
  tasks: Map<string, TaskEntity>
  habits: Map<string, HabitEntity>
  timeBlocks: Map<string, TimeBlockEntity>
  recurringSeries: Map<string, RecurringSeriesEntity>
  dailyPlans: Map<string, DailyPlanEntity>
  dailyPlanItems: Map<string, DailyPlanItemEntity>
}

function parseRaw(raw: string | unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { throw new Error('The pasted content is not valid JSON.') }
}

async function analysisContext(): Promise<PatchAnalysisContext> {
  const [projects, tasks, habits, timeBlocks, recurringSeries, dailyPlans, focusSessions, habitEntries, defaultCapacityMinutes] = await Promise.all([
    db.projects.toArray(), db.tasks.toArray(), db.habits.toArray(), db.timeBlocks.toArray(), db.recurringSeries.toArray(), db.dailyPlans.toArray(), db.focusSessions.toArray(), db.habitEntries.toArray(), settingsRepository.getDailyCapacityMinutes(),
  ])
  const focusByTask = new Map<string, number>()
  for (const session of focusSessions) if (session.taskId) focusByTask.set(session.taskId, (focusByTask.get(session.taskId) ?? 0) + 1)
  const habitEntryCounts = new Map<string, number>()
  for (const entry of habitEntries) habitEntryCounts.set(entry.habitId, (habitEntryCounts.get(entry.habitId) ?? 0) + 1)
  return { projects, tasks, habits, timeBlocks, recurringSeries, dailyPlans, defaultCapacityMinutes, focusByTask, habitEntryCounts }
}

export async function analyzePatch(raw: string | unknown): Promise<PatchAnalysis> {
  let value: unknown
  try { value = parseRaw(raw) } catch (error) {
    return { issues: [{ severity: 'error', code: 'invalid_json', message: error instanceof Error ? error.message : 'Invalid JSON.' }], diffs: [], destructiveCount: 0, dayImpacts: [] }
  }
  const parsed = patchDocumentSchema.safeParse(value)
  if (!parsed.success) return { issues: parsed.error.issues.map((entry) => ({ severity: 'error' as const, code: 'schema', message: entry.message })), diffs: [], destructiveCount: 0, dayImpacts: [] }
  return buildPatchAnalysis(parsed.data, await analysisContext())
}

function snapshot(type: SnapshotType, id: string, value: unknown): PatchSnapshot { return { type, id, value: structuredClone(value) } }
function key(type: SnapshotType, id: string) { return `${type}:${id}` }

function mapFor(workspace: Workspace, type: SnapshotType): Map<string, any> {
  if (type === 'project') return workspace.projects
  if (type === 'task') return workspace.tasks
  if (type === 'habit') return workspace.habits
  if (type === 'timeBlock') return workspace.timeBlocks
  if (type === 'recurringSeries') return workspace.recurringSeries
  if (type === 'dailyPlan') return workspace.dailyPlans
  return workspace.dailyPlanItems
}

function resolveProject(projectIds: Map<string, string>, projectRef?: string, projectId?: string | null) {
  if (projectRef) return projectIds.get(projectRef)
  return projectId ?? undefined
}

function scheduleMatches(schedule: HabitEntity['schedule'], date: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay()
  if (schedule.type === 'daily') return true
  if (schedule.type === 'weekdays') return weekday >= 1 && weekday <= 5
  if (schedule.type === 'selected-days') return schedule.weekdays?.includes(weekday) ?? false
  return false
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function freshChecklist(items: string[], now: string) {
  return items.map((text, index) => ({ id: crypto.randomUUID(), text, completed: false, sortOrder: index, createdAt: now, updatedAt: now }))
}

function reconcileChecklist(current: TaskEntity['checklist'], desired: string[], now: string) {
  const currentText = current.map((item) => item.text)
  return JSON.stringify(currentText) === JSON.stringify(desired) ? current : freshChecklist(desired, now)
}

function expectedSeriesFields(series: RecurringSeriesEntity, date: string) {
  const exception = series.exceptions[date] ?? {}
  const template = series.taskTemplate
  const defaultDeadline = template.deadlineOffsetDays === undefined ? undefined : addLocalDays(date, template.deadlineOffsetDays)
  return {
    title: exception.title ?? template.title,
    description: exception.description ?? template.description,
    projectId: hasOwn(exception, 'projectId') ? (exception.projectId ?? undefined) : template.projectId,
    priority: exception.priority ?? template.priority,
    estimatedMinutes: hasOwn(exception, 'estimatedMinutes') ? (exception.estimatedMinutes ?? undefined) : template.estimatedMinutes,
    tags: exception.tags ?? template.tags ?? [],
    checklist: exception.checklist ?? template.checklist ?? [],
    sourceUrl: hasOwn(exception, 'sourceUrl') ? (exception.sourceUrl ?? undefined) : template.sourceUrl,
    location: hasOwn(exception, 'location') ? (exception.location ?? undefined) : template.location,
    pinned: exception.pinned ?? template.pinned ?? false,
    plannedDate: hasOwn(exception, 'plannedDate') ? (exception.plannedDate ?? undefined) : date,
    deadline: hasOwn(exception, 'deadline') ? (exception.deadline ?? undefined) : defaultDeadline,
    startMinute: exception.startMinute ?? template.startMinute,
    blockDurationMinutes: exception.blockDurationMinutes ?? template.blockDurationMinutes ?? (hasOwn(exception, 'estimatedMinutes') ? (exception.estimatedMinutes ?? undefined) : template.estimatedMinutes),
    skip: Boolean(exception.skip),
  }
}

function cleanNullableTemplate(current: RecurringSeriesEntity['taskTemplate'], changes: any, projectIds: Map<string, string>) {
  if (!changes) return current
  const next: any = { ...current }
  for (const field of ['title','description','priority','tags','checklist','pinned'] as const) if (Object.prototype.hasOwnProperty.call(changes, field)) next[field] = changes[field]
  for (const field of ['estimatedMinutes','sourceUrl','location','deadlineOffsetDays','startMinute','blockDurationMinutes'] as const) if (Object.prototype.hasOwnProperty.call(changes, field)) next[field] = changes[field] ?? undefined
  if (changes.projectRef) next.projectId = projectIds.get(changes.projectRef)
  else if (Object.prototype.hasOwnProperty.call(changes, 'projectId')) next.projectId = changes.projectId ?? undefined
  return next
}

async function loadWorkspace(): Promise<Workspace> {
  const [projects, tasks, habits, timeBlocks, recurringSeries, dailyPlans, dailyPlanItems] = await Promise.all([
    db.projects.toArray(), db.tasks.toArray(), db.habits.toArray(), db.timeBlocks.toArray(), db.recurringSeries.toArray(), db.dailyPlans.toArray(), db.dailyPlanItems.toArray(),
  ])
  return {
    projects: new Map(projects.map((item) => [item.id, structuredClone(item)])),
    tasks: new Map(tasks.map((item) => [item.id, structuredClone(item)])),
    habits: new Map(habits.map((item) => [item.id, structuredClone(item)])),
    timeBlocks: new Map(timeBlocks.map((item) => [item.id, structuredClone(item)])),
    recurringSeries: new Map(recurringSeries.map((item) => [item.id, structuredClone(item)])),
    dailyPlans: new Map(dailyPlans.map((item) => [item.date, structuredClone(item)])),
    dailyPlanItems: new Map(dailyPlanItems.map((item) => [item.id, structuredClone(item)])),
  }
}

function touchFactory(workspace: Workspace) {
  const touched = new Set<string>()
  const beforeSnapshots: PatchSnapshot[] = []
  function touch(type: SnapshotType, id: string) {
    const targetKey = key(type, id)
    if (touched.has(targetKey)) return
    touched.add(targetKey)
    const current = mapFor(workspace, type).get(id)
    if (current !== undefined) beforeSnapshots.push(snapshot(type, id, current))
  }
  return { touched, beforeSnapshots, touch }
}

function markPlanDraft(workspace: Workspace, touch: (type: SnapshotType, id: string) => void, date: string | undefined, now: string) {
  if (!date) return
  const plan = workspace.dailyPlans.get(date)
  if (!plan || plan.status !== 'committed') return
  touch('dailyPlan', date)
  workspace.dailyPlans.set(date, { ...plan, status: 'draft', committedAt: undefined, updatedAt: now })
}

function moveDailyPlanItem(workspace: Workspace, touch: (type: SnapshotType, id: string) => void, taskId: string, oldDate: string | undefined, newDate: string | undefined, now: string) {
  if (!oldDate || oldDate === newDate) return
  const oldId = `${oldDate}:${taskId}`
  const old = workspace.dailyPlanItems.get(oldId)
  if (!old) return
  touch('dailyPlanItem', oldId)
  workspace.dailyPlanItems.delete(oldId)
  if (newDate) {
    const newId = `${newDate}:${taskId}`
    touch('dailyPlanItem', newId)
    workspace.dailyPlanItems.set(newId, { ...old, id: newId, date: newDate, updatedAt: now })
  }
}

function upsertSeriesOccurrence(workspace: Workspace, touch: (type: SnapshotType, id: string) => void, series: RecurringSeriesEntity, date: string, now: string) {
  const fields = expectedSeriesFields(series, date)
  const existing = [...workspace.tasks.values()].find((task) => task.seriesId === series.id && task.recurrenceDate === date)
  if (fields.skip) {
    if (existing && existing.status !== 'completed') { touch('task', existing.id); workspace.tasks.set(existing.id, { ...existing, status: 'cancelled', updatedAt: now }) }
    return
  }
  let task = existing
  if (!task) {
    task = makeTaskEntity({
      title: fields.title,
      description: fields.description,
      projectId: fields.projectId,
      priority: fields.priority,
      status: 'todo',
      plannedDate: fields.plannedDate,
      deadline: fields.deadline,
      estimatedMinutes: fields.estimatedMinutes,
      tags: fields.tags,
      checklist: freshChecklist(fields.checklist, now),
      sourceUrl: fields.sourceUrl,
      location: fields.location,
      pinned: fields.pinned,
      seriesId: series.id,
      recurrenceDate: date,
    }, crypto.randomUUID(), now, Date.now())
    touch('task', task.id)
    workspace.tasks.set(task.id, task)
  } else if (task.status !== 'completed') {
    touch('task', task.id)
    markPlanDraft(workspace, touch, task.plannedDate, now)
    markPlanDraft(workspace, touch, fields.plannedDate, now)
    moveDailyPlanItem(workspace, touch, task.id, task.plannedDate, fields.plannedDate, now)
    task = {
      ...task,
      title: fields.title,
      description: fields.description,
      projectId: fields.projectId,
      priority: fields.priority,
      estimatedMinutes: fields.estimatedMinutes,
      tags: fields.tags,
      checklist: reconcileChecklist(task.checklist ?? [], fields.checklist, now),
      sourceUrl: fields.sourceUrl,
      location: fields.location,
      pinned: fields.pinned,
      plannedDate: fields.plannedDate,
      deadline: fields.deadline,
      status: 'todo',
      updatedAt: now,
    }
    workspace.tasks.set(task.id, task)
  }
  if (task.status === 'completed') return
  const taskBlocks = [...workspace.timeBlocks.values()].filter((block) => block.taskId === task!.id)
  for (const block of taskBlocks) { touch('timeBlock', block.id); workspace.timeBlocks.delete(block.id) }
  if (fields.startMinute !== undefined && fields.blockDurationMinutes && fields.plannedDate) {
    const start = atTimeInZone(fields.plannedDate, fields.startMinute, series.timezone)
    const block = makeTimeBlockEntity({
      taskId: task.id,
      title: task.title,
      kind: 'task',
      start,
      end: new Date(new Date(start).getTime() + fields.blockDurationMinutes * 60_000).toISOString(),
    }, crypto.randomUUID(), now)
    touch('timeBlock', block.id)
    workspace.timeBlocks.set(block.id, block)
  }
  markPlanDraft(workspace, touch, fields.plannedDate, now)
}

function reconcileSeries(workspace: Workspace, touch: (type: SnapshotType, id: string) => void, series: RecurringSeriesEntity, structural: boolean, now: string) {
  const today = dateKeyInTimeZone(new Date(), series.timezone)
  const occurrences = [...workspace.tasks.values()].filter((task) => task.seriesId === series.id)
  if (series.status !== 'active') {
    for (const task of occurrences) if (task.status !== 'completed' && (task.recurrenceDate ?? '') >= today) {
      touch('task', task.id)
      markPlanDraft(workspace, touch, task.plannedDate, now)
      workspace.tasks.set(task.id, { ...task, status: 'cancelled', updatedAt: now })
    }
    return
  }

  if (series.rule.frequency === 'after-completion') {
    const open = occurrences.filter((task) => task.status !== 'completed' && !task.deletedAt).sort((a, b) => (a.recurrenceDate ?? '').localeCompare(b.recurrenceDate ?? ''))
    if (!open.length) upsertSeriesOccurrence(workspace, touch, series, series.startDate, now)
    else if (structural) for (const task of open) if (task.recurrenceDate) upsertSeriesOccurrence(workspace, touch, series, task.recurrenceDate, now)
    else for (const task of open) if (task.status === 'cancelled' && !series.exceptions[task.recurrenceDate ?? '']?.skip) { touch('task', task.id); workspace.tasks.set(task.id, { ...task, status: 'todo', updatedAt: now }) }
    return
  }

  const through = series.materializedThrough ?? defaultMaterializationThrough(today)
  const dates = calendarOccurrenceDates({ ...series, status: 'active' }, through)
  const allowed = new Set(dates)
  for (const task of occurrences) {
    if (task.status === 'completed' || !task.recurrenceDate || task.recurrenceDate < today) continue
    if (!allowed.has(task.recurrenceDate) || series.exceptions[task.recurrenceDate]?.skip) {
      if (task.status !== 'cancelled') { touch('task', task.id); markPlanDraft(workspace, touch, task.plannedDate, now); workspace.tasks.set(task.id, { ...task, status: 'cancelled', updatedAt: now }) }
    } else if (structural) upsertSeriesOccurrence(workspace, touch, series, task.recurrenceDate, now)
    else if (task.status === 'cancelled') { touch('task', task.id); workspace.tasks.set(task.id, { ...task, status: 'todo', updatedAt: now }) }
  }
  for (const date of dates.filter((date) => date >= today)) if (!occurrences.some((task) => task.recurrenceDate === date)) upsertSeriesOccurrence(workspace, touch, series, date, now)
  series.materializedThrough = through
}

async function writeTouched(workspace: Workspace, touched: Set<string>) {
  for (const targetKey of touched) {
    const split = targetKey.indexOf(':')
    const type = targetKey.slice(0, split) as SnapshotType
    const id = targetKey.slice(split + 1)
    const value = mapFor(workspace, type).get(id)
    if (type === 'project') value ? await db.projects.put(value) : await db.projects.delete(id)
    else if (type === 'task') value ? await db.tasks.put(value) : await db.tasks.delete(id)
    else if (type === 'habit') value ? await db.habits.put(value) : await db.habits.delete(id)
    else if (type === 'timeBlock') value ? await db.timeBlocks.put(value) : await db.timeBlocks.delete(id)
    else if (type === 'recurringSeries') value ? await db.recurringSeries.put(value) : await db.recurringSeries.delete(id)
    else if (type === 'dailyPlan') value ? await db.dailyPlans.put(value) : await db.dailyPlans.delete(id)
    else value ? await db.dailyPlanItems.put(value) : await db.dailyPlanItems.delete(id)
  }
}

function currentValue(workspace: Workspace, type: SnapshotType, id: string) { return mapFor(workspace, type).get(id) }

export async function applyPatch(raw: string | unknown, options: { source?: PatchBatchEntity['source']; confirmDestructive?: boolean } = {}): Promise<{ batchId: string; undo: UndoableMutation }> {
  const analysis = await analyzePatch(raw)
  if (!analysis.document || analysis.issues.some((entry) => entry.severity === 'error')) throw new Error(analysis.issues.find((entry) => entry.severity === 'error')?.message ?? 'Patch validation failed.')
  if (analysis.destructiveCount && !options.confirmDestructive) throw new Error('This patch contains DELETE operations. Confirm destructive changes before Apply.')
  const document = analysis.document
  const now = new Date().toISOString()
  let createdBatchId = ''

  await db.transaction('rw', [db.projects, db.tasks, db.habits, db.timeBlocks, db.recurringSeries, db.dailyPlans, db.dailyPlanItems, db.patchBatches], async () => {
    // Optimistic concurrency is rechecked inside the write transaction, not only during Preview.
    for (const op of document.operations) if (op.op !== 'create') {
      const current = op.entity === 'project' ? await db.projects.get(op.id) : op.entity === 'task' ? await db.tasks.get(op.id) : op.entity === 'habit' ? await db.habits.get(op.id) : op.entity === 'timeBlock' ? await db.timeBlocks.get(op.id) : await db.recurringSeries.get(op.id)
      if (!current || current.updatedAt !== op.ifUpdatedAt) throw new Error(`Patch is stale: ${op.entity} “${op.id}” changed after Preview.`)
    }

    const workspace = await loadWorkspace()
    const { touched, beforeSnapshots, touch } = touchFactory(workspace)
    const createProjectIds = new Map<string, string>()
    const createTaskIds = new Map<string, string>()
    for (const op of document.operations) if (op.op === 'create') {
      if (op.entity === 'project') createProjectIds.set(op.value.ref, crypto.randomUUID())
      if (op.entity === 'task') createTaskIds.set(op.value.ref, crypto.randomUUID())
    }

    const operationSummaries: PatchBatchEntity['operations'] = []

    for (let index = 0; index < document.operations.length; index += 1) {
      const op = document.operations[index]
      if (op.op === 'create') {
        if (op.entity === 'project') {
          const value = op.value
          const entity = makeProjectEntity({ name: value.name, description: value.description, type: value.type, color: value.color, icon: value.icon, favorite: value.favorite, examDate: value.examDate, weeklyTargetMinutes: value.weeklyTargetMinutes }, createProjectIds.get(value.ref)!, now)
          touch('project', entity.id); workspace.projects.set(entity.id, entity)
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'create', entity: 'project', targetId: entity.id, label: entity.name })
        } else if (op.entity === 'task') {
          const value: any = op.value
          const projectId = resolveProject(createProjectIds, value.projectRef, value.projectId)
          const parentTaskId = value.parentRef ? createTaskIds.get(value.parentRef) : value.parentId
          const entity = makeTaskEntity({ title: value.title, description: value.description, projectId, parentTaskId, priority: value.priority, status: value.status, plannedDate: value.plannedDate, deadline: value.deadline, estimatedMinutes: value.estimatedMinutes }, createTaskIds.get(value.ref)!, now, Date.now() + index)
          touch('task', entity.id); workspace.tasks.set(entity.id, entity); markPlanDraft(workspace, touch, entity.plannedDate, now)
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'create', entity: 'task', targetId: entity.id, label: entity.title })
        } else if (op.entity === 'habit') {
          const value = op.value
          const entity = makeHabitEntity({ title: value.title, description: value.description, kind: value.kind, target: value.target, schedule: value.schedule, countsTowardCapacity: value.countsTowardCapacity }, crypto.randomUUID(), now, Date.now() + index)
          touch('habit', entity.id); workspace.habits.set(entity.id, entity)
          if (entity.kind === 'duration' && entity.countsTowardCapacity && entity.schedule.type !== 'times-per-week') for (const plan of workspace.dailyPlans.values()) if (plan.status === 'committed' && scheduleMatches(entity.schedule, plan.date)) markPlanDraft(workspace, touch, plan.date, now)
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'create', entity: 'habit', targetId: entity.id, label: entity.title })
        } else if (op.entity === 'timeBlock') {
          const value: any = op.value
          const taskId = value.taskRef ? createTaskIds.get(value.taskRef) : value.taskId
          const linked = taskId ? workspace.tasks.get(taskId) : undefined
          const entity = makeTimeBlockEntity({ taskId, title: value.kind === 'task' ? linked!.title : value.title, kind: value.kind, start: isoAtMinute(value.date, value.startMinute), end: isoAtMinute(value.date, value.startMinute + value.durationMinutes) }, crypto.randomUUID(), now)
          touch('timeBlock', entity.id); workspace.timeBlocks.set(entity.id, entity); markPlanDraft(workspace, touch, value.date, now)
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'create', entity: 'timeBlock', targetId: entity.id, label: entity.title })
        } else {
          const value = op.value
          const projectId = resolveProject(createProjectIds, value.taskTemplate.projectRef, value.taskTemplate.projectId)
          const series = makeSeriesEntity({
            title: value.title,
            timezone: value.timezone,
            startDate: value.startDate,
            rule: value.rule,
            taskTemplate: {
              title: value.taskTemplate.title,
              description: value.taskTemplate.description,
              projectId,
              priority: value.taskTemplate.priority,
              estimatedMinutes: value.taskTemplate.estimatedMinutes,
              tags: value.taskTemplate.tags,
              checklist: value.taskTemplate.checklist,
              sourceUrl: value.taskTemplate.sourceUrl,
              location: value.taskTemplate.location,
              pinned: value.taskTemplate.pinned,
              deadlineOffsetDays: value.taskTemplate.deadlineOffsetDays,
              startMinute: value.taskTemplate.startMinute,
              blockDurationMinutes: value.taskTemplate.blockDurationMinutes,
            },
          }, crypto.randomUUID(), now)
          const graph = materializeSeriesGraph(series, defaultMaterializationThrough(dateKeyInTimeZone(new Date(), series.timezone)), now)
          touch('recurringSeries', graph.series.id); workspace.recurringSeries.set(graph.series.id, graph.series)
          for (const task of graph.tasks) { touch('task', task.id); workspace.tasks.set(task.id, task); markPlanDraft(workspace, touch, task.plannedDate, now) }
          for (const block of graph.timeBlocks) { touch('timeBlock', block.id); workspace.timeBlocks.set(block.id, block) }
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'create', entity: 'recurringSeries', targetId: graph.series.id, label: graph.series.title })
        }
        continue
      }

      if (op.op === 'delete') {
        if (op.entity === 'project') {
          const current = workspace.projects.get(op.id)!; touch('project', op.id); workspace.projects.set(op.id, { ...current, archived: true, archivedAt: current.archivedAt ?? now, favorite: false, updatedAt: now }); operationSummaries.push({ operationId: `op-${index + 1}`, op: 'delete', entity: 'project', targetId: op.id, label: current.name })
        } else if (op.entity === 'task') {
          const current = workspace.tasks.get(op.id)!; const related = [current, ...[...workspace.tasks.values()].filter((task) => task.parentTaskId === op.id && !task.deletedAt)]
          for (const task of related) { touch('task', task.id); workspace.tasks.set(task.id, { ...task, deletedAt: now, updatedAt: now }); markPlanDraft(workspace, touch, task.plannedDate, now) }
          operationSummaries.push({ operationId: `op-${index + 1}`, op: 'delete', entity: 'task', targetId: op.id, label: current.title })
        } else if (op.entity === 'habit') {
          const current = workspace.habits.get(op.id)!; touch('habit', op.id); workspace.habits.set(op.id, { ...current, archived: true, archivedAt: current.archivedAt ?? now, updatedAt: now }); if (current.kind === 'duration' && current.countsTowardCapacity) for (const plan of workspace.dailyPlans.values()) if (plan.status === 'committed' && scheduleMatches(current.schedule, plan.date)) markPlanDraft(workspace, touch, plan.date, now); operationSummaries.push({ operationId: `op-${index + 1}`, op: 'delete', entity: 'habit', targetId: op.id, label: current.title })
        } else if (op.entity === 'timeBlock') {
          const current = workspace.timeBlocks.get(op.id)!; touch('timeBlock', op.id); workspace.timeBlocks.delete(op.id); markPlanDraft(workspace, touch, localDateFromIso(current.start), now); operationSummaries.push({ operationId: `op-${index + 1}`, op: 'delete', entity: 'timeBlock', targetId: op.id, label: current.title })
        } else {
          const current = workspace.recurringSeries.get(op.id)!; touch('recurringSeries', op.id); const next = { ...current, status: 'archived' as const, updatedAt: now }; workspace.recurringSeries.set(op.id, next); reconcileSeries(workspace, touch, next, false, now); operationSummaries.push({ operationId: `op-${index + 1}`, op: 'delete', entity: 'recurringSeries', targetId: op.id, label: current.title })
        }
        continue
      }

      if (op.entity === 'project') {
        const current = workspace.projects.get(op.id)!; const changes: any = op.changes; touch('project', op.id)
        const nextType = changes.type ?? current.type
        const next: ProjectEntity = { ...current, ...changes, color: Object.prototype.hasOwnProperty.call(changes, 'color') ? (changes.color ?? undefined) : current.color, icon: Object.prototype.hasOwnProperty.call(changes, 'icon') ? (changes.icon ?? undefined) : current.icon, examDate: nextType === 'academic' ? (Object.prototype.hasOwnProperty.call(changes, 'examDate') ? (changes.examDate ?? undefined) : current.examDate) : undefined, weeklyTargetMinutes: nextType === 'academic' ? (Object.prototype.hasOwnProperty.call(changes, 'weeklyTargetMinutes') ? (changes.weeklyTargetMinutes ?? undefined) : current.weeklyTargetMinutes) : undefined, updatedAt: now }
        workspace.projects.set(op.id, next); operationSummaries.push({ operationId: `op-${index + 1}`, op: 'update', entity: 'project', targetId: op.id, label: current.name })
      } else if (op.entity === 'task') {
        const current = workspace.tasks.get(op.id)!; const changes: any = op.changes; touch('task', op.id)
        const nextStatus = changes.status ?? current.status
        const projectId = changes.projectRef ? createProjectIds.get(changes.projectRef) : Object.prototype.hasOwnProperty.call(changes, 'projectId') ? (changes.projectId ?? undefined) : current.projectId
        const plannedDate = nextStatus === 'inbox' ? undefined : Object.prototype.hasOwnProperty.call(changes, 'plannedDate') ? (changes.plannedDate ?? undefined) : current.plannedDate
        const next: TaskEntity = {
          ...current,
          title: changes.title ?? current.title,
          description: changes.description ?? current.description,
          projectId: nextStatus === 'inbox' ? undefined : projectId,
          priority: changes.priority ?? current.priority,
          status: nextStatus,
          lastOpenStatus: nextStatus === 'inbox' || nextStatus === 'todo' ? nextStatus : current.lastOpenStatus,
          plannedDate,
          deadline: Object.prototype.hasOwnProperty.call(changes, 'deadline') ? (changes.deadline ?? undefined) : current.deadline,
          estimatedMinutes: Object.prototype.hasOwnProperty.call(changes, 'estimatedMinutes') ? (changes.estimatedMinutes ?? undefined) : current.estimatedMinutes,
          blockedByTaskIds: current.blockedByTaskIds ?? [],
          rescheduleCount: current.rescheduleCount + (plannedDate !== current.plannedDate && current.plannedDate ? 1 : 0),
          updatedAt: now,
        }
        workspace.tasks.set(op.id, next)
        const planningChanged = plannedDate !== current.plannedDate || next.priority !== current.priority || next.deadline !== current.deadline || next.estimatedMinutes !== current.estimatedMinutes || next.status !== current.status
        if (planningChanged) { markPlanDraft(workspace, touch, current.plannedDate, now); markPlanDraft(workspace, touch, plannedDate, now) }
        moveDailyPlanItem(workspace, touch, current.id, current.plannedDate, plannedDate, now)
        operationSummaries.push({ operationId: `op-${index + 1}`, op: 'update', entity: 'task', targetId: op.id, label: current.title })
      } else if (op.entity === 'habit') {
        const current = workspace.habits.get(op.id)!; const changes: any = op.changes; touch('habit', op.id)
        const nextKind = changes.kind ?? current.kind
        const next: HabitEntity = { ...current, ...changes, target: nextKind === 'check' ? 1 : (changes.target ?? current.target), countsTowardCapacity: nextKind === 'duration' ? (changes.countsTowardCapacity ?? current.countsTowardCapacity) : false, updatedAt: now }
        workspace.habits.set(op.id, next)
        if ((current.kind === 'duration' && current.countsTowardCapacity) || (next.kind === 'duration' && next.countsTowardCapacity)) for (const plan of workspace.dailyPlans.values()) if (plan.status === 'committed' && (scheduleMatches(current.schedule, plan.date) || scheduleMatches(next.schedule, plan.date))) markPlanDraft(workspace, touch, plan.date, now)
        operationSummaries.push({ operationId: `op-${index + 1}`, op: 'update', entity: 'habit', targetId: op.id, label: current.title })
      } else if (op.entity === 'timeBlock') {
        const current = workspace.timeBlocks.get(op.id)!; const changes: any = op.changes; touch('timeBlock', op.id)
        const oldDate = localDateFromIso(current.start); const date = changes.date ?? oldDate; const startMinute = changes.startMinute ?? minuteOfDayFromIso(current.start); const duration = changes.durationMinutes ?? durationMinutes(current.start, current.end)
        const next = { ...current, title: changes.title ?? current.title, start: isoAtMinute(date, startMinute), end: isoAtMinute(date, startMinute + duration), updatedAt: now }
        workspace.timeBlocks.set(op.id, next); markPlanDraft(workspace, touch, oldDate, now); markPlanDraft(workspace, touch, date, now)
        operationSummaries.push({ operationId: `op-${index + 1}`, op: 'update', entity: 'timeBlock', targetId: op.id, label: current.title })
      } else {
        const current = workspace.recurringSeries.get(op.id)!; const changes: any = op.changes; touch('recurringSeries', op.id)
        const structural = Boolean(changes.startDate || changes.rule || changes.taskTemplate)
        const next: RecurringSeriesEntity = { ...current, title: changes.title ?? current.title, status: changes.status ?? current.status, startDate: changes.startDate ?? current.startDate, rule: changes.rule ?? current.rule, taskTemplate: cleanNullableTemplate(current.taskTemplate, changes.taskTemplate, createProjectIds), updatedAt: now }
        workspace.recurringSeries.set(op.id, next); reconcileSeries(workspace, touch, next, structural || Boolean(changes.status), now)
        operationSummaries.push({ operationId: `op-${index + 1}`, op: 'update', entity: 'recurringSeries', targetId: op.id, label: current.title })
      }
    }

    const afterSnapshots: PatchSnapshot[] = []
    for (const touchedKey of touched) {
      const split = touchedKey.indexOf(':'); const type = touchedKey.slice(0, split) as SnapshotType; const id = touchedKey.slice(split + 1); const value = currentValue(workspace, type, id)
      if (value !== undefined) afterSnapshots.push(snapshot(type, id, value))
    }
    const batch: PatchBatchEntity = { id: crypto.randomUUID(), title: document.title, source: options.source ?? 'chatgpt', status: 'applied', operations: operationSummaries, beforeSnapshots, afterSnapshots, createdAt: now, updatedAt: now }
    await writeTouched(workspace, touched)
    await db.patchBatches.add(batch)
    createdBatchId = batch.id
  })

  return { batchId: createdBatchId, undo: { message: `Applied patch: ${document.title}`, undo: async () => revertPatch(createdBatchId) } }
}

function cleanForComparison(type: SnapshotType, value: any) {
  if (!value || typeof value !== 'object') return value
  const copy = structuredClone(value)
  if (type === 'recurringSeries') { delete copy.updatedAt; delete copy.materializedThrough }
  return copy
}
function equalSnapshot(type: SnapshotType, a: any, b: any) { return JSON.stringify(cleanForComparison(type, a)) === JSON.stringify(cleanForComparison(type, b)) }

async function getCurrent(type: SnapshotType, id: string): Promise<any> {
  if (type === 'project') return db.projects.get(id)
  if (type === 'task') return db.tasks.get(id)
  if (type === 'habit') return db.habits.get(id)
  if (type === 'timeBlock') return db.timeBlocks.get(id)
  if (type === 'recurringSeries') return db.recurringSeries.get(id)
  if (type === 'dailyPlan') return db.dailyPlans.get(id)
  return db.dailyPlanItems.get(id)
}

async function putSnapshot(entry: PatchSnapshot) {
  const value: any = structuredClone(entry.value)
  if (entry.type === 'project') await db.projects.put(value)
  else if (entry.type === 'task') await db.tasks.put(value)
  else if (entry.type === 'habit') await db.habits.put(value)
  else if (entry.type === 'timeBlock') await db.timeBlocks.put(value)
  else if (entry.type === 'recurringSeries') await db.recurringSeries.put(value)
  else if (entry.type === 'dailyPlan') await db.dailyPlans.put(value)
  else await db.dailyPlanItems.put(value)
}
async function deleteSnapshotKey(type: SnapshotType, id: string) {
  if (type === 'project') await db.projects.delete(id)
  else if (type === 'task') await db.tasks.delete(id)
  else if (type === 'habit') await db.habits.delete(id)
  else if (type === 'timeBlock') await db.timeBlocks.delete(id)
  else if (type === 'recurringSeries') await db.recurringSeries.delete(id)
  else if (type === 'dailyPlan') await db.dailyPlans.delete(id)
  else await db.dailyPlanItems.delete(id)
}

export async function revertPatch(batchId: string): Promise<void> {
  const batch = await patchBatchRepository.get(batchId)
  if (!batch) throw new Error('Patch batch not found.')
  if (batch.status !== 'applied') throw new Error('This patch is not currently applied.')
  const before = new Map(batch.beforeSnapshots.map((entry) => [key(entry.type, entry.id), entry]))
  const after = new Map(batch.afterSnapshots.map((entry) => [key(entry.type, entry.id), entry]))
  const keys = new Set([...before.keys(), ...after.keys()])

  // Allow untouched recurrence materialization that happened after Apply, but block any user-edited descendant.
  const extraSeriesTaskIds = new Set<string>()
  const extraSeriesBlockIds = new Set<string>()
  const seriesIds = batch.afterSnapshots.filter((entry) => entry.type === 'recurringSeries').map((entry) => entry.id)
  const expectedTaskIds = new Set(batch.afterSnapshots.filter((entry) => entry.type === 'task').map((entry) => entry.id))
  const expectedBlockIds = new Set(batch.afterSnapshots.filter((entry) => entry.type === 'timeBlock').map((entry) => entry.id))
  for (const seriesId of seriesIds) {
    const currentTasks = await db.tasks.where('seriesId').equals(seriesId).toArray()
    for (const task of currentTasks.filter((item) => !expectedTaskIds.has(item.id))) {
      if (task.updatedAt !== task.createdAt || task.completedAt || task.deletedAt || task.plannedDate !== task.recurrenceDate) throw new Error('Revert blocked: a recurrence descendant created after the patch has user changes.')
      if (await db.focusSessions.where('taskId').equals(task.id).count()) throw new Error('Revert blocked: Focus time exists on a recurrence descendant created after the patch.')
      const blocks = await db.timeBlocks.where('taskId').equals(task.id).toArray()
      if (blocks.some((block) => block.updatedAt !== block.createdAt)) throw new Error('Revert blocked: a recurrence descendant has calendar edits.')
      extraSeriesTaskIds.add(task.id); for (const block of blocks) extraSeriesBlockIds.add(block.id)
    }
  }

  for (const targetKey of keys) {
    const split = targetKey.indexOf(':'); const type = targetKey.slice(0, split) as SnapshotType; const id = targetKey.slice(split + 1)
    const expected = after.get(targetKey)
    const current = await getCurrent(type, id)
    if (expected) {
      if (!current || !equalSnapshot(type, current, expected.value)) throw new Error(`Revert blocked: ${type} “${id}” changed after the patch.`)
    } else if (current) throw new Error(`Revert blocked: ${type} “${id}” was recreated or restored after the patch.`)
  }

  const createdTaskIds = batch.afterSnapshots.filter((entry) => entry.type === 'task' && !before.has(key('task', entry.id))).map((entry) => entry.id)
  const createdProjectIds = batch.afterSnapshots.filter((entry) => entry.type === 'project' && !before.has(key('project', entry.id))).map((entry) => entry.id)
  const createdHabitIds = batch.afterSnapshots.filter((entry) => entry.type === 'habit' && !before.has(key('habit', entry.id))).map((entry) => entry.id)
  for (const taskId of createdTaskIds) {
    if (await db.focusSessions.where('taskId').equals(taskId).count()) throw new Error('Revert blocked: Focus time was logged against a Task created by this patch.')
    const laterBlocks = (await db.timeBlocks.where('taskId').equals(taskId).toArray()).filter((block) => !expectedBlockIds.has(block.id))
    if (laterBlocks.length) throw new Error('Revert blocked: a Task created by this patch has later calendar blocks.')
  }
  const createdTaskSet = new Set([...createdTaskIds, ...extraSeriesTaskIds])
  for (const projectId of createdProjectIds) {
    const linked = await db.tasks.where('projectId').equals(projectId).toArray()
    if (linked.some((task) => !createdTaskSet.has(task.id))) throw new Error('Revert blocked: later Tasks now depend on a Project created by this patch.')
  }
  for (const habitId of createdHabitIds) if (await db.habitEntries.where('habitId').equals(habitId).count()) throw new Error('Revert blocked: a Habit created by this patch now has history.')

  await db.transaction('rw', [db.projects, db.tasks, db.habits, db.timeBlocks, db.recurringSeries, db.dailyPlans, db.dailyPlanItems, db.patchBatches], async () => {
    if (extraSeriesBlockIds.size) await db.timeBlocks.bulkDelete([...extraSeriesBlockIds])
    if (extraSeriesTaskIds.size) { await db.dailyPlanItems.where('taskId').anyOf([...extraSeriesTaskIds]).delete(); await db.tasks.bulkDelete([...extraSeriesTaskIds]) }

    // Delete entities that did not exist before the patch.
    const deleteEntries = batch.afterSnapshots.filter((entry) => !before.has(key(entry.type, entry.id)))
    const deleteOrder: SnapshotType[] = ['timeBlock','dailyPlanItem','task','recurringSeries','habit','project','dailyPlan']
    for (const type of deleteOrder) for (const entry of deleteEntries.filter((item) => item.type === type)) await deleteSnapshotKey(entry.type, entry.id)

    // Restore pre-patch snapshots exactly.
    const restoreOrder: SnapshotType[] = ['project','habit','recurringSeries','task','timeBlock','dailyPlan','dailyPlanItem']
    for (const type of restoreOrder) for (const entry of batch.beforeSnapshots.filter((item) => item.type === type)) await putSnapshot(entry)

    const revertedAt = new Date().toISOString()
    await db.patchBatches.update(batch.id, { status: 'reverted', revertedAt, updatedAt: revertedAt })
  })
}

export async function listPatchHistory() { return patchBatchRepository.list() }

export async function getPatchInstructions() {
  const [projects, tasks, habits, timeBlocks, recurringSeries] = await Promise.all([db.projects.toArray(), db.tasks.toArray(), db.habits.toArray(), db.timeBlocks.toArray(), db.recurringSeries.toArray()])
  return buildPatchInstructions({ projects, tasks, habits, timeBlocks, recurringSeries })
}
