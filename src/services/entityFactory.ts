import type {
  HabitEntity,
  ProjectEntity,
  RecurringSeriesEntity,
  TaskEntity,
  TimeBlockEntity,
} from '../domain/models'
import type { z } from 'zod'
import {
  habitCreateSchema,
  projectCreateSchema,
  recurringSeriesCreateSchema,
  taskCreateSchema,
  timeBlockCreateSchema,
} from '../domain/schemas'

export type FactoryTaskInput = z.input<typeof taskCreateSchema>
export type FactoryProjectInput = z.input<typeof projectCreateSchema>
export type FactoryHabitInput = z.input<typeof habitCreateSchema>
export type FactoryTimeBlockInput = z.input<typeof timeBlockCreateSchema>
export type FactorySeriesInput = z.input<typeof recurringSeriesCreateSchema>

export function makeTaskEntity(input: FactoryTaskInput, id = crypto.randomUUID(), now = new Date().toISOString(), sortOrder = Date.now()): TaskEntity {
  const parsed = taskCreateSchema.parse(input)
  return {
    id,
    title: parsed.title,
    description: parsed.description,
    projectId: parsed.status === 'inbox' ? undefined : parsed.projectId,
    parentTaskId: parsed.parentTaskId,
    priority: parsed.priority,
    status: parsed.status,
    lastOpenStatus: parsed.status === 'inbox' || parsed.status === 'todo' ? parsed.status : undefined,
    plannedDate: parsed.status === 'inbox' ? undefined : parsed.plannedDate,
    deadline: parsed.deadline,
    estimatedMinutes: parsed.estimatedMinutes,
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

export function makeProjectEntity(input: FactoryProjectInput, id = crypto.randomUUID(), now = new Date().toISOString()): ProjectEntity {
  const parsed = projectCreateSchema.parse(input)
  return {
    id,
    name: parsed.name,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon,
    type: parsed.type,
    archived: false,
    favorite: parsed.favorite,
    examDate: parsed.type === 'academic' ? parsed.examDate : undefined,
    weeklyTargetMinutes: parsed.type === 'academic' ? parsed.weeklyTargetMinutes : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function makeHabitEntity(input: FactoryHabitInput, id = crypto.randomUUID(), now = new Date().toISOString(), sortOrder = Date.now()): HabitEntity {
  const parsed = habitCreateSchema.parse(input)
  return {
    id,
    title: parsed.title,
    description: parsed.description,
    kind: parsed.kind,
    target: parsed.kind === 'check' ? 1 : parsed.target,
    schedule: parsed.schedule,
    countsTowardCapacity: parsed.kind === 'duration' ? parsed.countsTowardCapacity : false,
    archived: false,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
}

export function makeTimeBlockEntity(input: FactoryTimeBlockInput, id = crypto.randomUUID(), now = new Date().toISOString()): TimeBlockEntity {
  const parsed = timeBlockCreateSchema.parse(input)
  return { id, taskId: parsed.taskId, title: parsed.title, description: parsed.description || undefined, location: parsed.location || undefined, kind: parsed.kind, start: parsed.start, end: parsed.end, createdAt: now, updatedAt: now }
}

export function makeSeriesEntity(input: FactorySeriesInput, id = crypto.randomUUID(), now = new Date().toISOString()): RecurringSeriesEntity {
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
