import { addLocalDays, localDateRange, startOfLocalWeek } from '../../domain/date'
import type { HabitEntity, LocalDate, ProjectEntity, TaskEntity } from '../../domain/models'
import { habitScheduledForDate } from '../../domain/habit'
import { isActiveBlocker } from './dependencyLogic'

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

