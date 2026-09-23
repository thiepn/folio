import { db } from '../db/database'
import { addLocalDays } from '../domain/date'
import type { DailyPlanBucket, LocalDate, TaskEntity } from '../domain/models'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { taskRepository } from '../repositories/taskRepository'
import type { UndoableMutation } from './undo'
import { recurrenceService } from './recurrenceService'

function defaultBucket(task: TaskEntity): DailyPlanBucket {
  return task.priority === 'critical' || task.priority === 'high' ? 'must' : 'planned'
}

export const dailyPlanningService = {
  async markDraft(date: LocalDate): Promise<void> {
    await dailyPlanRepository.reopen(date)
  },

  async setBucket(taskId: string, date: LocalDate, bucket: DailyPlanBucket): Promise<UndoableMutation> {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    const id = `${date}:${taskId}`
    const previous = await db.dailyPlanItems.get(id)
    const previousPlan = await dailyPlanRepository.get(date)
    await dailyPlanRepository.setBucket(date, taskId, bucket, task.sortOrder)
    await dailyPlanRepository.reopen(date)
    return {
      message: `Moved to ${bucket}`,
      undo: async () => {
        if (previous) await db.dailyPlanItems.put(previous)
        else await db.dailyPlanItems.delete(id)
        if (previousPlan) await db.dailyPlans.put(previousPlan)
        else await db.dailyPlans.delete(date)
      },
    }
  },

  async moveWithinBucket(taskId: string, date: LocalDate, direction: -1 | 1): Promise<UndoableMutation | null> {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    const allTasks = await taskRepository.listToday(date)
    const items = await dailyPlanRepository.listItems(date)
    const itemMap = new Map(items.map((item) => [item.taskId, item]))
    const bucket = itemMap.get(taskId)?.bucket ?? defaultBucket(task)
    const inBucket = allTasks
      .filter((candidate) => candidate.status !== 'completed' && (itemMap.get(candidate.id)?.bucket ?? defaultBucket(candidate)) === bucket)
      .sort((a, b) => (itemMap.get(a.id)?.sortOrder ?? a.sortOrder) - (itemMap.get(b.id)?.sortOrder ?? b.sortOrder))
    const index = inBucket.findIndex((candidate) => candidate.id === taskId)
    const target = inBucket[index + direction]
    if (index < 0 || !target) return null
    const currentItem = itemMap.get(task.id)
    const targetItem = itemMap.get(target.id)
    const currentOrder = currentItem?.sortOrder ?? task.sortOrder
    const targetOrder = targetItem?.sortOrder ?? target.sortOrder
    const previousCurrent = currentItem ? { ...currentItem } : undefined
    const previousTarget = targetItem ? { ...targetItem } : undefined
    const previousPlan = await dailyPlanRepository.get(date)
    await db.transaction('rw', db.dailyPlanItems, db.dailyPlans, async () => {
      await dailyPlanRepository.upsertItem(date, task.id, bucket, targetOrder)
      await dailyPlanRepository.upsertItem(date, target.id, bucket, currentOrder)
      await dailyPlanRepository.reopen(date)
    })
    return {
      message: 'Task order changed',
      undo: async () => {
        await db.transaction('rw', db.dailyPlanItems, db.dailyPlans, async () => {
          if (previousCurrent) await db.dailyPlanItems.put(previousCurrent); else await db.dailyPlanItems.delete(`${date}:${task.id}`)
          if (previousTarget) await db.dailyPlanItems.put(previousTarget); else await db.dailyPlanItems.delete(`${date}:${target.id}`)
          if (previousPlan) await db.dailyPlans.put(previousPlan); else await db.dailyPlans.delete(date)
        })
      },
    }
  },

  async moveToExactDate(taskId: string, targetDate?: LocalDate): Promise<UndoableMutation> {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    const sourceDate = task.plannedDate
    if (sourceDate === targetDate) return { message: 'Task date unchanged', undo: async () => undefined }

    const previousTask = { ...task }
    const sourceItem = sourceDate ? await db.dailyPlanItems.get(`${sourceDate}:${taskId}`) : undefined
    const targetItem = targetDate ? await db.dailyPlanItems.get(`${targetDate}:${taskId}`) : undefined
    const sourcePlan = sourceDate ? await dailyPlanRepository.get(sourceDate) : undefined
    const targetPlan = targetDate ? await dailyPlanRepository.get(targetDate) : undefined

    await db.transaction('rw', db.tasks, db.dailyPlans, db.dailyPlanItems, async () => {
      await taskRepository.update(taskId, {
        plannedDate: targetDate ?? null,
        status: task.status === 'inbox' ? 'todo' : task.status,
      })

      if (sourceDate) {
        await db.dailyPlanItems.delete(`${sourceDate}:${taskId}`)
        await dailyPlanRepository.reopen(sourceDate)
      }

      if (targetDate) {
        await dailyPlanRepository.ensure(targetDate)
        const bucket = targetItem?.bucket ?? sourceItem?.bucket ?? defaultBucket(task)
        const order = targetItem?.sortOrder ?? sourceItem?.sortOrder ?? task.sortOrder
        await dailyPlanRepository.upsertItem(targetDate, taskId, bucket, order)
        await dailyPlanRepository.reopen(targetDate)
      }
    })

    const planningUndo: UndoableMutation = {
      message: targetDate ? 'Task moved to another day' : 'Task moved to Later',
      undo: async () => {
        await db.transaction('rw', db.tasks, db.dailyPlanItems, db.dailyPlans, async () => {
          await taskRepository.replace(previousTask)
          if (sourceDate) {
            if (sourceItem) await db.dailyPlanItems.put(sourceItem)
            else await db.dailyPlanItems.delete(`${sourceDate}:${taskId}`)
            if (sourcePlan) await db.dailyPlans.put(sourcePlan)
            else await db.dailyPlans.delete(sourceDate)
          }
          if (targetDate) {
            if (targetItem) await db.dailyPlanItems.put(targetItem)
            else await db.dailyPlanItems.delete(`${targetDate}:${taskId}`)
            if (targetPlan) await db.dailyPlans.put(targetPlan)
            else await db.dailyPlans.delete(targetDate)
          }
        })
      },
    }

    if (!task.seriesId || !task.recurrenceDate) return planningUndo
    try {
      const exceptionUndo = await recurrenceService.recordOccurrenceException(taskId, { plannedDate: targetDate ?? null })
      return {
        message: planningUndo.message,
        undo: async () => {
          await exceptionUndo.undo()
          await planningUndo.undo()
        },
      }
    } catch (error) {
      await planningUndo.undo()
      throw error
    }
  },

  async moveToDate(taskId: string, target: 'today' | 'tomorrow' | 'later', today: LocalDate): Promise<UndoableMutation> {
    const targetDate = target === 'today' ? today : target === 'tomorrow' ? addLocalDays(today, 1) : undefined
    const action = await this.moveToExactDate(taskId, targetDate)
    return {
      ...action,
      message: target === 'later' ? 'Task moved to Later' : `Task moved to ${target}`,
    }
  },

  async markTaskPlanningChange(before: Pick<TaskEntity, 'plannedDate'> | undefined, changes: Record<string, unknown>): Promise<void> {
    if (!before) return
    const planningFieldChanged = ['plannedDate', 'deadline', 'estimatedMinutes', 'priority'].some((key) => Object.prototype.hasOwnProperty.call(changes, key))
    if (!planningFieldChanged) return
    const nextDate = Object.prototype.hasOwnProperty.call(changes, 'plannedDate')
      ? (changes.plannedDate === null ? undefined : changes.plannedDate as LocalDate | undefined)
      : before.plannedDate
    const dates = new Set<LocalDate>()
    if (before.plannedDate) dates.add(before.plannedDate)
    if (nextDate) dates.add(nextDate)
    await Promise.all([...dates].map((date) => dailyPlanRepository.reopen(date)))
  },

  async setCapacity(date: LocalDate, minutes?: number): Promise<UndoableMutation> {
    const previous = await dailyPlanRepository.get(date)
    await dailyPlanRepository.setCapacity(date, minutes)
    await dailyPlanRepository.reopen(date)
    return {
      message: 'Daily capacity updated',
      undo: async () => {
        if (previous) await db.dailyPlans.put(previous)
        else await db.dailyPlans.delete(date)
      },
    }
  },

  async commit(date: LocalDate): Promise<UndoableMutation> {
    const previous = await dailyPlanRepository.get(date)
    const tasks = await taskRepository.listToday(date)
    const previousItems = await dailyPlanRepository.listItems(date)
    await db.transaction('rw', db.dailyPlans, db.dailyPlanItems, async () => {
      for (const task of tasks) await dailyPlanRepository.ensureItem(date, task.id, task.priority, task.sortOrder)
      await dailyPlanRepository.commit(date)
    })
    return {
      message: 'Day plan committed',
      undo: async () => {
        await db.transaction('rw', db.dailyPlans, db.dailyPlanItems, async () => {
          await db.dailyPlanItems.where('date').equals(date).delete()
          if (previousItems.length) await db.dailyPlanItems.bulkPut(previousItems)
          if (previous) await db.dailyPlans.put(previous)
          else await db.dailyPlans.delete(date)
        })
      },
    }
  },
}
