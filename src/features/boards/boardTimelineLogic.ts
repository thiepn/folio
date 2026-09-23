import { addLocalDays, localDateToDate } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'

export interface TimelineSpan {
  start: LocalDate
  end: LocalDate
  milestone: boolean
}

export function normalizeTimelineSpan(start?: LocalDate, end?: LocalDate, milestone = false): TimelineSpan | undefined {
  if (!start) return undefined
  const normalizedEnd = milestone ? start : (end ?? start)
  if (normalizedEnd < start) throw new Error('Timeline end must not be before timeline start.')
  return { start, end: normalizedEnd, milestone }
}

export function shiftTimelineSpan(span: TimelineSpan, days: number): TimelineSpan {
  const start = addLocalDays(span.start, days)
  const end = span.milestone ? start : addLocalDays(span.end, days)
  return { ...span, start, end }
}

export function timelineDayOffset(from: LocalDate, to: LocalDate): number {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

export function timelineIntersects(span: TimelineSpan, from: LocalDate, through: LocalDate): boolean {
  return span.end >= from && span.start <= through
}

export type BoardGroupMode = 'section' | 'status' | 'priority' | 'list' | 'project'

export function boardGroupKey(task: TaskPreview, mode: BoardGroupMode): string {
  if (mode === 'section') return task.sectionId ?? '__none__'
  if (mode === 'status') return task.completed || task.status === 'completed' ? 'completed' : 'todo'
  if (mode === 'priority') return task.priority
  if (mode === 'list') return task.listId ?? '__none__'
  return task.projectId ?? '__none__'
}
