import { useLiveQuery } from 'dexie-react-hooks'
import type { LocalDate, TaskEntity } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { organizationRepository } from '../repositories/organizationRepository'
import { reminderRepository } from '../repositories/reminderRepository'
import { savedViewService } from '../services/savedViewService'
import { BUILTIN_SMART_VIEWS, runSmartView } from '../features/smartViews/queryEngine'
import { taskToPreview } from '../adapters/uiAdapters'

export function useCalendarData(fromDate: LocalDate, throughDate: LocalDate, timeZone = 'local') {
  return useLiveQuery(async () => {
    const [
      taskSnapshot, projectMap, projects, blocks, defaultCapacity, plans,
      lists, sections, tags, customSmartViews, reminders, reminderOccurrences,
    ] = await Promise.all([
      taskRepository.listAll(),
      projectRepository.getMap(),
      projectRepository.listAll(),
      timeBlockRepository.listBetween(fromDate, throughDate, timeZone),
      settingsRepository.getDailyCapacityMinutes(),
      dailyPlanRepository.listRange(fromDate, throughDate),
      organizationRepository.listLists(true),
      organizationRepository.listSections(true),
      organizationRepository.listTags(true),
      savedViewService.list(),
      reminderRepository.listDefinitions(),
      reminderRepository.listAllOccurrences(),
    ])

    const activeTasks = taskSnapshot.filter((task) => !task.deletedAt && task.status !== 'cancelled')
    const taskMap = new Map(activeTasks.map((task) => [task.id, task]))
    const children = new Map<string, TaskEntity[]>()
    for (const task of activeTasks) {
      if (!task.parentTaskId) continue
      const list = children.get(task.parentTaskId) ?? []
      list.push(task)
      children.set(task.parentTaskId, list)
    }
    const organizationMaps = {
      lists: new Map(lists.map((list) => [list.id, list])),
      sections: new Map(sections.map((section) => [section.id, section])),
      tags: new Map(tags.map((tag) => [tag.id, tag])),
    }
    const previews = activeTasks.map((task) => taskToPreview(task, projectMap, children.get(task.id) ?? [], taskMap, organizationMaps))
    const previewMap = new Map(previews.map((task) => [task.id, task]))
    const allTaskBlocks = await timeBlockRepository.listForTaskIds(activeTasks.map((task) => task.id))

    const smartContext = {
      today: fromDate,
      tasks: activeTasks,
      projects,
      lists,
      sections,
      tags,
      reminders,
      reminderOccurrences,
    }
    const smartViews = [...BUILTIN_SMART_VIEWS, ...customSmartViews]
    const smartViewTaskIds = Object.fromEntries(smartViews.map((view) => [
      view.id,
      runSmartView(view, smartContext).map((task) => task.id),
    ]))

    return {
      blocks,
      allTaskBlocks,
      tasks: previews,
      taskMap: previewMap,
      taskEntities: activeTasks,
      defaultCapacity,
      capacityByDate: new Map(plans.map((plan) => [plan.date, plan.capacityMinutes ?? defaultCapacity])),
      smartViews,
      smartViewTaskIds,
      timeZones: [...new Set(blocks.map((block) => block.timeZone).filter((value): value is string => Boolean(value)))],
    }
  }, [fromDate, throughDate, timeZone])
}
