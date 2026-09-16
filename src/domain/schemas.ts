import { z } from 'zod'
import { LEGACY_BACKUP_FORMAT } from '../legacy/compat'

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTime = z.string().min(10)

export const taskPrioritySchema = z.enum(['normal', 'high', 'critical'])
export const taskStatusSchema = z.enum(['inbox', 'todo', 'completed', 'cancelled'])

export const projectTypeSchema = z.enum(['standard', 'academic'])

export const habitKindSchema = z.enum(['check', 'duration'])
export const habitEntryStatusSchema = z.enum(['open', 'completed', 'skipped'])
export const habitScheduleSchema = z.object({
  type: z.enum(['daily', 'weekdays', 'selected-days', 'times-per-week']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timesPerWeek: z.number().int().min(1).max(7).optional(),
}).superRefine((value, ctx) => {
  if (value.type === 'selected-days' && (!value.weekdays || value.weekdays.length === 0)) ctx.addIssue({ code: 'custom', message: 'Choose at least one weekday.', path: ['weekdays'] })
  if (value.type === 'times-per-week' && !value.timesPerWeek) ctx.addIssue({ code: 'custom', message: 'Choose how many times per week.', path: ['timesPerWeek'] })
})

export const habitCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).default(''),
  kind: habitKindSchema.default('check'),
  target: z.number().int().positive().max(24 * 60).default(1),
  schedule: habitScheduleSchema,
  countsTowardCapacity: z.boolean().default(false),
})

export const habitUpdateSchema = habitCreateSchema.partial().extend({
  archived: z.boolean().optional(),
  sortOrder: z.number().finite().optional(),
})


export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10_000).default(''),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(24).optional(),
  type: projectTypeSchema.default('standard'),
  favorite: z.boolean().default(false),
  examDate: localDate.optional(),
  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).optional(),
})

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  archived: z.boolean().optional(),
  examDate: localDate.nullable().optional(),
  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).nullable().optional(),
})

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(''),
  projectId: z.string().optional(),
  parentTaskId: z.string().optional(),
  priority: taskPrioritySchema.default('normal'),
  status: taskStatusSchema.default('todo'),
  plannedDate: localDate.optional(),
  deadline: localDate.optional(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).optional(),
  seriesId: z.string().optional(),
  recurrenceDate: localDate.optional(),
  blockedByTaskIds: z.array(z.string()).max(100).default([]),
})



export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  projectId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  plannedDate: localDate.nullable().optional(),
  deadline: localDate.nullable().optional(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  blockedByTaskIds: z.array(z.string()).max(100).optional(),
  sortOrder: z.number().finite().optional(),
})


export const timeBlockKindSchema = z.enum(['task', 'event'])

export const timeBlockCreateSchema = z.object({
  taskId: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  location: z.string().trim().max(500).optional(),
  kind: timeBlockKindSchema,
  start: isoDateTime,
  end: isoDateTime,
}).superRefine((value, ctx) => {
  if (new Date(value.end).getTime() <= new Date(value.start).getTime()) {
    ctx.addIssue({ code: 'custom', message: 'Time block end must be after start.', path: ['end'] })
  }
  if (value.kind === 'task' && !value.taskId) {
    ctx.addIssue({ code: 'custom', message: 'Task blocks require a taskId.', path: ['taskId'] })
  }
})

export const timeBlockUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  location: z.string().trim().max(500).optional(),
  start: isoDateTime.optional(),
  end: isoDateTime.optional(),
}).superRefine((value, ctx) => {
  if (value.start && value.end && new Date(value.end).getTime() <= new Date(value.start).getTime()) {
    ctx.addIssue({ code: 'custom', message: 'Time block end must be after start.', path: ['end'] })
  }
})


export const focusModeSchema = z.enum(['stopwatch', 'countdown'])
export const focusSessionStatusSchema = z.enum(['running', 'paused', 'finished', 'cancelled'])

export const focusSessionCreateSchema = z.object({
  taskId: z.string().optional(),
  taskTitleSnapshot: z.string().trim().min(1).max(300).optional(),
  taskEstimateMinutesSnapshot: z.number().int().positive().max(24 * 60).optional(),
  projectIdSnapshot: z.string().optional(),
  projectNameSnapshot: z.string().trim().min(1).max(120).optional(),
  mode: focusModeSchema.default('stopwatch'),
  targetSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === 'countdown' && !value.targetSeconds) ctx.addIssue({ code: 'custom', message: 'Countdown sessions require a target duration.', path: ['targetSeconds'] })
})

export const appearanceSchema = z.object({
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  intensity: z.enum(['subtle', 'balanced', 'vivid']),
  density: z.enum(['comfortable', 'compact']),
})

export const backupEnvelopeSchema = z.object({
  format: z.union([z.literal('folio-backup'), z.literal(LEGACY_BACKUP_FORMAT)]),
  version: z.number().int().positive(),
  exportedAt: isoDateTime,
  data: z.object({
    tasks: z.array(z.unknown()),
    projects: z.array(z.unknown()),
    habits: z.array(z.unknown()),
    habitEntries: z.array(z.unknown()),
    timeBlocks: z.array(z.unknown()),
    dailyPlans: z.array(z.unknown()).default([]),
    dailyPlanItems: z.array(z.unknown()).default([]),
    focusSessions: z.array(z.unknown()),
    recurringSeries: z.array(z.unknown()),
    settings: z.array(z.unknown()),
    importBatches: z.array(z.unknown()),
    patchBatches: z.array(z.unknown()).default([]),
    calendarImportBatches: z.array(z.unknown()).default([]),
  }),
}).transform((value) => ({ ...value, format: 'folio-backup' as const }))

export const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly', 'after-completion'])
export const recurringSeriesStatusSchema = z.enum(['active', 'paused', 'archived'])

export const recurrenceRuleSchema = z.object({
  frequency: recurrenceFrequencySchema,
  interval: z.number().int().positive().max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  monthDay: z.number().int().min(1).max(31).optional(),
  until: localDate.optional(),
  count: z.number().int().positive().max(10_000).optional(),
}).superRefine((value, ctx) => {
  if (value.until && value.count) ctx.addIssue({ code: 'custom', message: 'Use either an end date or an occurrence count, not both.', path: ['until'] })
  if (value.frequency === 'weekly' && value.weekdays && value.weekdays.length === 0) ctx.addIssue({ code: 'custom', message: 'Weekly recurrence requires at least one weekday.', path: ['weekdays'] })
})

export const recurringSeriesCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  timezone: z.string().min(1).default('local'),
  startDate: localDate,
  rule: recurrenceRuleSchema,
  taskTemplate: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).default(''),
    projectId: z.string().optional(),
    priority: taskPrioritySchema.default('normal'),
    estimatedMinutes: z.number().int().positive().max(24 * 60).optional(),
    deadlineOffsetDays: z.number().int().min(0).max(3650).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    blockDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
  }),
})

export const recurringSeriesUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: recurringSeriesStatusSchema.optional(),
  startDate: localDate.optional(),
  rule: recurrenceRuleSchema.optional(),
  taskTemplate: recurringSeriesCreateSchema.shape.taskTemplate.partial().optional(),
})
