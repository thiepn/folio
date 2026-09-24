import { projectCreateSchema, habitCreateSchema, taskCreateSchema, timeBlockCreateSchema, recurringSeriesCreateSchema } from '../domain/schemas'
import type { HabitEntity, ProjectEntity, RecurringSeriesEntity, TaskEntity, TimeBlockEntity } from '../domain/models'
import type { z } from 'zod'

export type FactoryTaskInput = z.input<typeof taskCreateSchema>
export type FactoryProjectInput = z.input<typeof projectCreateSchema>
export type FactoryHabitInput = z.input<typeof habitCreateSchema>
export type FactoryTimeBlockInput = z.input<typeof timeBlockCreateSchema>
export type FactorySeriesInput = z.input<typeof recurringSeriesCreateSchema>

export function makeTaskEntity(input: FactoryTaskInput, id: string = crypto.randomUUID(), now = new Date().toISOString(), sortOrder = Date.now()): TaskEntity {
  const parsed = taskCreateSchema.parse(input)
  return {
    id,
    title: parsed.title,
    description: parsed.description,
    projectId: parsed.projectId,
    listId: parsed.listId,
    sectionId: parsed.sectionId,
    parentTaskId: parsed.parentTaskId,
    priority: parsed.priority,
    status: parsed.status,
    lastOpenStatus: parsed.status === 'inbox' || parsed.status === 'todo' ? parsed.status : undefined,
    plannedDate: parsed.plannedDate,
    deadline: parsed.deadline,
    timelineStart: parsed.timelineStart,
    timelineEnd: parsed.timelineEnd,
    timelineMilestone: parsed.timelineMilestone,
    estimatedMinutes: parsed.estimatedMinutes,
    tags: [...new Set(parsed.tags.map((tag) => tag.trim()).filter(Boolean))],
    tagIds: [...new Set(parsed.tagIds)],
    checklist: parsed.checklist,
    progressMode: parsed.progressMode,
    progressPercent: parsed.progressPercent,
    sourceUrl: parsed.sourceUrl,
    location: parsed.location,
    pinned: parsed.pinned,
    comments: parsed.comments,
    activity: [{ id: crypto.randomUUID(), kind: 'created', label: 'Task created', at: now }],
    seriesId: parsed.seriesId,
    recurrenceDate: parsed.recurrenceDate,
    blockedByTaskIds: parsed.blockedByTaskIds,
    sortOrder,
    rescheduleCount: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: parsed.status === 'completed' ? now : undefined,
  }
}

export function makeProjectEntity(input: FactoryProjectInput, id: string = crypto.randomUUID(), now = new Date().toISOString()): ProjectEntity {
  const parsed = projectCreateSchema.parse(input)
  return {
    id,
    name: parsed.name,
    description: parsed.description,
    notes: parsed.notes,
    color: parsed.color,
    icon: parsed.icon,
    type: parsed.type,
    status: parsed.status,
    deadline: parsed.deadline,
    milestones: [],
    activity: [{ id: crypto.randomUUID(), kind: 'project', label: 'Project created', at: now }],
    completedAt: parsed.status === 'completed' ? now : undefined,
    archived: false,
    favorite: parsed.favorite,
    examDate: parsed.type === 'academic' ? parsed.examDate : undefined,
    weeklyTargetMinutes: parsed.type === 'academic' ? parsed.weeklyTargetMinutes : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function makeHabitEntity(input: FactoryHabitInput, id: string = crypto.randomUUID(), now = new Date().toISOString(), sortOrder = Date.now()): HabitEntity {
  const parsed = habitCreateSchema.parse(input)
  return {
    id,
    title: parsed.title,
    description: parsed.description,
    kind: parsed.kind,
    target: parsed.kind === 'check' ? 1 : parsed.target,
    unit: parsed.kind === 'quantity' ? (parsed.unit ?? 'units') : undefined,
    color: parsed.color,
    groupId: parsed.groupId,
    schedule: parsed.schedule,
    countsTowardCapacity: parsed.kind === 'duration' ? parsed.countsTowardCapacity : false,
    pauses: parsed.pauses,
    archived: false,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
}

export function makeTimeBlockEntity(input: FactoryTimeBlockInput, id: string = crypto.randomUUID(), now = new Date().toISOString()): TimeBlockEntity {
  const parsed = timeBlockCreateSchema.parse(input)
  return { id, taskId: parsed.taskId, title: parsed.title, description: parsed.description || undefined, location: parsed.location || undefined, kind: parsed.kind, allDay: parsed.allDay, timeZone: parsed.timeZone, source: parsed.source, sourceCalendar: parsed.sourceCalendar, sourceUid: parsed.sourceUid, start: parsed.start, end: parsed.end, createdAt: now, updatedAt: now }
}

export function makeSeriesEntity(input: FactorySeriesInput, id: string = crypto.randomUUID(), now = new Date().toISOString()): RecurringSeriesEntity {
  const parsed = recurringSeriesCreateSchema.parse(input)
  return {
    id,
    title: parsed.title,
    timezone: parsed.timezone,
    status: 'active',
    startDate: parsed.startDate,
    rule: parsed.rule,
    taskTemplate: parsed.taskTemplate,
    exceptions: {},
    createdAt: now,
    updatedAt: now,
  }
}
