import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey } from '../domain/date'
import { taskRepository } from '../repositories/taskRepository'
import { buildProjectSummaries, projectRepository } from '../repositories/projectRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { recurrenceRepository } from '../repositories/recurrenceRepository'
import { organizationRepository } from '../repositories/organizationRepository'
import { taskToPreview, timeBlockToPreview } from '../adapters/uiAdapters'
import type { DailyPlanBucket, TaskEntity } from '../domain/models'

function defaultBucket(task: TaskEntity): DailyPlanBucket {
  return task.priority === 'critical' || task.priority === 'high' ? 'must' : 'planned'
}

function active(task: TaskEntity) { return !task.deletedAt && task.status !== 'cancelled' }
function root(task: TaskEntity) { return !task.parentTaskId }
function byOrder(a: TaskEntity, b: TaskEntity) { return a.sortOrder - b.sortOrder }

export function useAppData() {
  const today = localDateKey()
  const tomorrow = addLocalDays(today, 1)

  return useLiveQuery(async () => {
    const deadlineHorizon = addLocalDays(today, 7)
    const [
      taskSnapshot, projectEntities, timeBlocks, allTimeBlocks,
      defaultCapacity, dailyPlan, dailyPlanItems, recurringSeries,
      folders, lists, sections, tags, allFolders, allLists, allTags,
    ] = await Promise.all([
      // One Task table snapshot feeds Today, Next, Later, Inbox, projects and history.
      taskRepository.listSnapshot(),
      projectRepository.listAll(),
      timeBlockRepository.listForDate(today),
      timeBlockRepository.listAll(),
      settingsRepository.getDailyCapacityMinutes(),
      dailyPlanRepository.get(today),
      dailyPlanRepository.listItems(today),
      recurrenceRepository.listAll(),
      organizationRepository.listFolders(),
      organizationRepository.listLists(),
      organizationRepository.listSections(),
      organizationRepository.listTags(),
      organizationRepository.listFolders(true),
      organizationRepository.listLists(true),
      organizationRepository.listTags(true),
    ])

    const projects = buildProjectSummaries(projectEntities, taskSnapshot)
    const allProjectSummaries = buildProjectSummaries(projectEntities, taskSnapshot, true)
    const projectMap = new Map(projectEntities.map((project) => [project.id, project]))
    const listMap = new Map(lists.map((list) => [list.id, list]))
    const sectionMap = new Map(sections.map((section) => [section.id, section]))
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
    const organizationMaps = { lists: listMap, sections: sectionMap, tags: tagMap }

    const activeTasks = taskSnapshot.filter(active)
    const roots = activeTasks.filter(root)
    const childMap = new Map<string, TaskEntity[]>()
    for (const task of activeTasks) {
      if (!task.parentTaskId) continue
      const list = childMap.get(task.parentTaskId) ?? []
      list.push(task)
      childMap.set(task.parentTaskId, list)
    }
    const taskMap = new Map(activeTasks.map((task) => [task.id, task]))
    const preview = (task: TaskEntity) => taskToPreview(task, projectMap, childMap.get(task.id) ?? [], taskMap, organizationMaps)

    const todayTasks = roots.filter((task) => task.plannedDate === today && (task.status === 'todo' || task.status === 'completed')).sort(byOrder)
    const nextTasks = roots.filter((task) => task.status === 'todo' && task.plannedDate === tomorrow).sort(byOrder)
    const laterTasks = roots.filter((task) => task.status === 'todo' && !task.plannedDate).sort(byOrder)
    const inboxTasks = roots.filter((task) => task.status === 'inbox').sort(byOrder)
    const openTasks = roots.filter((task) => task.status === 'todo' || task.status === 'inbox').sort(byOrder)
    const carryoverTasks = roots.filter((task) => task.status === 'todo' && task.plannedDate && task.plannedDate < today).sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || byOrder(a, b))
    const upcomingDeadlineTasks = roots.filter((task) => task.status === 'todo' && task.deadline && task.deadline >= today && task.deadline <= deadlineHorizon).sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || byOrder(a, b))
    const snapshotMap = new Map(taskSnapshot.map((task) => [task.id, task]))
    const trashTasks = taskSnapshot.filter((task) => Boolean(task.deletedAt) && (!task.parentTaskId || !snapshotMap.get(task.parentTaskId)?.deletedAt)).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))

    const planItemMap = new Map(dailyPlanItems.map((item) => [item.taskId, item]))
    const todayPreview = todayTasks
      .map((task) => {
        const item = planItemMap.get(task.id)
        return {
          ...preview(task),
          planningBucket: item?.bucket ?? defaultBucket(task),
          planningOrder: item?.sortOrder ?? task.sortOrder,
        }
      })
      .sort((a, b) => (a.planningOrder ?? 0) - (b.planningOrder ?? 0))

    return {
      today,
      tomorrow,
      todayTasks: todayPreview,
      nextTasks: nextTasks.map(preview),
      laterTasks: laterTasks.map(preview),
      carryoverTasks: carryoverTasks.map(preview),
      upcomingDeadlineTasks: upcomingDeadlineTasks.map(preview),
      inboxTasks: inboxTasks.map(preview),
      openTasks: openTasks.map(preview),
      allTasks: roots.map(preview),
      subtasks: activeTasks.filter((task) => Boolean(task.parentTaskId)).map((task) => taskToPreview(task, projectMap, childMap.get(task.id) ?? [], taskMap, organizationMaps)),
      trashTasks: trashTasks.map((task) => taskToPreview(task, projectMap, [], taskMap, organizationMaps)),
      projects,
      archivedProjects: allProjectSummaries.filter((project) => project.archived),
      favoriteProjects: projects.filter((project) => project.favorite),
      unassignedCount: roots.filter((task) => !task.projectId && task.status === 'todo').length,
      timeBlocks: timeBlocks.map(timeBlockToPreview),
      allTimeBlocks: allTimeBlocks.map(timeBlockToPreview),
      defaultCapacity,
      capacity: dailyPlan?.capacityMinutes ?? defaultCapacity,
      dailyPlanStatus: dailyPlan?.status ?? 'draft',
      dailyPlanCommittedAt: dailyPlan?.committedAt,
      recurringSeries,
      folders,
      lists,
      sections,
      tags,
      favoriteLists: lists.filter((list) => list.favorite),
      favoriteTags: tags.filter((tag) => tag.favorite),
      archivedFolders: allFolders.filter((folder) => folder.archived),
      archivedLists: allLists.filter((list) => list.archived),
      archivedTags: allTags.filter((tag) => tag.archived),
      unlistedCount: roots.filter((task) => task.status === 'todo' && !task.listId).length,
      tagCounts: Object.fromEntries(tags.map((tag) => [tag.id, roots.filter((task) => task.status === 'todo' && task.tagIds?.includes(tag.id)).length])),
      listCounts: Object.fromEntries(lists.map((list) => [list.id, roots.filter((task) => task.status === 'todo' && task.listId === list.id).length])),
    }
  }, [today, tomorrow])
}
