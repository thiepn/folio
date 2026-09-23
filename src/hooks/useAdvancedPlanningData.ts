import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateRange } from '../domain/date'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { habitRepository } from '../repositories/habitRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { buildDeadlinePressure, buildForecast, buildProjectPlanningSummaries } from '../features/planner/advancedPlanning'
import { taskToPreview } from '../adapters/uiAdapters'

export function useAdvancedPlanningData(today: string) {
  return useLiveQuery(async () => {
    const through = addLocalDays(today, 41)
    const [tasks, projects, habits, plans, defaultCapacity] = await Promise.all([
      taskRepository.listRootTasks(),
      projectRepository.listActive(),
      habitRepository.listActive(),
      dailyPlanRepository.listRange(today, through),
      settingsRepository.getDailyCapacityMinutes(),
    ])
    const capacities = new Map(plans.map((plan) => [plan.date, plan.capacityMinutes ?? defaultCapacity]))
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const forecast = buildForecast({ tasks, habits, capacities, today, defaultCapacity, days: localDateRange(today, 42).length })
    return {
      tasks,
      taskPreviews: tasks.map((task) => taskToPreview(task, projectMap, [], taskMap)),
      projects,
      habits,
      defaultCapacity,
      forecast,
      deadlinePressure: buildDeadlinePressure(tasks, today),
      projectSummaries: buildProjectPlanningSummaries(tasks, projects, today),
    }
  }, [today])
}
