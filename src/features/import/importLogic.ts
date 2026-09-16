import { localDateKey, localDateToDate } from '../../domain/date'
import type { DailyPlanEntity, HabitEntity, ProjectEntity, TaskEntity, TimeBlockEntity } from '../../domain/models'
import { calendarOccurrenceDates, defaultMaterializationThrough } from '../recurrence/recurrenceLogic'
import { blockConflicts, isoAtMinute } from '../planner/calendarLogic'
import { makeSeriesEntity } from '../../services/entityFactory'
import type { ImportAnalysis, ImportDocumentV1, ImportIssue } from './importTypes'

export interface ImportAnalysisContext {
  projects: ProjectEntity[]
  tasks: TaskEntity[]
  habits: HabitEntity[]
  timeBlocks: TimeBlockEntity[]
  dailyPlans: DailyPlanEntity[]
  defaultCapacityMinutes: number
}

function issue(severity: ImportIssue['severity'], code: string, message: string, path?: string): ImportIssue { return { severity, code, message, path } }
function normalize(value: string) { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') }
function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = localDateToDate(value)
  return localDateKey(date) === value
}
function sameRefOrId(ref?: string, id?: string) { return Boolean(ref && id) }

function scheduleMatches(schedule: ImportDocumentV1['habits'][number]['schedule'], date: string) {
  const weekday = localDateToDate(date).getDay()
  if (schedule.type === 'daily') return true
  if (schedule.type === 'weekdays') return weekday >= 1 && weekday <= 5
  if (schedule.type === 'selected-days') return schedule.weekdays?.includes(weekday) ?? false
  return false
}

function taskEstimateByDate(tasks: TaskEntity[]) {
  const map = new Map<string, number>()
  for (const task of tasks) {
    if (task.deletedAt || task.status !== 'todo' || !task.plannedDate) continue
    map.set(task.plannedDate, (map.get(task.plannedDate) ?? 0) + (task.estimatedMinutes ?? 0))
  }
  return map
}

export function buildImportAnalysis(document: ImportDocumentV1, context: ImportAnalysisContext): ImportAnalysis {
  const issues: ImportIssue[] = []
  const refs = new Set<string>()
  const projectRefs = new Set(document.projects.map((item) => item.ref))
  const taskRefs = new Map(document.tasks.map((item) => [item.ref, item]))
  const existingProjectIds = new Set(context.projects.filter((project) => !project.archived).map((project) => project.id))

  const allRefItems: Array<[string, string]> = [
    ...document.projects.map((item) => [item.ref, `projects.${item.ref}`] as [string, string]),
    ...document.tasks.map((item) => [item.ref, `tasks.${item.ref}`] as [string, string]),
    ...document.habits.map((item) => [item.ref, `habits.${item.ref}`] as [string, string]),
    ...document.recurringSeries.map((item) => [item.ref, `recurringSeries.${item.ref}`] as [string, string]),
    ...document.timeBlocks.flatMap((item, index) => item.ref ? [[item.ref, `timeBlocks.${index}`] as [string, string]] : []),
  ]
  for (const [value, path] of allRefItems) {
    if (refs.has(value)) issues.push(issue('error', 'duplicate_ref', `Reference “${value}” is used more than once.`, path))
    refs.add(value)
  }

  document.projects.forEach((project, index) => {
    if (project.type === 'standard' && (project.examDate || project.weeklyTargetMinutes)) issues.push(issue('error', 'standard_academic_metadata', 'Standard projects cannot carry exam dates or weekly study targets.', `projects.${index}`))
    if (project.examDate && !validDate(project.examDate)) issues.push(issue('error', 'invalid_date', 'Project examDate is not a valid local calendar date.', `projects.${index}.examDate`))
    if (context.projects.some((existing) => !existing.archived && normalize(existing.name) === normalize(project.name))) issues.push(issue('warning', 'duplicate_project_name', `An active project named “${project.name}” already exists.`))
  })

  document.tasks.forEach((task, index) => {
    if (sameRefOrId(task.projectRef, task.projectId)) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both.', `tasks.${index}`))
    if (task.projectRef && !projectRefs.has(task.projectRef)) issues.push(issue('error', 'missing_project_ref', `Unknown projectRef “${task.projectRef}”.`, `tasks.${index}.projectRef`))
    if (task.projectId && !existingProjectIds.has(task.projectId)) issues.push(issue('error', 'missing_project_id', `Existing project “${task.projectId}” does not exist.`, `tasks.${index}.projectId`))
    if (task.parentRef) {
      const parent = taskRefs.get(task.parentRef)
      if (!parent) issues.push(issue('error', 'missing_parent_ref', `Unknown parentRef “${task.parentRef}”.`, `tasks.${index}.parentRef`))
      else if (parent.parentRef) issues.push(issue('error', 'nested_subtask', 'Subtasks are limited to one level.', `tasks.${index}.parentRef`))
      if (parent?.status === 'inbox') issues.push(issue('error', 'inbox_parent', 'Inbox captures cannot own imported subtasks.', `tasks.${index}.parentRef`))
    }
    if (task.status === 'inbox' && (task.projectRef || task.projectId || task.plannedDate)) issues.push(issue('error', 'inbox_planning', 'Inbox captures must remain unassigned and unplanned.', `tasks.${index}`))
    if (task.plannedDate && !validDate(task.plannedDate)) issues.push(issue('error', 'invalid_date', 'plannedDate is not a valid local calendar date.', `tasks.${index}.plannedDate`))
    if (task.deadline && !validDate(task.deadline)) issues.push(issue('error', 'invalid_date', 'deadline is not a valid local calendar date.', `tasks.${index}.deadline`))
    if (task.plannedDate && task.deadline && task.plannedDate > task.deadline) issues.push(issue('warning', 'after_deadline', `“${task.title}” is planned after its hard deadline.`))
    const probable = context.tasks.some((existing) => !existing.deletedAt && existing.status !== 'cancelled' && normalize(existing.title) === normalize(task.title) && (existing.plannedDate ?? '') === (task.plannedDate ?? ''))
    if (probable) issues.push(issue('warning', 'probable_duplicate_task', `“${task.title}” looks like an existing task${task.plannedDate ? ` on ${task.plannedDate}` : ''}.`))
  })

  document.habits.forEach((habit, index) => {
    if (habit.kind === 'check' && (habit.target !== 1 || habit.countsTowardCapacity)) issues.push(issue('error', 'check_habit_semantics', 'Check habits must use target 1 and cannot consume duration capacity.', `habits.${index}`))
    if (habit.schedule.type === 'selected-days' && (!habit.schedule.weekdays?.length)) issues.push(issue('error', 'selected_days_empty', 'Selected-day habits require at least one weekday.', `habits.${index}.schedule`))
    if (habit.schedule.type !== 'selected-days' && habit.schedule.weekdays) issues.push(issue('error', 'ignored_weekdays', 'weekdays is only valid for selected-days habits.', `habits.${index}.schedule.weekdays`))
    if (habit.schedule.type === 'times-per-week' && !habit.schedule.timesPerWeek) issues.push(issue('error', 'missing_weekly_target', 'times-per-week habits require timesPerWeek.', `habits.${index}.schedule.timesPerWeek`))
    if (habit.schedule.type !== 'times-per-week' && habit.schedule.timesPerWeek) issues.push(issue('error', 'ignored_times_per_week', 'timesPerWeek is only valid for times-per-week habits.', `habits.${index}.schedule.timesPerWeek`))
  })

  document.timeBlocks.forEach((block, index) => {
    if (!validDate(block.date)) issues.push(issue('error', 'invalid_date', 'Time block date is invalid.', `timeBlocks.${index}.date`))
    if (block.startMinute + block.durationMinutes > 1440) issues.push(issue('error', 'cross_midnight', 'Time blocks may not cross local midnight in protocol v1.', `timeBlocks.${index}`))
    if (block.kind === 'task') {
      if (!block.taskRef || !taskRefs.has(block.taskRef)) issues.push(issue('error', 'missing_task_ref', 'Task blocks require a taskRef created in the same import.', `timeBlocks.${index}.taskRef`))
      const task = block.taskRef ? taskRefs.get(block.taskRef) : undefined
      if (task?.status === 'inbox') issues.push(issue('error', 'inbox_time_block', 'Inbox captures cannot own Time Blocks.', `timeBlocks.${index}`))
      if (block.title) issues.push(issue('error', 'ignored_task_block_title', 'Task block titles come from the linked Task; omit title.', `timeBlocks.${index}.title`))
    } else {
      if (!block.title) issues.push(issue('error', 'event_title', 'Standalone events require a title.', `timeBlocks.${index}.title`))
      if (block.taskRef) issues.push(issue('error', 'event_task_ref', 'Standalone events cannot include taskRef.', `timeBlocks.${index}.taskRef`))
    }
  })

  let generatedOccurrences = 0
  for (let index = 0; index < document.recurringSeries.length; index += 1) {
    const item = document.recurringSeries[index]
    if (!validDate(item.startDate)) issues.push(issue('error', 'invalid_date', 'Recurring startDate is invalid.', `recurringSeries.${index}.startDate`))
    if (item.rule.until && (!validDate(item.rule.until) || item.rule.until < item.startDate)) issues.push(issue('error', 'invalid_recurrence_end', 'Recurrence end must be a valid date on or after startDate.', `recurringSeries.${index}.rule.until`))
    if (item.rule.until && item.rule.count) issues.push(issue('error', 'two_recurrence_ends', 'Use either until or count, not both.', `recurringSeries.${index}.rule`))
    if (item.rule.frequency !== 'weekly' && item.rule.weekdays) issues.push(issue('error', 'ignored_recurrence_weekdays', 'weekdays is only valid for weekly recurrence.', `recurringSeries.${index}.rule.weekdays`))
    if (item.rule.frequency !== 'monthly' && item.rule.monthDay) issues.push(issue('error', 'ignored_month_day', 'monthDay is only valid for monthly recurrence.', `recurringSeries.${index}.rule.monthDay`))
    if (item.rule.frequency === 'weekly' && item.rule.weekdays && !item.rule.weekdays.length) issues.push(issue('error', 'empty_recurrence_weekdays', 'Weekly weekdays cannot be empty.', `recurringSeries.${index}.rule.weekdays`))
    if (sameRefOrId(item.taskTemplate.projectRef, item.taskTemplate.projectId)) issues.push(issue('error', 'project_ref_and_id', 'Use projectRef or projectId, not both.', `recurringSeries.${index}.taskTemplate`))
    if (item.taskTemplate.projectRef && !projectRefs.has(item.taskTemplate.projectRef)) issues.push(issue('error', 'missing_project_ref', `Unknown projectRef “${item.taskTemplate.projectRef}”.`, `recurringSeries.${index}.taskTemplate.projectRef`))
    if (item.taskTemplate.projectId && !existingProjectIds.has(item.taskTemplate.projectId)) issues.push(issue('error', 'missing_project_id', `Existing project “${item.taskTemplate.projectId}” does not exist.`, `recurringSeries.${index}.taskTemplate.projectId`))
    if (item.taskTemplate.blockDurationMinutes !== undefined && item.taskTemplate.startMinute === undefined) issues.push(issue('error', 'block_without_start', 'Recurring blockDurationMinutes requires startMinute.', `recurringSeries.${index}.taskTemplate`))
    const blockDuration = item.taskTemplate.blockDurationMinutes ?? item.taskTemplate.estimatedMinutes
    if (item.taskTemplate.startMinute !== undefined && blockDuration && item.taskTemplate.startMinute + blockDuration > 1440) issues.push(issue('error', 'cross_midnight', 'Recurring Time Blocks may not cross local midnight.', `recurringSeries.${index}.taskTemplate`))
    if (item.rule.frequency === 'after-completion' && item.rule.weekdays) issues.push(issue('error', 'completion_weekdays', 'Completion-relative recurrence cannot use weekdays.', `recurringSeries.${index}.rule.weekdays`))

    if (!issues.some((entry) => entry.severity === 'error' && entry.path?.startsWith(`recurringSeries.${index}`))) {
      const series = makeSeriesEntity({
        title: item.title, timezone: item.timezone, startDate: item.startDate, rule: item.rule,
        taskTemplate: { title: item.taskTemplate.title, description: item.taskTemplate.description, priority: item.taskTemplate.priority, estimatedMinutes: item.taskTemplate.estimatedMinutes, deadlineOffsetDays: item.taskTemplate.deadlineOffsetDays, startMinute: item.taskTemplate.startMinute, blockDurationMinutes: item.taskTemplate.blockDurationMinutes },
      })
      const count = item.rule.frequency === 'after-completion' ? 1 : calendarOccurrenceDates(series, defaultMaterializationThrough()).length
      generatedOccurrences += count
      if (count > 500) issues.push(issue('warning', 'large_series', `“${item.title}” materializes ${count} occurrences in the current horizon.`))
    }
  }
  if (generatedOccurrences > 3000) issues.push(issue('error', 'materialization_limit', `The import would materialize ${generatedOccurrences} recurring occurrences; the v1 safety limit is 3000.`))

  // Calendar overlaps from explicit imported blocks. Recurrence block conflicts are surfaced by the same rule during apply-time analysis.
  const previewBlocks: TimeBlockEntity[] = document.timeBlocks.filter((block) => block.startMinute + block.durationMinutes <= 1440).map((block, index) => ({
    id: `import-preview-${index}`,
    title: block.title ?? taskRefs.get(block.taskRef ?? '')?.title ?? 'Task block',
    kind: block.kind,
    start: isoAtMinute(block.date, block.startMinute),
    end: isoAtMinute(block.date, block.startMinute + block.durationMinutes),
    createdAt: '', updatedAt: '',
  }))
  const conflicts = blockConflicts([...context.timeBlocks, ...previewBlocks])
  for (const block of previewBlocks) if (conflicts.has(block.id)) issues.push(issue('warning', 'calendar_conflict', `Imported calendar block “${block.title}” overlaps another block.`))

  const importedMinutes = new Map<string, number>()
  for (const task of document.tasks) if (task.status === 'todo' && task.plannedDate) importedMinutes.set(task.plannedDate, (importedMinutes.get(task.plannedDate) ?? 0) + (task.estimatedMinutes ?? 0))
  for (const seriesItem of document.recurringSeries) {
    if (!validDate(seriesItem.startDate)) continue
    const projectId = undefined
    const series = makeSeriesEntity({
      title: seriesItem.title, timezone: seriesItem.timezone, startDate: seriesItem.startDate, rule: seriesItem.rule,
      taskTemplate: { title: seriesItem.taskTemplate.title, description: seriesItem.taskTemplate.description, projectId, priority: seriesItem.taskTemplate.priority, estimatedMinutes: seriesItem.taskTemplate.estimatedMinutes, deadlineOffsetDays: seriesItem.taskTemplate.deadlineOffsetDays, startMinute: seriesItem.taskTemplate.startMinute, blockDurationMinutes: seriesItem.taskTemplate.blockDurationMinutes },
    })
    const dates = series.rule.frequency === 'after-completion' ? [series.startDate] : calendarOccurrenceDates(series, defaultMaterializationThrough())
    for (const date of dates) importedMinutes.set(date, (importedMinutes.get(date) ?? 0) + (series.taskTemplate.estimatedMinutes ?? 0))
  }
  const planDates = new Set([...context.dailyPlans.map((plan) => plan.date), ...importedMinutes.keys()])
  for (const habit of document.habits) {
    if (habit.kind !== 'duration' || !habit.countsTowardCapacity || habit.schedule.type === 'times-per-week') continue
    for (const date of planDates) if (scheduleMatches(habit.schedule, date)) importedMinutes.set(date, (importedMinutes.get(date) ?? 0) + habit.target)
  }

  const existingMinutes = taskEstimateByDate(context.tasks)
  const plans = new Map(context.dailyPlans.map((plan) => [plan.date, plan]))
  const dayImpacts = [...importedMinutes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, added]) => {
    const existing = existingMinutes.get(date) ?? 0
    const capacity = plans.get(date)?.capacityMinutes ?? context.defaultCapacityMinutes
    const total = existing + added
    return { date, existingMinutes: existing, importedMinutes: added, capacityMinutes: capacity, totalMinutes: total, overloadedBy: Math.max(0, total - capacity) }
  })
  for (const impact of dayImpacts.filter((item) => item.overloadedBy > 0).slice(0, 12)) issues.push(issue('warning', 'capacity_overload', `${impact.date} would be over capacity by ${impact.overloadedBy}m after import.`))

  return {
    document,
    issues,
    counts: { projects: document.projects.length, tasks: document.tasks.length, habits: document.habits.length, timeBlocks: document.timeBlocks.length, recurringSeries: document.recurringSeries.length, generatedOccurrences },
    dayImpacts,
  }
}
