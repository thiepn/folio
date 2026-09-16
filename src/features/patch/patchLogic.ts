import { addLocalDays, localDateKey, localDateToDate } from '../../domain/date'
import type { DailyPlanEntity, HabitEntity, ProjectEntity, RecurringSeriesEntity, TaskEntity, TimeBlockEntity } from '../../domain/models'
import { calendarOccurrenceDates, defaultMaterializationThrough } from '../recurrence/recurrenceLogic'
import { durationMinutes, localDateFromIso, minuteOfDayFromIso } from '../planner/calendarLogic'
import { makeSeriesEntity } from '../../services/entityFactory'
import type { PatchAnalysis, PatchDiffItem, PatchFieldDiff, PatchIssue, PatchOperationV1 } from './patchTypes'
import type { PatchDocumentV1 } from './patchTypes'

export interface PatchAnalysisContext {
  projects: ProjectEntity[]
  tasks: TaskEntity[]
  habits: HabitEntity[]
  timeBlocks: TimeBlockEntity[]
  recurringSeries: RecurringSeriesEntity[]
  dailyPlans: DailyPlanEntity[]
  defaultCapacityMinutes: number
  focusByTask: Map<string, number>
  habitEntryCounts: Map<string, number>
}

function issue(severity: PatchIssue['severity'], code: string, message: string, operationIndex?: number): PatchIssue { return { severity, code, message, operationIndex } }
function validDate(value?: string | null) { if (!value) return value === null; const date = localDateToDate(value); return localDateKey(date) === value }
function valueText(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function fieldDiff(field: string, before: unknown, after: unknown): PatchFieldDiff | undefined {
  if (JSON.stringify(before) === JSON.stringify(after)) return undefined
  return { field, before: valueText(before), after: valueText(after) }
}
function normalizeTitle(value: string) { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') }

function operationTarget(op: PatchOperationV1) {
  return op.op === 'create' ? op.value.ref : op.id
}

function labelFor(entity: string, value: any) {
  if (entity === 'project') return value.name ?? value.id ?? 'Project'
  if (entity === 'habit') return value.title ?? value.id ?? 'Habit'
  if (entity === 'timeBlock') return value.title ?? value.id ?? 'Time block'
  if (entity === 'recurringSeries') return value.title ?? value.id ?? 'Recurring series'
  return value.title ?? value.id ?? 'Task'
}

function projectExists(id: string | undefined | null, projectRef: string | undefined, existing: Map<string, ProjectEntity>, createdRefs: Set<string>) {
  if (id === null || (!id && !projectRef)) return true
  if (id) return existing.has(id) && !existing.get(id)!.archived
  return projectRef ? createdRefs.has(projectRef) : true
}

function seriesHasManualOverrides(series: RecurringSeriesEntity, context: PatchAnalysisContext) {
  const today = localDateKey()
  if (Object.keys(series.exceptions).some((date) => date >= today)) return true
  const tasks = context.tasks.filter((task) => task.seriesId === series.id && task.recurrenceDate && task.recurrenceDate >= today && task.status !== 'completed' && !task.deletedAt)
  for (const task of tasks) {
    const expectedDeadline = series.taskTemplate.deadlineOffsetDays === undefined ? undefined : addLocalDays(task.recurrenceDate!, series.taskTemplate.deadlineOffsetDays)
    if (task.plannedDate !== task.recurrenceDate || task.title !== series.taskTemplate.title || task.description !== series.taskTemplate.description || task.projectId !== series.taskTemplate.projectId || task.priority !== series.taskTemplate.priority || task.estimatedMinutes !== series.taskTemplate.estimatedMinutes || task.deadline !== expectedDeadline) return true
    const blocks = context.timeBlocks.filter((block) => block.taskId === task.id)
    const duration = series.taskTemplate.blockDurationMinutes ?? series.taskTemplate.estimatedMinutes
    if (series.taskTemplate.startMinute === undefined || !duration) {
      if (blocks.length) return true
    } else {
      if (blocks.length !== 1) return true
      const block = blocks[0]
      if (localDateFromIso(block.start) !== task.plannedDate || minuteOfDayFromIso(block.start) !== series.taskTemplate.startMinute || durationMinutes(block.start, block.end) !== duration) return true
    }
  }
  return false
}

function validateHabitSchedule(schedule: any, issues: PatchIssue[], index: number) {
  if (schedule.type === 'selected-days' && !schedule.weekdays?.length) issues.push(issue('error', 'selected_days_empty', 'Selected-day habits require at least one weekday.', index))
  if (schedule.type !== 'selected-days' && schedule.weekdays) issues.push(issue('error', 'ignored_weekdays', 'weekdays is only valid for selected-days habits.', index))
  if (schedule.type === 'times-per-week' && !schedule.timesPerWeek) issues.push(issue('error', 'missing_times_per_week', 'times-per-week habits require timesPerWeek.', index))
  if (schedule.type !== 'times-per-week' && schedule.timesPerWeek) issues.push(issue('error', 'ignored_times_per_week', 'timesPerWeek is only valid for times-per-week habits.', index))
}

function validateRule(rule: any, startDate: string, issues: PatchIssue[], index: number) {
  if (rule.until && (!validDate(rule.until) || rule.until < startDate)) issues.push(issue('error', 'invalid_recurrence_end', 'Recurrence end must be on or after startDate.', index))
  if (rule.until && rule.count) issues.push(issue('error', 'two_recurrence_ends', 'Use either until or count, not both.', index))
  if (rule.frequency !== 'weekly' && rule.weekdays) issues.push(issue('error', 'ignored_weekdays', 'Recurring weekdays are only valid for weekly recurrence.', index))
  if (rule.frequency !== 'monthly' && rule.monthDay) issues.push(issue('error', 'ignored_month_day', 'monthDay is only valid for monthly recurrence.', index))
}

export function buildPatchAnalysis(document: PatchDocumentV1, context: PatchAnalysisContext): PatchAnalysis {
  const issues: PatchIssue[] = []
  const diffs: PatchDiffItem[] = []
  const projects = new Map(context.projects.map((item) => [item.id, item]))
  const tasks = new Map(context.tasks.map((item) => [item.id, item]))
  const habits = new Map(context.habits.map((item) => [item.id, item]))
  const blocks = new Map(context.timeBlocks.map((item) => [item.id, item]))
  const seriesMap = new Map(context.recurringSeries.map((item) => [item.id, item]))
  const createdRefs = new Set<string>()
  const createdProjectRefs = new Set<string>()
  const createdTaskRefs = new Set<string>()
  const createdTaskValues = new Map<string, any>()
  const targetKeys = new Set<string>()
  const deltaByDate = new Map<string, number>()

  document.operations.forEach((op, index) => {
    if (op.op === 'create') {
      const ref = op.value.ref
      if (createdRefs.has(ref)) issues.push(issue('error', 'duplicate_create_ref', `Create ref “${ref}” is used more than once.`, index))
      createdRefs.add(ref)
      if (op.entity === 'project') createdProjectRefs.add(ref)
      if (op.entity === 'task') { createdTaskRefs.add(ref); createdTaskValues.set(ref, op.value) }
      return
    }
    const key = `${op.entity}:${op.id}`
    if (targetKeys.has(key)) issues.push(issue('error', 'duplicate_target', `The patch targets ${op.entity} “${op.id}” more than once. Split this into one final operation.`, index))
    targetKeys.add(key)
  })

  for (let index = 0; index < document.operations.length; index += 1) {
    const op = document.operations[index]
    let current: any
    if (op.op !== 'create') {
      current = op.entity === 'project' ? projects.get(op.id) : op.entity === 'task' ? tasks.get(op.id) : op.entity === 'habit' ? habits.get(op.id) : op.entity === 'timeBlock' ? blocks.get(op.id) : seriesMap.get(op.id)
      if (!current) { issues.push(issue('error', 'missing_target', `${op.entity} “${op.id}” no longer exists.`, index)); continue }
      if (current.updatedAt !== op.ifUpdatedAt) { issues.push(issue('error', 'stale_target', `${labelFor(op.entity, current)} changed after this patch context was copied. Regenerate the patch.`, index)); continue }
    }

    if (op.op === 'create') {
      const value: any = op.value
      if (op.entity === 'project') {
        if (value.type === 'standard' && (value.examDate || value.weeklyTargetMinutes)) issues.push(issue('error', 'standard_academic_metadata', 'Standard Projects cannot carry academic metadata.', index))
        if (context.projects.some((project) => !project.archived && normalizeTitle(project.name) === normalizeTitle(value.name))) issues.push(issue('warning', 'duplicate_project_name', `An active Project named “${value.name}” already exists.`, index))
      }
      if (op.entity === 'task') {
        if (value.projectRef && value.projectId) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both.', index))
        if (!projectExists(value.projectId, value.projectRef, projects, createdProjectRefs)) issues.push(issue('error', 'missing_project', 'The Task references an unknown or archived Project.', index))
        if (value.parentRef && value.parentId) issues.push(issue('error', 'parent_ref_and_id', 'Use parentRef or parentId, not both.', index))
        if (value.parentRef) {
          const parent = createdTaskValues.get(value.parentRef)
          if (!parent) issues.push(issue('error', 'missing_parent_ref', `Unknown parentRef “${value.parentRef}”.`, index))
          else {
            if (parent.parentRef || parent.parentId) issues.push(issue('error', 'nested_subtask', 'Subtasks are limited to one level.', index))
            if (parent.status === 'inbox') issues.push(issue('error', 'inbox_parent', 'Inbox captures cannot own subtasks.', index))
          }
        }
        if (value.parentId) { const parent = tasks.get(value.parentId); if (!parent || parent.parentTaskId || parent.deletedAt || parent.status === 'inbox') issues.push(issue('error', 'invalid_parent', 'parentId must reference an active root Task outside Inbox.', index)) }
        if (value.status === 'inbox' && (value.projectRef || value.projectId || value.plannedDate)) issues.push(issue('error', 'inbox_planning', 'Inbox captures must remain unassigned and unplanned.', index))
        if (value.plannedDate && value.deadline && value.plannedDate > value.deadline) issues.push(issue('warning', 'after_deadline', `“${value.title}” is planned after its deadline.`, index))
        if (!value.parentRef && !value.parentId && value.status === 'todo' && value.plannedDate) deltaByDate.set(value.plannedDate, (deltaByDate.get(value.plannedDate) ?? 0) + (value.estimatedMinutes ?? 0))
        if (context.tasks.some((task) => !task.deletedAt && normalizeTitle(task.title) === normalizeTitle(value.title) && (task.plannedDate ?? '') === (value.plannedDate ?? ''))) issues.push(issue('warning', 'probable_duplicate_task', `“${value.title}” looks like an existing Task.`, index))
      }
      if (op.entity === 'habit') {
        validateHabitSchedule(value.schedule, issues, index)
        if (value.kind === 'check' && (value.target !== 1 || value.countsTowardCapacity)) issues.push(issue('error', 'check_habit_semantics', 'Check Habits must use target 1 and cannot consume duration capacity.', index))
      }
      if (op.entity === 'timeBlock') {
        if (value.taskRef && value.taskId) issues.push(issue('error', 'task_ref_and_id', 'Use taskRef or taskId, not both.', index))
        if (value.startMinute + value.durationMinutes > 1440) issues.push(issue('error', 'cross_midnight', 'Time Blocks may not cross local midnight.', index))
        if (value.kind === 'task') {
          const linked = value.taskId ? tasks.get(value.taskId) : undefined
          if (!value.taskRef && !linked) issues.push(issue('error', 'missing_task', 'Task Time Blocks require an existing taskId or same-patch taskRef.', index))
          if (value.taskRef) {
            const createdTask = createdTaskValues.get(value.taskRef)
            if (!createdTask) issues.push(issue('error', 'missing_task_ref', `Unknown taskRef “${value.taskRef}”.`, index))
            else if (createdTask.status !== 'todo') issues.push(issue('error', 'task_not_actionable', 'Time Blocks can only be attached to open To-do Tasks.', index))
          }
          if (linked && (linked.status !== 'todo' || linked.deletedAt)) issues.push(issue('error', 'task_not_actionable', 'Time Blocks can only be attached to open To-do Tasks.', index))
          if (value.title) issues.push(issue('error', 'ignored_task_title', 'Task block titles come from the linked Task; omit title.', index))
        } else {
          if (!value.title) issues.push(issue('error', 'event_title', 'Standalone Events require title.', index))
          if (value.taskRef || value.taskId) issues.push(issue('error', 'event_task_link', 'Standalone Events cannot link to Tasks.', index))
        }
      }
      if (op.entity === 'recurringSeries') {
        const template = value.taskTemplate
        if (template.projectRef && template.projectId) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both.', index))
        if (!projectExists(template.projectId, template.projectRef, projects, createdProjectRefs)) issues.push(issue('error', 'missing_project', 'The recurring template references an unknown or archived Project.', index))
        validateRule(value.rule, value.startDate, issues, index)
        if (template.blockDurationMinutes !== undefined && template.startMinute === undefined) issues.push(issue('error', 'block_without_start', 'Recurring block duration requires startMinute.', index))
        const duration = template.blockDurationMinutes ?? template.estimatedMinutes
        if (template.startMinute !== undefined && duration && template.startMinute + duration > 1440) issues.push(issue('error', 'cross_midnight', 'Recurring Time Blocks may not cross midnight.', index))
        if (!issues.some((entry) => entry.severity === 'error' && entry.operationIndex === index)) {
          const preview = makeSeriesEntity({ title: value.title, timezone: value.timezone, startDate: value.startDate, rule: value.rule, taskTemplate: { title: template.title, description: template.description, priority: template.priority, estimatedMinutes: template.estimatedMinutes, deadlineOffsetDays: template.deadlineOffsetDays, startMinute: template.startMinute, blockDurationMinutes: template.blockDurationMinutes } })
          const dates = preview.rule.frequency === 'after-completion' ? [preview.startDate] : calendarOccurrenceDates(preview, defaultMaterializationThrough())
          if (dates.length > 500) issues.push(issue('warning', 'large_series', `This series will materialize ${dates.length} occurrences in the current horizon.`, index))
          for (const date of dates) deltaByDate.set(date, (deltaByDate.get(date) ?? 0) + (preview.taskTemplate.estimatedMinutes ?? 0))
        }
      }
      diffs.push({ operationIndex: index, op: 'create', entity: op.entity, target: op.value.ref, label: labelFor(op.entity, op.value), effect: `Create new ${op.entity}.`, destructive: false, fields: [{ field: 'entity', before: 'Does not exist', after: labelFor(op.entity, op.value) }] })
      continue
    }

    if (op.op === 'delete') {
      let effect = ''
      if (op.entity === 'task') {
        const children = context.tasks.filter((task) => task.parentTaskId === current.id && !task.deletedAt).length
        const blockCount = context.timeBlocks.filter((block) => block.taskId === current.id).length
        const focusCount = context.focusByTask.get(current.id) ?? 0
        effect = `Move Task to Trash${children ? ` with ${children} subtask${children === 1 ? '' : 's'}` : ''}. Linked calendar blocks and ${focusCount ? `${focusCount} Focus session${focusCount === 1 ? '' : 's'}` : 'Focus history'} are preserved.`
        if (!current.parentTaskId && current.status === 'todo' && current.plannedDate) deltaByDate.set(current.plannedDate, (deltaByDate.get(current.plannedDate) ?? 0) - (current.estimatedMinutes ?? 0))
        if (blockCount) issues.push(issue('warning', 'delete_task_blocks', `Deleting “${current.title}” will hide ${blockCount} linked Time Block${blockCount === 1 ? '' : 's'} while it remains in Trash.`, index))
      } else if (op.entity === 'project') {
        const count = context.tasks.filter((task) => task.projectId === current.id && !task.deletedAt).length
        effect = `Archive Project. ${count} linked Task${count === 1 ? '' : 's'} remain assigned and retain history.`
      } else if (op.entity === 'habit') {
        const entries = context.habitEntryCounts.get(current.id) ?? 0
        effect = `Archive Habit. ${entries} historical entr${entries === 1 ? 'y is' : 'ies are'} preserved.`
      } else if (op.entity === 'timeBlock') effect = 'Remove this Time Block. Patch Undo/Revert retains its exact snapshot.'
      else {
        const future = context.tasks.filter((task) => task.seriesId === current.id && task.status !== 'completed' && (task.recurrenceDate ?? '') >= localDateKey()).length
        effect = `End recurring series and hide ${future} future incomplete occurrence${future === 1 ? '' : 's'}; completed history remains.`
        for (const task of context.tasks.filter((task) => task.seriesId === current.id && task.status === 'todo' && task.plannedDate && (task.recurrenceDate ?? '') >= localDateKey())) deltaByDate.set(task.plannedDate!, (deltaByDate.get(task.plannedDate!) ?? 0) - (task.estimatedMinutes ?? 0))
      }
      diffs.push({ operationIndex: index, op: 'delete', entity: op.entity, target: op.id, label: labelFor(op.entity, current), effect, destructive: true, fields: [{ field: 'state', before: 'Active/current', after: op.entity === 'timeBlock' ? 'Removed' : op.entity === 'task' ? 'Trash' : op.entity === 'recurringSeries' ? 'Ended' : 'Archived' }] })
      continue
    }

    // UPDATE
    const fields: PatchFieldDiff[] = []
    if (op.entity === 'project') {
      if (current.archived) issues.push(issue('error', 'archived_target', 'Archived Projects must be restored manually before AI patching.', index))
      const changes: any = op.changes
      const nextType = changes.type ?? current.type
      const nextExam = Object.prototype.hasOwnProperty.call(changes, 'examDate') ? (changes.examDate ?? undefined) : current.examDate
      const nextTarget = Object.prototype.hasOwnProperty.call(changes, 'weeklyTargetMinutes') ? (changes.weeklyTargetMinutes ?? undefined) : current.weeklyTargetMinutes
      if (nextType === 'standard' && (nextExam || nextTarget)) issues.push(issue('error', 'standard_academic_metadata', 'Standard Projects cannot retain academic metadata. Clear it or keep type academic.', index))
      for (const key of Object.keys(changes)) { const diff = fieldDiff(key, current[key], changes[key]); if (diff) fields.push(diff) }
    }
    if (op.entity === 'task') {
      if (current.deletedAt || current.status === 'cancelled' || current.status === 'completed') issues.push(issue('error', 'historical_task', 'Patch v1 only updates open Tasks. Completed/cancelled/trashed Tasks are historical or recoverable state.', index))
      const changes: any = op.changes
      if (changes.projectRef && Object.prototype.hasOwnProperty.call(changes, 'projectId')) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both.', index))
      if (!projectExists(changes.projectId, changes.projectRef, projects, createdProjectRefs)) issues.push(issue('error', 'missing_project', 'The Task update references an unknown or archived Project.', index))
      const nextStatus = changes.status ?? current.status
      const nextPlanned = Object.prototype.hasOwnProperty.call(changes, 'plannedDate') ? (changes.plannedDate ?? undefined) : current.plannedDate
      const nextDeadline = Object.prototype.hasOwnProperty.call(changes, 'deadline') ? (changes.deadline ?? undefined) : current.deadline
      const nextProject = changes.projectRef ? `ref:${changes.projectRef}` : Object.prototype.hasOwnProperty.call(changes, 'projectId') ? (changes.projectId ?? undefined) : current.projectId
      if (nextStatus === 'inbox' && (nextPlanned || nextProject)) issues.push(issue('error', 'inbox_planning', 'An Inbox Task must have no project or plannedDate. Set status to todo when planning it.', index))
      if (nextPlanned && nextDeadline && nextPlanned > nextDeadline) issues.push(issue('warning', 'after_deadline', `“${current.title}” would be planned after its deadline.`, index))
      if (!current.parentTaskId && current.status === 'todo' && current.plannedDate) deltaByDate.set(current.plannedDate, (deltaByDate.get(current.plannedDate) ?? 0) - (current.estimatedMinutes ?? 0))
      if (!current.parentTaskId && nextStatus === 'todo' && nextPlanned) deltaByDate.set(nextPlanned, (deltaByDate.get(nextPlanned) ?? 0) + (Object.prototype.hasOwnProperty.call(changes, 'estimatedMinutes') ? (changes.estimatedMinutes ?? 0) : current.estimatedMinutes ?? 0))
      for (const key of Object.keys(changes)) { const before = key === 'projectRef' ? current.projectId : current[key]; const after = key === 'projectRef' ? `New project: ${changes[key]}` : changes[key]; const diff = fieldDiff(key, before, after); if (diff) fields.push(diff) }
    }
    if (op.entity === 'habit') {
      if (current.archived) issues.push(issue('error', 'archived_target', 'Archived Habits must be restored manually before AI patching.', index))
      const changes: any = op.changes
      const nextKind = changes.kind ?? current.kind
      const nextTarget = changes.target ?? current.target
      const nextCapacity = changes.countsTowardCapacity ?? current.countsTowardCapacity
      const nextSchedule = changes.schedule ?? current.schedule
      validateHabitSchedule(nextSchedule, issues, index)
      if (nextKind === 'check' && (nextTarget !== 1 || nextCapacity)) issues.push(issue('error', 'check_habit_semantics', 'Check Habits must use target 1 and cannot consume duration capacity.', index))
      for (const key of Object.keys(changes)) { const diff = fieldDiff(key, current[key], changes[key]); if (diff) fields.push(diff) }
    }
    if (op.entity === 'timeBlock') {
      const changes: any = op.changes
      const date = changes.date ?? localDateFromIso(current.start)
      const startMinute = changes.startMinute ?? minuteOfDayFromIso(current.start)
      const duration = changes.durationMinutes ?? durationMinutes(current.start, current.end)
      if (startMinute + duration > 1440) issues.push(issue('error', 'cross_midnight', 'Updated Time Block may not cross local midnight.', index))
      if (current.kind === 'task' && changes.title) issues.push(issue('warning', 'task_block_title', 'Renaming a Task Time Block does not rename its linked Task.', index))
      fields.push(...[
        fieldDiff('title', current.title, changes.title ?? current.title),
        fieldDiff('date', localDateFromIso(current.start), date),
        fieldDiff('startMinute', minuteOfDayFromIso(current.start), startMinute),
        fieldDiff('durationMinutes', durationMinutes(current.start, current.end), duration),
      ].filter((entry): entry is PatchFieldDiff => Boolean(entry)))
    }
    if (op.entity === 'recurringSeries') {
      if (current.status === 'archived') issues.push(issue('error', 'archived_target', 'Ended recurring series are historical; restore or recreate them manually.', index))
      const changes: any = op.changes
      const structural = Boolean(changes.startDate || changes.rule || changes.taskTemplate)
      if ((changes.startDate || changes.rule) && (current.rule.frequency === 'after-completion' || changes.rule?.frequency === 'after-completion') && context.tasks.some((task) => task.seriesId === current.id)) issues.push(issue('error', 'completion_series_rule_change', 'Changing the cadence/start of an existing completion-relative series is reserved for the recurrence editor; taskTemplate/status patches remain allowed.', index))
      if (structural && seriesHasManualOverrides(current, context)) issues.push(issue('error', 'series_overrides', 'This series has future occurrence overrides or manually edited Time Blocks. Patch the occurrence(s) directly or use the recurrence editor instead.', index))
      const startDate = changes.startDate ?? current.startDate
      const rule = changes.rule ?? current.rule
      validateRule(rule, startDate, issues, index)
      const template = { ...current.taskTemplate, ...(changes.taskTemplate ?? {}) }
      if (changes.taskTemplate?.projectRef && Object.prototype.hasOwnProperty.call(changes.taskTemplate, 'projectId')) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both in recurring taskTemplate.', index))
      if (!projectExists(changes.taskTemplate?.projectId, changes.taskTemplate?.projectRef, projects, createdProjectRefs)) issues.push(issue('error', 'missing_project', 'The recurring update references an unknown or archived Project.', index))
      const duration = template.blockDurationMinutes ?? template.estimatedMinutes
      if (template.blockDurationMinutes !== undefined && template.startMinute === undefined) issues.push(issue('error', 'block_without_start', 'Recurring block duration requires startMinute.', index))
      if (template.startMinute !== undefined && duration && template.startMinute + duration > 1440) issues.push(issue('error', 'cross_midnight', 'Recurring Time Blocks may not cross midnight.', index))
      for (const key of Object.keys(changes)) { const diff = fieldDiff(key, current[key], changes[key]); if (diff) fields.push(diff) }
      if (structural) issues.push(issue('warning', 'series_reconcile', 'Future incomplete occurrences will be reconciled to the updated series definition; completed history remains unchanged.', index))
    }
    if (!Object.keys((op as any).changes).length) issues.push(issue('error', 'empty_update', 'UPDATE changes cannot be empty.', index))
    diffs.push({ operationIndex: index, op: 'update', entity: op.entity, target: op.id, label: labelFor(op.entity, current), effect: `Update ${op.entity}.`, destructive: false, fields })
  }

  const existingByDate = new Map<string, number>()
  for (const task of context.tasks) if (!task.deletedAt && !task.parentTaskId && task.status === 'todo' && task.plannedDate) existingByDate.set(task.plannedDate, (existingByDate.get(task.plannedDate) ?? 0) + (task.estimatedMinutes ?? 0))
  const planMap = new Map(context.dailyPlans.map((plan) => [plan.date, plan]))
  const dayImpacts = [...deltaByDate.entries()].filter(([, delta]) => delta !== 0).sort(([a], [b]) => a.localeCompare(b)).map(([date, delta]) => {
    const beforeMinutes = existingByDate.get(date) ?? 0
    const afterMinutes = Math.max(0, beforeMinutes + delta)
    const capacityMinutes = planMap.get(date)?.capacityMinutes ?? context.defaultCapacityMinutes
    return { date, beforeMinutes, afterMinutes, capacityMinutes, deltaMinutes: delta, overloadedBy: Math.max(0, afterMinutes - capacityMinutes) }
  })
  for (const impact of dayImpacts.filter((item) => item.overloadedBy > 0).slice(0, 12)) issues.push(issue('warning', 'capacity_overload', `${impact.date} would be over capacity by ${impact.overloadedBy}m after this patch.`))

  return { document, issues, diffs, destructiveCount: diffs.filter((diff) => diff.destructive).length, dayImpacts }
}

export function patchTargetKey(op: PatchOperationV1) { return `${op.entity}:${operationTarget(op)}` }
