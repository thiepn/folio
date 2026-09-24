import { addLocalDays, endOfLocalWeek, localDateKey, localDateToDate, startOfLocalWeek } from '../../domain/date'
import type { LocalDate, ProjectEntity, TaskEntity, TimeBlockEntity } from '../../domain/models'

export interface ReviewDayMetric {
  date: LocalDate
  capacityMinutes: number
  plannedMinutes: number
  plannedTasks: number
  completedTasks: number
  scheduledTaskMinutes: number
  focusSeconds: number
  overloadedByMinutes: number
  planStatus: 'draft' | 'committed'
}

export interface ReviewProjectMetric {
  projectId: string
  name: string
  type: 'standard' | 'academic'
  openTasks: number
  completedThisWeek: number
  focusSeconds: number
  weeklyTargetMinutes?: number
  targetPercent?: number
  paceStatus?: 'ahead' | 'on-track' | 'behind'
}

export interface ReviewTaskReference {
  id: string
  title: string
  projectName?: string
  plannedDate?: LocalDate
  deadline?: LocalDate
  estimatedMinutes?: number
}

export interface ReviewTaskIssue extends ReviewTaskReference {
  id: string
  title: string
  projectName?: string
  plannedDate?: LocalDate
  deadline?: LocalDate
  rescheduleCount: number
  ageDays: number
  estimatedMinutes?: number
  reason: string
}

export interface ReviewRecommendation {
  id: string
  tone: 'neutral' | 'warning' | 'positive'
  title: string
  detail: string
}

export interface ReviewSnapshot {
  today: LocalDate
  weekStart: LocalDate
  weekEnd: LocalDate
  nextWeekStart: LocalDate
  nextWeekEnd: LocalDate
  completionRate: number | null
  plannedThroughTodayCount: number
  completedPlannedCount: number
  focusWeekSeconds: number
  focusSessionCount: number
  focusInterruptionCount: number
  manualFocusSeconds: number
  focusGoalPercent: number | null
  scheduledWeekMinutes: number
  scheduleExecutionPercent: number | null
  estimateVariancePercent: number | null
  habitAdherence: number
  overloadedDays: number
  committedDays: number
  dayMetrics: ReviewDayMetric[]
  staleTasks: ReviewTaskIssue[]
  postponedTasks: ReviewTaskIssue[]
  carryoverTasks: ReviewTaskReference[]
  overdueDeadlines: ReviewTaskReference[]
  nextWeekDeadlines: ReviewTaskReference[]
  projectMetrics: ReviewProjectMetric[]
  neglectedProjects: ReviewProjectMetric[]
  behindAcademicProjects: ReviewProjectMetric[]
  recommendations: ReviewRecommendation[]
}

export function durationMinutes(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

export function ageInDays(createdAt: string, today: LocalDate): number {
  return Math.max(0, Math.floor((localDateToDate(today).getTime() - new Date(createdAt).getTime()) / 86_400_000))
}

export function weekElapsedDays(today: LocalDate): number {
  const start = startOfLocalWeek(today)
  return Math.min(7, Math.max(1, Math.round((localDateToDate(today).getTime() - localDateToDate(start).getTime()) / 86_400_000) + 1))
}

export function projectPaceStatus(focusSeconds: number, weeklyTargetMinutes: number, today: LocalDate): 'ahead' | 'on-track' | 'behind' {
  if (!weeklyTargetMinutes) return 'on-track'
  const expectedSeconds = weeklyTargetMinutes * 60 * (weekElapsedDays(today) / 7)
  if (focusSeconds >= expectedSeconds * 1.12) return 'ahead'
  if (focusSeconds >= expectedSeconds * .82) return 'on-track'
  return 'behind'
}

export function staleTaskIssues(tasks: TaskEntity[], projects: Map<string, ProjectEntity>, today: LocalDate, minimumAgeDays = 14): ReviewTaskIssue[] {
  return tasks
    .filter((task) => !task.parentTaskId && !task.deletedAt && !task.seriesId && (task.status === 'todo' || task.status === 'inbox'))
    .filter((task) => !task.plannedDate || task.plannedDate <= today)
    .map((task) => ({ task, age: ageInDays(task.createdAt, today) }))
    .filter(({ age }) => age >= minimumAgeDays)
    .sort((a, b) => b.age - a.age || b.task.rescheduleCount - a.task.rescheduleCount)
    .map(({ task, age }) => ({
      id: task.id,
      title: task.title,
      projectName: task.projectId ? projects.get(task.projectId)?.name : undefined,
      plannedDate: task.plannedDate,
      deadline: task.deadline,
      rescheduleCount: task.rescheduleCount,
      ageDays: age,
      estimatedMinutes: task.estimatedMinutes,
      reason: `Open for ${age} days`,
    }))
}

export function postponedTaskIssues(tasks: TaskEntity[], projects: Map<string, ProjectEntity>, today: LocalDate, minimumReschedules = 2): ReviewTaskIssue[] {
  return tasks
    .filter((task) => !task.parentTaskId && !task.deletedAt && task.status === 'todo' && task.rescheduleCount >= minimumReschedules)
    .sort((a, b) => b.rescheduleCount - a.rescheduleCount || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    .map((task) => ({
      id: task.id,
      title: task.title,
      projectName: task.projectId ? projects.get(task.projectId)?.name : undefined,
      plannedDate: task.plannedDate,
      deadline: task.deadline,
      rescheduleCount: task.rescheduleCount,
      ageDays: ageInDays(task.createdAt, today),
      estimatedMinutes: task.estimatedMinutes,
      reason: `Rescheduled ${task.rescheduleCount}×`,
    }))
}

export function sumScheduledTaskMinutes(blocks: TimeBlockEntity[], fromDate: LocalDate, throughDate: LocalDate) {
  return blocks
    .filter((block) => block.kind === 'task')
    .filter((block) => {
      const date = localDateKey(new Date(block.start))
      return date >= fromDate && date <= throughDate
    })
    .reduce((sum, block) => sum + durationMinutes(block.start, block.end), 0)
}

export function buildRecommendations(input: {
  completionRate: number | null
  overloadedDays: number
  staleCount: number
  postponedCount: number
  scheduledMinutes: number
  actualFocusMinutes: number
  behindAcademicProjects: number
  overdueDeadlines: number
}): ReviewRecommendation[] {
  const out: ReviewRecommendation[] = []
  if (input.overdueDeadlines) out.push({ id: 'overdue', tone: 'warning', title: `${input.overdueDeadlines} overdue deadline${input.overdueDeadlines === 1 ? '' : 's'}`, detail: 'Resolve these before adding more discretionary work.' })
  if (input.overloadedDays) out.push({ id: 'overload', tone: 'warning', title: `${input.overloadedDays} overloaded day${input.overloadedDays === 1 ? '' : 's'} this week`, detail: 'Reduce daily commitments or increase capacity only when the extra time is genuinely available.' })
  if (input.postponedCount) out.push({ id: 'postponed', tone: 'warning', title: `${input.postponedCount} repeatedly postponed task${input.postponedCount === 1 ? '' : 's'}`, detail: 'Do, deliberately defer, redefine, or remove them instead of carrying them indefinitely.' })
  if (input.staleCount) out.push({ id: 'stale', tone: 'neutral', title: `${input.staleCount} stale open task${input.staleCount === 1 ? '' : 's'}`, detail: 'Old backlog should earn its place again before it survives another week.' })
  if (input.scheduledMinutes >= 60 && input.actualFocusMinutes < input.scheduledMinutes * .65) out.push({ id: 'schedule-gap', tone: 'warning', title: 'Scheduled work substantially exceeded tracked execution', detail: 'Time-block less aggressively next week or use Focus more consistently when doing scheduled task work.' })
  if (input.behindAcademicProjects) out.push({ id: 'academic', tone: 'neutral', title: `${input.behindAcademicProjects} academic project${input.behindAcademicProjects === 1 ? '' : 's'} below weekly pace`, detail: 'Protect study blocks for these courses before filling the remaining week with lower-priority work.' })
  if (input.completionRate != null && input.completionRate >= 85 && input.overloadedDays === 0) out.push({ id: 'realistic', tone: 'positive', title: 'The week was planned realistically', detail: `${input.completionRate}% of planned tasks through today were completed without overloaded days.` })
  if (!out.length) out.push({ id: 'stable', tone: 'positive', title: 'No major planning correction detected', detail: 'Keep the next week similarly constrained and review new deadlines before committing extra work.' })
  return out.slice(0, 5)
}

export function reviewWeekBounds(today: LocalDate) {
  const weekStart = startOfLocalWeek(today)
  const weekEnd = endOfLocalWeek(today)
  const nextWeekStart = addLocalDays(weekEnd, 1)
  return { weekStart, weekEnd, nextWeekStart, nextWeekEnd: addLocalDays(nextWeekStart, 6) }
}
