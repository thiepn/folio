import { z } from 'zod'
import { LEGACY_IMPORT_FORMAT } from '../../legacy/compat'

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/)
const priority = z.enum(['normal', 'high', 'critical'])
const projectType = z.enum(['standard', 'academic'])

export const importHabitScheduleSchema = z.object({
  type: z.enum(['daily', 'weekdays', 'selected-days', 'times-per-week']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timesPerWeek: z.number().int().min(1).max(7).optional(),
}).strict()

export const importRecurrenceRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'after-completion']),
  interval: z.number().int().min(1).max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  monthDay: z.number().int().min(1).max(31).optional(),
  monthlyMode: z.enum(['days', 'ordinal-weekday', 'last-day']).default('days'),
  monthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
  ordinal: z.union([z.literal(-1), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  yearMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  afterCompletionUnit: z.enum(['day', 'week', 'month', 'year']).default('day'),
  until: localDate.optional(),
  count: z.number().int().min(1).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.until && value.count) ctx.addIssue({ code: 'custom', message: 'Use either until or count, not both.', path: ['until'] })
  if (value.frequency === 'weekly' && (!value.weekdays || value.weekdays.length === 0)) ctx.addIssue({ code: 'custom', message: 'Weekly recurrence requires weekdays.', path: ['weekdays'] })
  if (value.frequency === 'monthly' && value.monthlyMode === 'ordinal-weekday' && (value.ordinal === undefined || value.weekday === undefined)) ctx.addIssue({ code: 'custom', message: 'Ordinal monthly recurrence requires ordinal and weekday.', path: ['ordinal'] })
})

export const importProjectSchema = z.object({
  ref,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10_000).default(''),
  type: projectType.default('standard'),
  color: color.optional(),
  icon: z.string().trim().max(24).optional(),
  favorite: z.boolean().default(false),
  examDate: localDate.optional(),
  weeklyTargetMinutes: z.number().int().positive().max(10_080).optional(),
}).strict()

export const importTaskSchema = z.object({
  ref,
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(''),
  projectRef: ref.optional(),
  projectId: z.string().min(1).optional(),
  parentRef: ref.optional(),
  priority: priority.default('normal'),
  status: z.enum(['todo', 'inbox']).default('todo'),
  plannedDate: localDate.optional(),
  deadline: localDate.optional(),
  estimatedMinutes: z.number().int().positive().max(1440).optional(),
}).strict()

export const importHabitSchema = z.object({
  ref,
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).default(''),
  kind: z.enum(['check', 'duration']),
  target: z.number().int().positive().max(1440).default(1),
  schedule: importHabitScheduleSchema,
  countsTowardCapacity: z.boolean().default(false),
}).strict()

export const importTimeBlockSchema = z.object({
  ref: ref.optional(),
  kind: z.enum(['task', 'event']),
  taskRef: ref.optional(),
  title: z.string().trim().max(300).optional(),
  date: localDate,
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(15).max(1440),
}).strict()

export const importSeriesSchema = z.object({
  ref,
  title: z.string().trim().min(1).max(300),
  timezone: z.string().trim().min(1).max(100),
  startDate: localDate,
  rule: importRecurrenceRuleSchema,
  taskTemplate: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).default(''),
    projectRef: ref.optional(),
    projectId: z.string().min(1).optional(),
    priority: priority.default('normal'),
    estimatedMinutes: z.number().int().positive().max(1440).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    checklist: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
    sourceUrl: z.string().trim().url().max(2048).optional(),
    location: z.string().trim().max(500).optional(),
    pinned: z.boolean().default(false),
    deadlineOffsetDays: z.number().int().min(0).max(3650).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    blockDurationMinutes: z.number().int().min(15).max(1440).optional(),
  }).strict(),
}).strict()

export const importDocumentSchema = z.object({
  format: z.union([z.literal('folio-import'), z.literal(LEGACY_IMPORT_FORMAT)]),
  version: z.literal(1),
  title: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  projects: z.array(importProjectSchema).max(100).default([]),
  tasks: z.array(importTaskSchema).max(2000).default([]),
  habits: z.array(importHabitSchema).max(200).default([]),
  timeBlocks: z.array(importTimeBlockSchema).max(4000).default([]),
  recurringSeries: z.array(importSeriesSchema).max(100).default([]),
}).strict().transform((value) => ({ ...value, format: 'folio-import' as const }))
