import { dateTimeForDisplay, localDateKey, relativeDateLabel } from '../domain/date'
import type { ListEntity, ProjectEntity, SectionEntity, TagEntity, TaskEntity, TimeBlockEntity } from '../domain/models'
import { habitScheduleLabel } from '../domain/habit'
import type { HabitWithEntry } from '../repositories/habitRepository'
import type { HabitPreview, SchedulePreview, TaskPreview } from '../types/ui'

export function taskToPreview(
  task: TaskEntity,
  projects: Map<string, ProjectEntity>,
  children: TaskEntity[] = [],
  tasks?: Map<string, TaskEntity>,
  organization?: { lists: Map<string, ListEntity>; sections: Map<string, SectionEntity>; tags: Map<string, TagEntity> },
): TaskPreview {
  const checklist = task.checklist ?? []
  const progressUnits = children.length + checklist.length
  const completedUnits = children.filter((child) => child.status === 'completed').length + checklist.filter((item) => item.completed).length
  const automaticProgress = task.status === 'completed' ? 100 : progressUnits ? Math.round((completedUnits / progressUnits) * 100) : 0
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    project: task.projectId ? projects.get(task.projectId)?.name : undefined,
    projectId: task.projectId,
    list: task.listId ? organization?.lists.get(task.listId)?.name : undefined,
    listId: task.listId,
    section: task.sectionId ? organization?.sections.get(task.sectionId)?.name : undefined,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    meta: relativeDateLabel(task.deadline),
    durationMinutes: task.estimatedMinutes,
    tags: task.tagIds?.length
      ? task.tagIds.map((id) => organization?.tags.get(id)?.name).filter((name): name is string => Boolean(name))
      : (task.tags ?? []),
    tagIds: task.tagIds ?? [],
    checklist,
    progressMode: task.progressMode ?? 'auto',
    progressPercent: task.progressMode === 'manual' ? (task.progressPercent ?? 0) : automaticProgress,
    sourceUrl: task.sourceUrl,
    location: task.location,
    pinned: task.pinned ?? false,
    comments: task.comments ?? [],
    activity: task.activity ?? [],
    priority: task.priority,
    completed: task.status === 'completed',
    plannedDate: task.plannedDate,
    deadline: task.deadline,
    timelineStart: task.timelineStart,
    timelineEnd: task.timelineEnd,
    timelineMilestone: task.timelineMilestone,
    status: task.status,
    rescheduleCount: task.rescheduleCount ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
    subtaskTotal: children.length,
    subtaskCompleted: children.filter((child) => child.status === 'completed').length,
    seriesId: task.seriesId,
    recurrenceDate: task.recurrenceDate,
    blockedByTaskIds: task.blockedByTaskIds ?? [],
    activeBlockerCount: tasks ? (task.blockedByTaskIds ?? []).filter((id) => { const blocker = tasks.get(id); return Boolean(blocker && !blocker.deletedAt && blocker.status !== 'completed' && blocker.status !== 'cancelled') }).length : 0,
    blockedByTitles: tasks ? (task.blockedByTaskIds ?? []).map((id) => tasks.get(id)).filter((blocker) => Boolean(blocker && !blocker.deletedAt && blocker.status !== 'completed' && blocker.status !== 'cancelled')).map((blocker) => blocker!.title) : [],
  }
}

export function habitToPreview(habit: HabitWithEntry): HabitPreview {
  return {
    id: habit.id,
    title: habit.title,
    description: habit.description,
    kind: habit.kind,
    completed: habit.completed,
    skipped: habit.skipped,
    progress: habit.kind === 'duration' ? `${habit.currentValue} / ${habit.target}m` : undefined,
    countsTowardCapacity: habit.countsTowardCapacity,
    target: habit.target,
    currentValue: habit.currentValue,
    scheduleLabel: habitScheduleLabel(habit),
    archived: habit.archived,
  }
}

export function timeBlockToPreview(block: TimeBlockEntity): SchedulePreview {
  const durationMinutes = Math.max(0, Math.round((new Date(block.end).getTime() - new Date(block.start).getTime()) / 60_000))
  return {
    id: block.id,
    kind: block.kind,
    taskId: block.taskId,
    time: dateTimeForDisplay(block.start),
    date: localDateKey(new Date(block.start)),
    start: block.start,
    end: block.end,
    name: block.title,
    durationMinutes,
  }
}
