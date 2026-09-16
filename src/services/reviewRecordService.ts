import { endOfLocalMonth, endOfLocalWeek, formatLocalDate, localDateKey, startOfLocalMonth, startOfLocalWeek } from '../domain/date'
import type { LocalDate, ReviewKind, ReviewRecordEntity, ReviewRecordMetrics } from '../domain/models'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { habitRepository } from '../repositories/habitRepository'
import { projectRepository } from '../repositories/projectRepository'
import { reviewRecordRepository } from '../repositories/reviewRecordRepository'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import type { UndoableMutation } from './undo'

export interface ReviewReflectionInput {
  kind: ReviewKind
  anchorDate: LocalDate
  title?: string
  summary?: string
  wins?: string
  friction?: string
  lessons?: string
  nextFocus?: string
}

export interface ReviewPeriod {
  periodStart: LocalDate
  periodEnd: LocalDate
}

export function reviewPeriodForKind(kind: ReviewKind, anchorDate: LocalDate): ReviewPeriod {
  if (kind === 'daily') return { periodStart: anchorDate, periodEnd: anchorDate }
  if (kind === 'weekly') return { periodStart: startOfLocalWeek(anchorDate), periodEnd: endOfLocalWeek(anchorDate) }
  return { periodStart: startOfLocalMonth(anchorDate), periodEnd: endOfLocalMonth(anchorDate) }
}

function isoDateInRange(value: string | undefined, start: LocalDate, end: LocalDate) {
  if (!value) return false
  const date = localDateKey(new Date(value))
  return date >= start && date <= end
}

function blockMinutes(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

async function computeMetrics(periodStart: LocalDate, periodEnd: LocalDate): Promise<ReviewRecordMetrics> {
  const [tasks, sessions, habitEntries, projects, blocks] = await Promise.all([
    taskRepository.listRootTasks(),
    focusSessionRepository.listAll(),
    habitRepository.listAllEntries(),
    projectRepository.listAll(),
    timeBlockRepository.listAll(),
  ])

  const planned = tasks.filter((task) => task.plannedDate && task.plannedDate >= periodStart && task.plannedDate <= periodEnd && task.status !== 'cancelled')
  const completedPlanned = planned.filter((task) => task.completedAt && localDateKey(new Date(task.completedAt)) <= periodEnd)
  const completed = tasks.filter((task) => task.status === 'completed' && isoDateInRange(task.completedAt, periodStart, periodEnd))
  const finishedSessions = sessions.filter((session) => session.status === 'finished' && isoDateInRange(session.startedAt, periodStart, periodEnd))
  const habitCompletions = habitEntries.filter((entry) => entry.status === 'completed' && entry.date >= periodStart && entry.date <= periodEnd).length
  const scheduledMinutes = blocks
    .filter((block) => block.kind === 'task' && isoDateInRange(block.start, periodStart, periodEnd))
    .reduce((sum, block) => sum + blockMinutes(block.start, block.end), 0)
  const completedMilestones = projects.flatMap((project) => project.milestones).filter((milestone) => isoDateInRange(milestone.completedAt, periodStart, periodEnd)).length
  const activeProjectIds = new Set<string>()
  for (const task of completed) if (task.projectId) activeProjectIds.add(task.projectId)
  for (const session of finishedSessions) if (session.projectIdSnapshot) activeProjectIds.add(session.projectIdSnapshot)

  return {
    plannedTasks: planned.length,
    completedPlannedTasks: completedPlanned.length,
    completedTasks: completed.length,
    focusSeconds: finishedSessions.reduce((sum, session) => sum + session.durationSeconds, 0),
    focusSessions: finishedSessions.length,
    habitCompletions,
    scheduledMinutes,
    completedMilestones,
    activeProjects: activeProjectIds.size,
  }
}

function defaultTitle(kind: ReviewKind, periodStart: LocalDate) {
  if (kind === 'daily') return `Daily review · ${formatLocalDate(periodStart, { month: 'short', day: 'numeric' })}`
  if (kind === 'weekly') return `Week of ${formatLocalDate(periodStart, { month: 'short', day: 'numeric' })}`
  return formatLocalDate(periodStart, { month: 'long', year: 'numeric' })
}

export const reviewRecordService = {
  async save(input: ReviewReflectionInput): Promise<{ record: ReviewRecordEntity; undo: UndoableMutation }> {
    const { periodStart, periodEnd } = reviewPeriodForKind(input.kind, input.anchorDate)
    const previous = await reviewRecordRepository.getForPeriod(input.kind, periodStart)
    const now = new Date().toISOString()
    const metrics = await computeMetrics(periodStart, periodEnd)
    const record: ReviewRecordEntity = {
      id: previous?.id ?? `${input.kind}:${periodStart}`,
      kind: input.kind,
      periodStart,
      periodEnd,
      title: input.title?.trim() || previous?.title || defaultTitle(input.kind, periodStart),
      summary: input.summary !== undefined ? input.summary.trim() : previous?.summary ?? '',
      wins: input.wins !== undefined ? input.wins.trim() : previous?.wins ?? '',
      friction: input.friction !== undefined ? input.friction.trim() : previous?.friction ?? '',
      lessons: input.lessons !== undefined ? input.lessons.trim() : previous?.lessons ?? '',
      nextFocus: input.nextFocus !== undefined ? input.nextFocus.trim() : previous?.nextFocus ?? '',
      metrics,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      completedAt: previous?.completedAt ?? now,
    }
    await reviewRecordRepository.put(record)
    return {
      record,
      undo: previous
        ? { message: 'Review updated', undo: async () => reviewRecordRepository.replace(previous) }
        : { message: 'Review saved', undo: async () => reviewRecordRepository.remove(record.id) },
    }
  },

  async saveDailySummary(date: LocalDate, summary: string): Promise<ReviewRecordEntity> {
    const result = await this.save({ kind: 'daily', anchorDate: date, summary })
    return result.record
  },

  async remove(id: string): Promise<UndoableMutation> {
    const previous = await reviewRecordRepository.get(id)
    if (!previous) throw new Error('Review record not found.')
    await reviewRecordRepository.remove(id)
    return { message: 'Review removed', undo: async () => reviewRecordRepository.replace(previous) }
  },
}
