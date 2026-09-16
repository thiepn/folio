import { addLocalDays, localDateRange, startOfLocalWeek } from '../../domain/date'
import type { HabitEntity, LocalDate, ProjectEntity, TaskEntity, TaskPriority } from '../../domain/models'
import { habitScheduledForDate } from '../../domain/habit'
import { isActiveBlocker } from './dependencyLogic'

export type SavedViewDateMode = 'all' | 'today' | 'next7' | 'next30' | 'overdue' | 'unplanned'
export type SavedViewDeadlineMode = 'all' | 'overdue' | 'next7' | 'next30' | 'none'
export type SavedViewBlockMode = 'all' | 'ready' | 'blocked'
export type SavedViewStatusMode = 'open' | 'completed' | 'all'

export interface SavedTaskView {
  id: string
  name: string
  query?: string
  projectIds?: string[]
  priorities?: TaskPriority[]
  dateMode: SavedViewDateMode
  deadlineMode: SavedViewDeadlineMode
  blockMode: SavedViewBlockMode
  statusMode: SavedViewStatusMode
  createdAt: string
  updatedAt: string
}

export interface ForecastDay {
  date: LocalDate
  taskMinutes: number
  habitMinutes: number
  capacityMinutes: number
  totalMinutes: number
  remainingMinutes: number
  deadlineCount: number
}

export interface ForecastWeek {
  start: LocalDate
  end: LocalDate
  plannedMinutes: number
  capacityMinutes: number
  overloadedDays: number
  deadlineCount: number
  unplannedDeadlineMinutes: number
}

export interface DeadlinePressureItem {
  id: string
  title: string
  projectId?: string
  deadline: LocalDate
  daysLeft: number
  estimatedMinutes: number
  plannedDate?: LocalDate
  blocked: boolean
  pressure: 'overdue' | 'critical' | 'high' | 'watch'
}

export interface ProjectPlanningSummary {
  id: string
  name: string
  type: 'standard' | 'academic'
  openTasks: number
  unplannedTasks: number
  blockedTasks: number
  backlogMinutes: number
  dueNext30: number
  nextDeadline?: LocalDate
  examDate?: LocalDate
  weeksToExam?: number
  estimatedMinutesPerWeekToExam?: number
  weeklyTargetMinutes?: number
}

function dayDiff(from: LocalDate, to: LocalDate) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((new Date(ty, tm - 1, td, 12).getTime() - new Date(fy, fm - 1, fd, 12).getTime()) / 86_400_000)
}

export function activeBlockerIds(task: TaskEntity, taskMap: Map<string, TaskEntity>) {
  return (task.blockedByTaskIds ?? []).filter((id) => {
    return isActiveBlocker(taskMap.get(id))
  })
}

export function taskIsBlocked(task: TaskEntity, taskMap: Map<string, TaskEntity>) {
  return activeBlockerIds(task, taskMap).length > 0
}

export function filterTasksForSavedView(tasks: TaskEntity[], view: SavedTaskView, today: LocalDate) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const query = view.query?.trim().toLowerCase()
  const next7 = addLocalDays(today, 7)
  const next30 = addLocalDays(today, 30)
  return tasks.filter((task) => {
    if (task.deletedAt || task.parentTaskId || task.status === 'cancelled' || task.status === 'inbox') return false
    if (view.statusMode === 'open' && task.status !== 'todo') return false
    if (view.statusMode === 'completed' && task.status !== 'completed') return false
    if (query && !`${task.title} ${task.description}`.toLowerCase().includes(query)) return false
    if (view.projectIds?.length && (!task.projectId || !view.projectIds.includes(task.projectId))) return false
    if (view.priorities?.length && !view.priorities.includes(task.priority)) return false

    if (view.dateMode === 'today' && task.plannedDate !== today) return false
    if (view.dateMode === 'next7' && (!task.plannedDate || task.plannedDate < today || task.plannedDate > next7)) return false
    if (view.dateMode === 'next30' && (!task.plannedDate || task.plannedDate < today || task.plannedDate > next30)) return false
    if (view.dateMode === 'overdue' && (!task.plannedDate || task.plannedDate >= today || task.status !== 'todo')) return false
    if (view.dateMode === 'unplanned' && task.plannedDate) return false

    if (view.deadlineMode === 'overdue' && (!task.deadline || task.deadline >= today || task.status !== 'todo')) return false
    if (view.deadlineMode === 'next7' && (!task.deadline || task.deadline < today || task.deadline > next7)) return false
    if (view.deadlineMode === 'next30' && (!task.deadline || task.deadline < today || task.deadline > next30)) return false
    if (view.deadlineMode === 'none' && task.deadline) return false

    const blocked = taskIsBlocked(task, taskMap)
    if (view.blockMode === 'blocked' && !blocked) return false
    if (view.blockMode === 'ready' && blocked) return false
    return true
  }).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') || a.sortOrder - b.sortOrder)
}

export function buildForecast({ tasks, habits, capacities, today, defaultCapacity, days = 42 }: {
  tasks: TaskEntity[]
  habits: HabitEntity[]
  capacities: Map<LocalDate, number>
  today: LocalDate
  defaultCapacity: number
  days?: number
}) {
  const dates = localDateRange(today, days)
  const open = tasks.filter((task) => !task.deletedAt && !task.parentTaskId && task.status === 'todo')
  const dayRows: ForecastDay[] = dates.map((date) => {
    const dayTasks = open.filter((task) => task.plannedDate === date)
    const taskMinutes = dayTasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)
    const habitMinutes = habits.filter((habit) => habit.kind === 'duration' && habit.countsTowardCapacity && habit.schedule.type !== 'times-per-week' && habitScheduledForDate(habit, date)).reduce((sum, habit) => sum + habit.target, 0)
    const capacityMinutes = capacities.get(date) ?? defaultCapacity
    const totalMinutes = taskMinutes + habitMinutes
    return { date, taskMinutes, habitMinutes, capacityMinutes, totalMinutes, remainingMinutes: capacityMinutes - totalMinutes, deadlineCount: open.filter((task) => task.deadline === date).length }
  })

  const weeks: ForecastWeek[] = []
  const firstWeek = startOfLocalWeek(today)
  for (let offset = 0; offset < days + 7; offset += 7) {
    const start = addLocalDays(firstWeek, offset)
    const end = addLocalDays(start, 6)
    const weekDays = dayRows.filter((row) => row.date >= start && row.date <= end)
    if (!weekDays.length) continue
    const unplannedDeadlineMinutes = open.filter((task) => !task.plannedDate && task.deadline && task.deadline >= start && task.deadline <= end).reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)
    weeks.push({
      start, end,
      plannedMinutes: weekDays.reduce((sum, row) => sum + row.totalMinutes, 0),
      capacityMinutes: weekDays.reduce((sum, row) => sum + row.capacityMinutes, 0),
      overloadedDays: weekDays.filter((row) => row.remainingMinutes < 0).length,
      deadlineCount: open.filter((task) => task.deadline && task.deadline >= start && task.deadline <= end).length,
      unplannedDeadlineMinutes,
    })
  }
  return { days: dayRows, weeks }
}

export function buildDeadlinePressure(tasks: TaskEntity[], today: LocalDate): DeadlinePressureItem[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  return tasks
    .filter((task) => !task.deletedAt && !task.parentTaskId && task.status === 'todo' && task.deadline)
    .map((task) => {
      const daysLeft = dayDiff(today, task.deadline!)
      const blocked = taskIsBlocked(task, taskMap)
      const estimatedMinutes = task.estimatedMinutes ?? 0
      const pressure: DeadlinePressureItem['pressure'] = daysLeft < 0 ? 'overdue' : daysLeft <= 2 || (blocked && daysLeft <= 7) ? 'critical' : daysLeft <= 7 || (!task.plannedDate && daysLeft <= 14) ? 'high' : 'watch'
      return { id: task.id, title: task.title, projectId: task.projectId, deadline: task.deadline!, daysLeft, estimatedMinutes, plannedDate: task.plannedDate, blocked, pressure }
    })
    .filter((item) => item.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft || Number(b.blocked) - Number(a.blocked) || b.estimatedMinutes - a.estimatedMinutes)
}

export function buildProjectPlanningSummaries(tasks: TaskEntity[], projects: ProjectEntity[], today: LocalDate): ProjectPlanningSummary[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const horizon = addLocalDays(today, 30)
  return projects.filter((project) => !project.archived).map((project) => {
    const related = tasks.filter((task) => task.projectId === project.id && !task.deletedAt && !task.parentTaskId && task.status === 'todo')
    const deadlines = related.filter((task) => task.deadline).map((task) => task.deadline!).sort()
    const backlogMinutes = related.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)
    const daysToExam = project.examDate ? dayDiff(today, project.examDate) : undefined
    const weeksToExam = daysToExam !== undefined && daysToExam >= 0 ? Math.max(1, Math.ceil((daysToExam + 1) / 7)) : undefined
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      openTasks: related.length,
      unplannedTasks: related.filter((task) => !task.plannedDate).length,
      blockedTasks: related.filter((task) => taskIsBlocked(task, taskMap)).length,
      backlogMinutes,
      dueNext30: related.filter((task) => task.deadline && task.deadline >= today && task.deadline <= horizon).length,
      nextDeadline: deadlines[0],
      examDate: project.examDate,
      weeksToExam,
      estimatedMinutesPerWeekToExam: weeksToExam ? Math.ceil(backlogMinutes / weeksToExam) : undefined,
      weeklyTargetMinutes: project.weeklyTargetMinutes,
    }
  }).sort((a, b) => (a.nextDeadline ?? '9999').localeCompare(b.nextDeadline ?? '9999') || b.backlogMinutes - a.backlogMinutes)
}

export const BUILTIN_SAVED_VIEWS: SavedTaskView[] = [
  { id: 'builtin-deadlines', name: 'Deadline pressure', dateMode: 'all', deadlineMode: 'next30', blockMode: 'all', statusMode: 'open', createdAt: '', updatedAt: '' },
  { id: 'builtin-blocked', name: 'Blocked work', dateMode: 'all', deadlineMode: 'all', blockMode: 'blocked', statusMode: 'open', createdAt: '', updatedAt: '' },
  { id: 'builtin-unplanned', name: 'Unplanned backlog', dateMode: 'unplanned', deadlineMode: 'all', blockMode: 'all', statusMode: 'open', createdAt: '', updatedAt: '' },
  { id: 'builtin-high-priority', name: 'High priority', priorities: ['high', 'critical'], dateMode: 'all', deadlineMode: 'all', blockMode: 'all', statusMode: 'open', createdAt: '', updatedAt: '' },
]
