import { addLocalDays, atTimeInZone } from '../domain/date'
import type { LocalDate, RecurringSeriesEntity, TaskEntity, TimeBlockEntity } from '../domain/models'
import { calendarOccurrenceDates, defaultMaterializationThrough } from '../features/recurrence/recurrenceLogic'
import { makeTaskEntity, makeTimeBlockEntity } from './entityFactory'

export interface MaterializedSeriesGraph {
  series: RecurringSeriesEntity
  tasks: TaskEntity[]
  timeBlocks: TimeBlockEntity[]
}

function deadlineFor(series: RecurringSeriesEntity, date: LocalDate) {
  return series.taskTemplate.deadlineOffsetDays === undefined ? undefined : addLocalDays(date, series.taskTemplate.deadlineOffsetDays)
}

function freshChecklist(items: string[], now: string) {
  return items.map((text, index) => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))
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
      listId: series.taskTemplate.listId,
      sectionId: series.taskTemplate.sectionId,
      priority: series.taskTemplate.priority,
      status: 'todo',
      plannedDate: date,
      deadline: deadlineFor(series, date),
      estimatedMinutes: series.taskTemplate.estimatedMinutes,
      tags: series.taskTemplate.tags ?? [],
      tagIds: series.taskTemplate.tagIds ?? [],
      checklist: freshChecklist(series.taskTemplate.checklist ?? [], now),
      sourceUrl: series.taskTemplate.sourceUrl,
      location: series.taskTemplate.location,
      pinned: series.taskTemplate.pinned ?? false,
      seriesId: series.id,
      recurrenceDate: date,
    }, crypto.randomUUID(), now, Date.now() + index)
    tasks.push(task)

    const startMinute = series.taskTemplate.startMinute
    const duration = series.taskTemplate.blockDurationMinutes ?? series.taskTemplate.estimatedMinutes
    if (startMinute !== undefined && duration) {
      const start = atTimeInZone(date, startMinute, series.timezone)
      timeBlocks.push(makeTimeBlockEntity({
        taskId: task.id,
        title: task.title,
        kind: 'task',
        start,
        end: new Date(new Date(start).getTime() + duration * 60_000).toISOString(),
      }, crypto.randomUUID(), now))
    }
  }

  series.materializedThrough = through
  series.updatedAt = now
  return { series, tasks, timeBlocks }
}
