import { addLocalDays, localDateToDate } from '../domain/date'
import type { LocalDate } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { recurrenceService } from './recurrenceService'
import type { UndoableMutation } from './undo'

function dayDifference(from: LocalDate, to: LocalDate) {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

function normalizedSpan(start?: LocalDate, end?: LocalDate, milestone = false) {
  if (!start) return { timelineStart: null as LocalDate | null, timelineEnd: null as LocalDate | null, timelineMilestone: false }
  const safeEnd = milestone ? start : (end ?? start)
  if (safeEnd < start) throw new Error('Timeline end must not be before timeline start.')
  return { timelineStart: start, timelineEnd: safeEnd, timelineMilestone: milestone }
}

async function updateWithOccurrence(taskId: string, changes: ReturnType<typeof normalizedSpan>): Promise<UndoableMutation> {
  const task = await taskRepository.get(taskId)
  if (!task) throw new Error('Task not found.')
  const before = { ...task }
  await taskRepository.update(taskId, changes)
  let exceptionUndo: UndoableMutation | null = null
  try {
    if (task.seriesId && task.recurrenceDate) exceptionUndo = await recurrenceService.recordOccurrenceException(taskId, changes)
  } catch (error) {
    await taskRepository.replace(before)
    throw error
  }
  return {
    message: changes.timelineStart ? (changes.timelineMilestone ? 'Timeline milestone set' : 'Timeline span updated') : 'Task removed from timeline',
    undo: async () => {
      if (exceptionUndo) await exceptionUndo.undo()
      await taskRepository.replace(before)
    },
  }
}

export const timelineService = {
  async setSpan(taskId: string, start: LocalDate, end?: LocalDate, milestone = false) {
    return updateWithOccurrence(taskId, normalizedSpan(start, end, milestone))
  },

  async clear(taskId: string) {
    return updateWithOccurrence(taskId, normalizedSpan())
  },

  async shift(taskId: string, days: number) {
    const task = await taskRepository.get(taskId)
    if (!task?.timelineStart) throw new Error('Task is not placed on the timeline.')
    const end = task.timelineEnd ?? task.timelineStart
    const start = addLocalDays(task.timelineStart, days)
    return updateWithOccurrence(taskId, normalizedSpan(start, addLocalDays(end, days), task.timelineMilestone))
  },

  async resizeStart(taskId: string, start: LocalDate) {
    const task = await taskRepository.get(taskId)
    if (!task?.timelineStart) throw new Error('Task is not placed on the timeline.')
    const end = task.timelineMilestone ? start : (task.timelineEnd ?? task.timelineStart)
    return updateWithOccurrence(taskId, normalizedSpan(start, end < start ? start : end, task.timelineMilestone))
  },

  async resizeEnd(taskId: string, end: LocalDate) {
    const task = await taskRepository.get(taskId)
    if (!task?.timelineStart) throw new Error('Task is not placed on the timeline.')
    return updateWithOccurrence(taskId, normalizedSpan(task.timelineStart, end < task.timelineStart ? task.timelineStart : end, task.timelineMilestone))
  },

  async toggleMilestone(taskId: string) {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    const start = task.timelineStart ?? task.plannedDate ?? task.deadline
    if (!start) throw new Error('Choose a timeline date before making this a milestone.')
    return updateWithOccurrence(taskId, normalizedSpan(start, task.timelineEnd, !task.timelineMilestone))
  },

  durationDays(taskId: string) {
    return taskRepository.get(taskId).then((task) => task?.timelineStart ? dayDifference(task.timelineStart, task.timelineEnd ?? task.timelineStart) + 1 : 0)
  },
}
