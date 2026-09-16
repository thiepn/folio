import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localMonthGrid, localDateRange } from '../domain/date'
import type { DailyPlanBucket, LocalDate, TaskEntity } from '../domain/models'
import { habitToPreview, taskToPreview } from '../adapters/uiAdapters'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { habitRepository } from '../repositories/habitRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { summarizePlannerDay } from '../features/planner/plannerLogic'

function defaultBucket(task: TaskEntity): DailyPlanBucket {
  return task.priority === 'critical' || task.priority === 'high' ? 'must' : 'planned'
}

function priorityRank(task: TaskEntity) {
  if (task.priority === 'critical') return 0
  if (task.priority === 'high') return 1
  return 2
}

export function usePlannerData(weekStart: LocalDate, today: LocalDate, selectedDate: LocalDate = today) {
  return useLiveQuery(async () => {
    const weekDates = localDateRange(weekStart, 7)
    const weekEnd = weekDates[6]
    const monthDates = localMonthGrid(selectedDate)
    const monthStart = monthDates[0]
    const monthEnd = monthDates[monthDates.length - 1]
    const rangeDates = [...new Set([...weekDates, ...monthDates, selectedDate])].sort()
    const rangeStart = rangeDates[0]
    const rangeEnd = rangeDates[rangeDates.length - 1]
    const upcomingEnd = addLocalDays(today, 45)

    const [rootTasks, projectMap, defaultCapacity, plans, planItems, habitsByDate] = await Promise.all([
      taskRepository.listRootTasks(),
      projectRepository.getMap(),
      settingsRepository.getDailyCapacityMinutes(),
      dailyPlanRepository.listRange(rangeStart, rangeEnd),
      dailyPlanRepository.listItemsRange(rangeStart, rangeEnd),
      habitRepository.listForDates(rangeDates),
    ])

    const planMap = new Map(plans.map((plan) => [plan.date, plan]))
    const taskMap = new Map(rootTasks.map((task) => [task.id, task]))
    const itemMap = new Map(planItems.map((item) => [`${item.date}:${item.taskId}`, item]))
    const preview = (task: TaskEntity, date?: LocalDate) => {
      const base = taskToPreview(task, projectMap, [], taskMap)
      if (!date) return base
      const item = itemMap.get(`${date}:${task.id}`)
      return {
        ...base,
        planningBucket: item?.bucket ?? defaultBucket(task),
        planningOrder: item?.sortOrder ?? task.sortOrder,
      }
    }

    const relevantTasks = rootTasks.filter((task) => task.status === 'todo' || task.status === 'completed')
    const open = rootTasks.filter((task) => task.status === 'todo')

    const summarizeDate = (date: LocalDate) => {
      const tasks = relevantTasks
        .filter((task) => task.plannedDate === date)
        .map((task) => preview(task, date))
        .sort((a, b) => (a.planningOrder ?? 0) - (b.planningOrder ?? 0))
      const deadlines = relevantTasks
        .filter((task) => task.deadline === date)
        .map((task) => preview(task))
        .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.planningOrder ?? 0) - (b.planningOrder ?? 0))
      const habits = (habitsByDate.get(date) ?? []).map(habitToPreview)
      const plan = planMap.get(date)
      return summarizePlannerDay({
        date,
        tasks,
        deadlines,
        habits,
        capacityMinutes: plan?.capacityMinutes ?? defaultCapacity,
        planStatus: plan?.status,
      })
    }

    const days = weekDates.map(summarizeDate)
    const selectedDay = summarizeDate(selectedDate)
    const monthDays = monthDates.map(summarizeDate)

    const upcoming = open
      .filter((task) => task.plannedDate && task.plannedDate >= today && task.plannedDate <= upcomingEnd)
      .map((task) => preview(task))
      .sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || (a.planningOrder ?? 0) - (b.planningOrder ?? 0))
    const overdue = open
      .filter((task) => task.plannedDate && task.plannedDate < today)
      .map((task) => preview(task))
      .sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? ''))
    const deadlineOnly = open
      .filter((task) => !task.plannedDate && task.deadline && task.deadline >= today && task.deadline <= upcomingEnd)
      .map((task) => preview(task))
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    const deadlineOnlyIds = new Set(deadlineOnly.map((task) => task.id))
    const unplanned = open
      .filter((task) => !task.plannedDate && !deadlineOnlyIds.has(task.id))
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || priorityRank(a) - priorityRank(b) || a.sortOrder - b.sortOrder)
      .map((task) => preview(task))
    const backlog = open
      .filter((task) => !task.plannedDate)
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || priorityRank(a) - priorityRank(b) || a.sortOrder - b.sortOrder)
      .map((task) => preview(task))
    const weekUnplannedDue = open
      .filter((task) => !task.plannedDate && task.deadline && task.deadline >= weekStart && task.deadline <= weekEnd)
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || priorityRank(a) - priorityRank(b))
      .map((task) => preview(task))

    return {
      weekStart,
      weekEnd,
      weekDates,
      days,
      selectedDate,
      selectedDay,
      monthStart,
      monthEnd,
      monthDates,
      monthDays,
      upcoming,
      overdue,
      unplanned,
      backlog,
      deadlineOnly,
      weekUnplannedDue,
      defaultCapacity,
    }
  }, [weekStart, today, selectedDate])
}
