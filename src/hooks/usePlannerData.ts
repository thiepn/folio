import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateRange } from '../domain/date'
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

export function usePlannerData(weekStart: LocalDate, today: LocalDate) {
  return useLiveQuery(async () => {
    const weekDates = localDateRange(weekStart, 7)
    const weekEnd = weekDates[6]
    const upcomingEnd = addLocalDays(today, 30)
    const [rootTasks, projectMap, defaultCapacity, plans, planItems, habitsByDate] = await Promise.all([
      taskRepository.listRootTasks(),
      projectRepository.getMap(),
      settingsRepository.getDailyCapacityMinutes(),
      dailyPlanRepository.listRange(weekStart, weekEnd),
      dailyPlanRepository.listItemsRange(weekStart, weekEnd),
      habitRepository.listForDates(weekDates),
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

    const days = weekDates.map((date) => {
      const tasks = rootTasks
        .filter((task) => task.plannedDate === date && (task.status === 'todo' || task.status === 'completed'))
        .map((task) => preview(task, date))
        .sort((a, b) => (a.planningOrder ?? 0) - (b.planningOrder ?? 0))
      const habits = (habitsByDate.get(date) ?? []).map(habitToPreview)
      const plan = planMap.get(date)
      return summarizePlannerDay({
        date,
        tasks,
        habits,
        capacityMinutes: plan?.capacityMinutes ?? defaultCapacity,
        planStatus: plan?.status,
      })
    })

    const open = rootTasks.filter((task) => task.status === 'todo')
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
      .map((task) => preview(task))

    return { weekStart, weekEnd, weekDates, days, upcoming, overdue, unplanned, deadlineOnly, defaultCapacity }
  }, [weekStart, today])
}
