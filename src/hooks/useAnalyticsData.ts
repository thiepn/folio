import { useLiveQuery } from 'dexie-react-hooks'
import type { LocalDate } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { habitRepository } from '../repositories/habitRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { addLocalDays } from '../domain/date'
import { buildAnalyticsSnapshot } from '../features/analytics/analyticsLogic'

function dayCount(from:LocalDate,through:LocalDate){return Math.max(1,Math.round((new Date(`${through}T12:00:00`).getTime()-new Date(`${from}T12:00:00`).getTime())/86_400_000)+1)}

export function useAnalyticsData(fromDate:LocalDate,throughDate:LocalDate){
  return useLiveQuery(async()=>{
    const previousThrough=addLocalDays(fromDate,-1)
    const previousFrom=addLocalDays(previousThrough,-(dayCount(fromDate,throughDate)-1))
    const [tasks,projects,focusSessions,activeHabits,archivedHabits,habitEntries,dailyPlans,dailyPlanItems,timeBlocks,defaultCapacity]=await Promise.all([
      taskRepository.listSnapshot(),
      projectRepository.listAll(),
      focusSessionRepository.listAll(),
      habitRepository.listActive(),
      habitRepository.listArchived(),
      habitRepository.listAllEntries(),
      dailyPlanRepository.listRange(previousFrom,throughDate),
      dailyPlanRepository.listItemsRange(previousFrom,throughDate),
      timeBlockRepository.listBetween(previousFrom,throughDate),
      settingsRepository.getDailyCapacityMinutes(),
    ])
    return buildAnalyticsSnapshot({tasks,projects,focusSessions,habits:[...activeHabits,...archivedHabits],habitEntries,dailyPlans,dailyPlanItems,timeBlocks,defaultCapacity},fromDate,throughDate)
  },[fromDate,throughDate])
}
