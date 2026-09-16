import { addLocalDays } from '../domain/date'
import type { LocalDate, RecurringSeriesEntity, TaskEntity, TimeBlockEntity } from '../domain/models'
import { calendarOccurrenceDates, defaultMaterializationThrough } from '../features/recurrence/recurrenceLogic'
import { isoAtMinute } from '../features/planner/calendarLogic'
import { makeTaskEntity, makeTimeBlockEntity } from './entityFactory'

export interface MaterializedSeriesGraph {
  series: RecurringSeriesEntity
  tasks: TaskEntity[]
  timeBlocks: TimeBlockEntity[]
}

function deadlineFor(series: RecurringSeriesEntity, date: LocalDate) {
  return series.taskTemplate.deadlineOffsetDays === undefined ? undefined : addLocalDays(date, series.taskTemplate.deadlineOffsetDays)
}

export function materializeSeriesGraph(seriesInput: RecurringSeriesEntity, through = defaultMaterializationThrough(), now = new Date().toISOString()): MaterializedSeriesGraph {
  const series: RecurringSeriesEntity = structuredClone(seriesInput)
  const dates = series.rule.frequency === 'after-completion'
    ? [series.startDate]
    : calendarOccurrenceDates(series, through)
  const tasks: TaskEntity[] = []
  const timeBlocks: TimeBlockEntity[] = []

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]
    const task = makeTaskEntity({
      title: series.taskTemplate.title,
      description: series.taskTemplate.description,
      projectId: series.taskTemplate.projectId,
      priority: series.taskTemplate.priority,
      status: 'todo',
      plannedDate: date,
      deadline: deadlineFor(series, date),
      estimatedMinutes: series.taskTemplate.estimatedMinutes,
      seriesId: series.id,
      recurrenceDate: date,
    }, crypto.randomUUID(), now, Date.now() + index)
    tasks.push(task)

    const startMinute = series.taskTemplate.startMinute
    const duration = series.taskTemplate.blockDurationMinutes ?? series.taskTemplate.estimatedMinutes
    if (startMinute !== undefined && duration) {
      timeBlocks.push(makeTimeBlockEntity({
        taskId: task.id,
        title: task.title,
        kind: 'task',
        start: isoAtMinute(date, startMinute),
        end: isoAtMinute(date, startMinute + duration),
      }, crypto.randomUUID(), now))
    }
  }

  series.materializedThrough = through
  series.updatedAt = now
  return { series, tasks, timeBlocks }
}
