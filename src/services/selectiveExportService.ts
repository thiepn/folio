import { db } from '../db/database'
import type { LocalDate } from '../domain/models'
import { localDateKey } from '../domain/date'
import { serializeAttachment } from './attachmentService'

export interface SelectiveExportOptions {
  projectId?: string
  fromDate?: LocalDate
  throughDate?: LocalDate
  includeCompleted?: boolean
}

export interface SelectiveExportEnvelope {
  format: 'folio-selection'
  version: 1
  exportedAt: string
  filters: SelectiveExportOptions
  data: Record<string, unknown[]>
}

function inRange(date: string | undefined, from?: string, through?: string) {
  if (!date) return false
  return (!from || date >= from) && (!through || date <= through)
}

export async function createSelectiveExport(options: SelectiveExportOptions): Promise<SelectiveExportEnvelope> {
  if (options.fromDate && options.throughDate && options.throughDate < options.fromDate) throw new Error('Selective export end date must not be before start date.')
  const [tasks, projects, habits, habitEntries, timeBlocks, dailyPlans, dailyPlanItems, focusSessions, recurringSeries, notes, attachments] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.habits.toArray(), db.habitEntries.toArray(), db.timeBlocks.toArray(), db.dailyPlans.toArray(), db.dailyPlanItems.toArray(), db.focusSessions.toArray(), db.recurringSeries.toArray(), db.notes.toArray(), db.attachments.toArray(),
  ])

  if (options.projectId && !projects.some((project) => project.id === options.projectId)) throw new Error('Selected export Project no longer exists.')

  const from = options.fromDate
  const through = options.throughDate
  const hasDateFilter = Boolean(from || through)

  let selectedTasks = tasks.filter((task) => options.includeCompleted !== false || task.status !== 'completed')
  if (options.projectId) selectedTasks = selectedTasks.filter((task) => task.projectId === options.projectId)
  if (hasDateFilter) selectedTasks = selectedTasks.filter((task) => inRange(task.plannedDate, from, through) || inRange(task.deadline, from, through) || inRange(task.recurrenceDate, from, through))

  const selectedTaskIds = new Set(selectedTasks.map((task) => task.id))
  // Preserve one-level subtask context even when the child has no project of its own.
  const extraChildren = tasks.filter((task) => task.parentTaskId && selectedTaskIds.has(task.parentTaskId))
  for (const child of extraChildren) if (!selectedTaskIds.has(child.id)) { selectedTasks.push(child); selectedTaskIds.add(child.id) }

  let selectedBlocks = timeBlocks.filter((block) => block.taskId ? selectedTaskIds.has(block.taskId) : !options.projectId)
  if (hasDateFilter) selectedBlocks = selectedBlocks.filter((block) => {
    const date = localDateKey(new Date(block.start))
    return inRange(date, from, through)
  })

  const selectedProjectIds = new Set(selectedTasks.map((task) => task.projectId).filter((id): id is string => Boolean(id)))
  if (options.projectId) selectedProjectIds.add(options.projectId)
  const selectedProjects = projects.filter((project) => selectedProjectIds.has(project.id))

  const selectedSeriesIds = new Set(selectedTasks.map((task) => task.seriesId).filter((id): id is string => Boolean(id)))
  const selectedSeries = recurringSeries.filter((series) => selectedSeriesIds.has(series.id) || (options.projectId && series.taskTemplate.projectId === options.projectId))

  const selectedDailyPlanItems = dailyPlanItems.filter((item) => selectedTaskIds.has(item.taskId) && (!hasDateFilter || inRange(item.date, from, through)))
  const planDates = new Set(selectedDailyPlanItems.map((item) => item.date))
  const selectedDailyPlans = dailyPlans.filter((plan) => planDates.has(plan.date))

  const selectedFocus = focusSessions.filter((session) => selectedTaskIds.has(session.taskId ?? '') && (!hasDateFilter || inRange(localDateKey(new Date(session.startedAt)), from, through)))

  let selectedHabitEntries = habitEntries
  if (hasDateFilter) selectedHabitEntries = habitEntries.filter((entry) => inRange(entry.date, from, through))
  if (options.projectId) selectedHabitEntries = []
  const selectedHabitIds = new Set(selectedHabitEntries.map((entry) => entry.habitId))
  const selectedHabits = options.projectId ? [] : habits.filter((habit) => !hasDateFilter || selectedHabitIds.has(habit.id))

  const selectedNotes = notes.filter((note) => note.sourceTaskId ? selectedTaskIds.has(note.sourceTaskId) : !options.projectId && !hasDateFilter)
  const selectedNoteIds = new Set(selectedNotes.map((note) => note.id))
  const selectedAttachments = attachments.filter((attachment) => attachment.ownerType === 'task' ? selectedTaskIds.has(attachment.ownerId) : selectedNoteIds.has(attachment.ownerId))
  const portableAttachments = await Promise.all(selectedAttachments.map(serializeAttachment))

  return {
    format: 'folio-selection',
    version: 1,
    exportedAt: new Date().toISOString(),
    filters: options,
    data: {
      projects: selectedProjects,
      tasks: selectedTasks,
      timeBlocks: selectedBlocks,
      recurringSeries: selectedSeries,
      dailyPlans: selectedDailyPlans,
      dailyPlanItems: selectedDailyPlanItems,
      focusSessions: selectedFocus,
      habits: selectedHabits,
      habitEntries: selectedHabitEntries,
      notes: selectedNotes,
      attachments: portableAttachments,
    },
  }
}
