import type { LocalDate } from '../../domain/models'
import type { HabitPreview, TaskPreview } from '../../types/ui'

export interface PlannerDaySummary {
  date: LocalDate
  tasks: TaskPreview[]
  deadlines: TaskPreview[]
  habits: HabitPreview[]
  capacityMinutes: number
  taskMinutes: number
  habitMinutes: number
  plannedMinutes: number
  remainingMinutes: number
  openTasks: number
  completedTasks: number
  dueOpenTasks: number
  planStatus: 'draft' | 'committed'
}

export interface WeekBalanceSuggestion {
  taskId: string
  taskTitle: string
  fromDate: LocalDate
  toDate: LocalDate
  minutes: number
  reason: string
}

export interface WeekPlanningSuggestion {
  taskId: string
  taskTitle: string
  deadline?: LocalDate
  suggestedDate: LocalDate
  minutes: number
  reason: string
}

export function summarizePlannerDay(input: {
  date: LocalDate
  tasks: TaskPreview[]
  deadlines?: TaskPreview[]
  habits: HabitPreview[]
  capacityMinutes: number
  planStatus?: 'draft' | 'committed'
}): PlannerDaySummary {
  const open = input.tasks.filter((task) => !task.completed)
  const deadlines = input.deadlines ?? []
  const taskMinutes = open.reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0)
  const habitMinutes = input.habits
    .filter((habit) => habit.countsTowardCapacity && !habit.completed)
    .reduce((sum, habit) => sum + Math.max(0, (habit.target ?? 0) - (habit.currentValue ?? 0)), 0)
  const plannedMinutes = taskMinutes + habitMinutes
  return {
    date: input.date,
    tasks: input.tasks,
    deadlines,
    habits: input.habits,
    capacityMinutes: input.capacityMinutes,
    taskMinutes,
    habitMinutes,
    plannedMinutes,
    remainingMinutes: input.capacityMinutes - plannedMinutes,
    openTasks: open.length,
    completedTasks: input.tasks.length - open.length,
    dueOpenTasks: deadlines.filter((task) => !task.completed).length,
    planStatus: input.planStatus ?? 'draft',
  }
}

function bucketRank(task: TaskPreview): number {
  if (task.planningBucket === 'optional') return 0
  if (task.planningBucket === 'planned') return 1
  return 2
}

function movable(task: TaskPreview, fromDate: LocalDate) {
  if (task.completed) return false
  if (task.planningBucket === 'must') return false
  if (task.deadline && task.deadline <= fromDate) return false
  return true
}

export function suggestWeekBalance(days: PlannerDaySummary[], today: LocalDate): WeekBalanceSuggestion | undefined {
  const overloaded = days
    .filter((day) => day.remainingMinutes < 0 && day.date >= today)
    .sort((a, b) => a.remainingMinutes - b.remainingMinutes)[0]
  if (!overloaded) return undefined

  const candidates = overloaded.tasks
    .filter((task) => movable(task, overloaded.date) && (task.durationMinutes ?? 0) > 0)
    .sort((a, b) => bucketRank(a) - bucketRank(b) || (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))

  for (const task of candidates) {
    const minutes = task.durationMinutes ?? 0
    const destinations = days
      .filter((day) => day.date !== overloaded.date && day.date >= today && (!task.deadline || day.date <= task.deadline) && day.remainingMinutes >= minutes)
      .sort((a, b) => {
        const aFuture = a.date > overloaded.date ? 0 : 1
        const bFuture = b.date > overloaded.date ? 0 : 1
        return aFuture - bFuture || a.date.localeCompare(b.date)
      })
    const target = destinations[0]
    if (!target) continue
    return {
      taskId: task.id,
      taskTitle: task.title,
      fromDate: overloaded.date,
      toDate: target.date,
      minutes,
      reason: task.planningBucket === 'optional'
        ? 'Optional work is the safest item to move.'
        : 'This lower-commitment task fits a less loaded day.',
    }
  }
  return undefined
}

export function suggestWeekPlacement(task: TaskPreview, days: PlannerDaySummary[], today: LocalDate): WeekPlanningSuggestion | undefined {
  if (task.completed || task.status !== 'todo') return undefined
  const minutes = task.durationMinutes ?? 0
  const allowed = days
    .filter((day) => day.date >= today && (!task.deadline || day.date <= task.deadline))
    .sort((a, b) => {
      const aFits = a.remainingMinutes >= minutes ? 0 : 1
      const bFits = b.remainingMinutes >= minutes ? 0 : 1
      if (aFits !== bFits) return aFits - bFits
      return b.remainingMinutes - a.remainingMinutes || a.date.localeCompare(b.date)
    })
  const target = allowed[0]
  if (!target) return undefined
  const reason = task.deadline
    ? `Due ${task.deadline}; this is the best available day before the deadline.`
    : target.remainingMinutes >= minutes
      ? 'Fits the remaining capacity on this day.'
      : 'No day fully fits; this is the least loaded option.'
  return { taskId: task.id, taskTitle: task.title, deadline: task.deadline, suggestedDate: target.date, minutes, reason }
}

export function totalWeekCapacity(days: PlannerDaySummary[]) {
  return days.reduce((sum, day) => sum + day.capacityMinutes, 0)
}

export function totalWeekPlanned(days: PlannerDaySummary[]) {
  return days.reduce((sum, day) => sum + day.plannedMinutes, 0)
}

export function plannerLoadLabel(day: PlannerDaySummary) {
  if (day.plannedMinutes === 0) return 'open'
  if (day.remainingMinutes < 0) return 'overloaded'
  const ratio = day.capacityMinutes ? day.plannedMinutes / day.capacityMinutes : 1
  if (ratio >= 0.85) return 'full'
  if (ratio >= 0.5) return 'steady'
  return 'light'
}
