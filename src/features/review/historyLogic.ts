import { localDateKey } from '../../domain/date'
import type { FocusSessionEntity, HabitEntity, HabitEntryEntity, ProjectEntity, ReviewRecordEntity, TaskEntity } from '../../domain/models'

export type HistoryEventKind = 'task' | 'focus' | 'habit' | 'project' | 'review'

export interface HistoryEvent {
  id: string
  kind: HistoryEventKind
  at: string
  date: string
  title: string
  detail: string
  projectName?: string
  taskId?: string
  projectId?: string
  reviewId?: string
  searchText: string
}

export interface HistoryFilter {
  query?: string
  kind?: HistoryEventKind | 'all'
  fromDate?: string
  throughDate?: string
}

type HistoryEventInput = Omit<HistoryEvent, 'date' | 'searchText'> & { extraSearch?: string }

export function buildHistoryEvents(input: {
  tasks: TaskEntity[]
  projects: ProjectEntity[]
  habits: HabitEntity[]
  habitEntries: HabitEntryEntity[]
  focusSessions: FocusSessionEntity[]
  reviewRecords: ReviewRecordEntity[]
}): HistoryEvent[] {
  const projectMap = new Map(input.projects.map((project) => [project.id, project]))
  const habitMap = new Map(input.habits.map((habit) => [habit.id, habit]))
  const events: HistoryEvent[] = []

  for (const task of input.tasks) {
    if (!task.completedAt) continue
    const projectName = task.projectId ? projectMap.get(task.projectId)?.name : undefined
    events.push(makeEvent({
      id: `task:${task.id}:${task.completedAt}`,
      kind: 'task',
      at: task.completedAt,
      title: task.title,
      detail: projectName ? `Completed · ${projectName}` : 'Completed task',
      projectName,
      taskId: task.id,
      projectId: task.projectId,
      extraSearch: task.description,
    }))
  }

  for (const session of input.focusSessions) {
    if (session.status !== 'finished') continue
    const at = session.endedAt ?? session.updatedAt ?? session.startedAt
    const title = session.taskTitleSnapshot ?? 'Focus session'
    const minutes = Math.max(0, Math.round(session.durationSeconds / 60))
    events.push(makeEvent({
      id: `focus:${session.id}`,
      kind: 'focus',
      at,
      title,
      detail: `${formatMinutes(minutes)} focused${session.projectNameSnapshot ? ` · ${session.projectNameSnapshot}` : ''}`,
      projectName: session.projectNameSnapshot,
      taskId: session.taskId,
      projectId: session.projectIdSnapshot,
      extraSearch: [session.intention, session.note].filter(Boolean).join(' '),
    }))
  }

  for (const entry of input.habitEntries) {
    if (entry.status !== 'completed' && entry.status !== 'skipped') continue
    const habit = habitMap.get(entry.habitId)
    const at = entry.completedAt ?? entry.skippedAt ?? entry.updatedAt
    const title = habit?.title ?? 'Habit'
    const detail = entry.status === 'skipped'
      ? 'Skipped habit'
      : habit?.kind === 'duration' ? `Completed · ${entry.value}m` : 'Completed habit'
    events.push(makeEvent({ id: `habit:${entry.id}:${entry.status}`, kind: 'habit', at, title, detail, extraSearch: habit?.description }))
  }

  for (const project of input.projects) {
    for (const activity of project.activity ?? []) {
      events.push(makeEvent({
        id: `project:${project.id}:${activity.id}`,
        kind: 'project',
        at: activity.at,
        title: project.name,
        detail: activity.label,
        projectName: project.name,
        projectId: project.id,
        extraSearch: `${project.description} ${project.notes}`,
      }))
    }
  }

  for (const review of input.reviewRecords) {
    const at = review.completedAt ?? review.updatedAt
    events.push(makeEvent({
      id: `review:${review.id}:${review.updatedAt}`,
      kind: 'review',
      at,
      title: review.title,
      detail: `${capitalize(review.kind)} review · ${periodLabel(review.periodStart, review.periodEnd)}`,
      reviewId: review.id,
      extraSearch: [review.summary, review.wins, review.friction, review.lessons, review.nextFocus].join(' '),
    }))
  }

  return events.sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title))
}

export function filterHistoryEvents(events: HistoryEvent[], filter: HistoryFilter): HistoryEvent[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? ''
  return events.filter((event) => {
    if (filter.kind && filter.kind !== 'all' && event.kind !== filter.kind) return false
    if (filter.fromDate && event.date < filter.fromDate) return false
    if (filter.throughDate && event.date > filter.throughDate) return false
    if (query && !event.searchText.includes(query)) return false
    return true
  })
}

export function historyCounts(events: HistoryEvent[], fromDate: string, throughDate: string) {
  const inRange = events.filter((event) => event.date >= fromDate && event.date <= throughDate)
  return {
    tasks: inRange.filter((event) => event.kind === 'task').length,
    focus: inRange.filter((event) => event.kind === 'focus').length,
    habits: inRange.filter((event) => event.kind === 'habit').length,
    projects: inRange.filter((event) => event.kind === 'project').length,
    reviews: inRange.filter((event) => event.kind === 'review').length,
  }
}

function makeEvent(input: HistoryEventInput): HistoryEvent {
  const { extraSearch, ...event } = input
  const date = localDateKey(new Date(event.at))
  const searchText = [event.title, event.detail, event.projectName, event.kind, extraSearch].filter(Boolean).join(' ').toLocaleLowerCase()
  return { ...event, date, searchText }
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function periodLabel(start: string, end: string) { return start === end ? start : `${start}–${end}` }
