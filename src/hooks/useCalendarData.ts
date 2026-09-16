import { useLiveQuery } from 'dexie-react-hooks'
import type { LocalDate } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { taskToPreview } from '../adapters/uiAdapters'

export function useCalendarData(fromDate: LocalDate, throughDate: LocalDate) {
  return useLiveQuery(async () => {
    const [rootTasks, projectMap, blocks, defaultCapacity, plans] = await Promise.all([
      taskRepository.listRootTasks(),
      projectRepository.getMap(),
      timeBlockRepository.listBetween(fromDate, throughDate),
      settingsRepository.getDailyCapacityMinutes(),
      dailyPlanRepository.listRange(fromDate, throughDate),
    ])
    const relevantTasks = rootTasks.filter((task) => !task.deletedAt && (task.status === 'todo' || task.status === 'completed'))
    const rangeTasks = relevantTasks.filter((task) => task.plannedDate && task.plannedDate >= fromDate && task.plannedDate <= throughDate)
    const taskBlocks = await timeBlockRepository.listForTaskIds(rangeTasks.map((task) => task.id))
    const tasks = relevantTasks.map((task) => taskToPreview(task, projectMap))
    return {
      blocks,
      allTaskBlocks: taskBlocks,
      tasks,
      taskMap: new Map(tasks.map((task) => [task.id, task])),
      defaultCapacity,
      capacityByDate: new Map(plans.map((plan) => [plan.date, plan.capacityMinutes ?? defaultCapacity])),
    }
  }, [fromDate, throughDate])
}
