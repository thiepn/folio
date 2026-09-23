import { atTimeInZone, localDateKey } from '../domain/date'
import type { LocalDate } from '../domain/models'
import type { TaskCreateInput } from '../repositories/taskRepository'
import { recurrenceRepository } from '../repositories/recurrenceRepository'
import { dailyPlanningService } from './dailyPlanningService'
import { recurrenceService } from './recurrenceService'
import { reminderService } from './reminderService'
import { taskService } from './taskService'
import { timeBlockService } from './timeBlockService'
import type { UndoableMutation } from './undo'
import type { ParsedRecurrence, ParsedReminder } from '../features/capture/parser'

export interface CaptureCreateRequest {
  input: TaskCreateInput
  schedule?: { date: LocalDate; startMinute: number; durationMinutes: number }
  recurrence?: ParsedRecurrence
  reminders?: ParsedReminder[]
}

async function createReminderActions(options: {
  reminders: ParsedReminder[]
  taskId?: string
  seriesId?: string
  timeZone: string
}) {
  const actions: UndoableMutation[] = []
  const { reminders, taskId, seriesId, timeZone } = options
  for (const reminder of reminders) {
    if (reminder.kind === 'absolute') {
      if (!taskId || !reminder.date || reminder.minuteOfDay === undefined) continue
      const absoluteAt = atTimeInZone(reminder.date, reminder.minuteOfDay, timeZone)
      const { undo } = await reminderService.create({
        ownerType: 'task',
        ownerId: taskId,
        triggerType: 'absolute',
        absoluteAt,
        timeZone,
        persistent: Boolean(reminder.persistent),
      })
      actions.push(undo)
      continue
    }

    const ownerType = seriesId ? 'series' as const : 'task' as const
    const ownerId = seriesId ?? taskId
    if (!ownerId) continue

    if (reminder.kind === 'time-block') {
      const { undo } = await reminderService.create({
        ownerType,
        ownerId,
        triggerType: 'time-block',
        blockEdge: 'start',
        offsetMinutes: reminder.offsetMinutes ?? 0,
        timeZone,
        persistent: Boolean(reminder.persistent),
      })
      actions.push(undo)
      continue
    }

    if (reminder.kind === 'task-date' && reminder.taskDateField && reminder.minuteOfDay !== undefined) {
      const { undo } = await reminderService.create({
        ownerType,
        ownerId,
        triggerType: 'task-date',
        taskDateField: reminder.taskDateField,
        dayOffset: reminder.dayOffset ?? 0,
        minuteOfDay: reminder.minuteOfDay,
        timeZone,
        persistent: Boolean(reminder.persistent),
      })
      actions.push(undo)
    }
  }
  return actions
}

async function rollback(actions: UndoableMutation[]) {
  for (const action of [...actions].reverse()) {
    try { await action.undo() } catch { /* Preserve the original creation failure. */ }
  }
}

export async function createCapturedItem(request: CaptureCreateRequest): Promise<UndoableMutation> {
  const actions: UndoableMutation[] = []
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'

  try {
    if (request.recurrence && request.input.status !== 'inbox') {
      const startDate = request.input.plannedDate ?? localDateKey()
      if (request.input.deadline && request.input.deadline < startDate) {
        throw new Error('A recurring task deadline cannot be before its occurrence date.')
      }
      const deadlineOffsetDays = request.input.deadline
        ? Math.round((Date.parse(`${request.input.deadline}T12:00:00`) - Date.parse(`${startDate}T12:00:00`)) / 86_400_000)
        : undefined
      const { series, undo } = await recurrenceService.create({
        title: request.input.title,
        timezone: timeZone,
        startDate,
        rule: request.recurrence,
        taskTemplate: {
          title: request.input.title,
          description: request.input.description ?? '',
          projectId: request.input.projectId,
          priority: request.input.priority ?? 'normal',
          estimatedMinutes: request.input.estimatedMinutes,
          tags: request.input.tags ?? [],
          checklist: (request.input.checklist ?? []).map((item) => item.text),
          sourceUrl: request.input.sourceUrl,
          location: request.input.location,
          pinned: request.input.pinned ?? false,
          deadlineOffsetDays,
          startMinute: request.schedule?.startMinute,
          blockDurationMinutes: request.schedule?.durationMinutes,
        },
      })
      actions.push(undo)
      await dailyPlanningService.markDraft(startDate)

      let firstTaskId: string | undefined
      if ((request.reminders ?? []).some((item) => item.kind === 'absolute')) {
        firstTaskId = (await recurrenceRepository.listOccurrences(series.id))[0]?.id
      }
      actions.push(...await createReminderActions({
        reminders: request.reminders ?? [],
        seriesId: series.id,
        taskId: firstTaskId,
        timeZone,
      }))

      return {
        message: request.reminders?.length ? 'Recurring task and reminders added' : 'Recurring task added',
        undo: async () => rollback(actions),
      }
    }

    const { task, undo: taskUndo } = await taskService.createUndoable(request.input)
    actions.push(taskUndo)
    if (request.input.plannedDate) await dailyPlanningService.markDraft(request.input.plannedDate)

    if (request.schedule) {
      const { undo } = await timeBlockService.createTaskBlock(
        task.id,
        request.schedule.date,
        request.schedule.startMinute,
        request.schedule.durationMinutes,
      )
      actions.push(undo)
    }

    actions.push(...await createReminderActions({
      reminders: request.reminders ?? [],
      taskId: task.id,
      timeZone,
    }))

    return {
      message: request.reminders?.length || request.schedule ? 'Task, schedule, and reminders added' : 'Task added',
      undo: async () => rollback(actions),
    }
  } catch (error) {
    await rollback(actions)
    throw error
  }
}

export async function createCapturedBatch(requests: CaptureCreateRequest[]): Promise<UndoableMutation> {
  if (!requests.length) throw new Error('Nothing to add.')
  const actions: UndoableMutation[] = []
  try {
    for (const request of requests) actions.push(await createCapturedItem(request))
    return {
      message: `${actions.length} captured task${actions.length === 1 ? '' : 's'} added`,
      undo: async () => rollback(actions),
    }
  } catch (error) {
    await rollback(actions)
    throw error
  }
}
