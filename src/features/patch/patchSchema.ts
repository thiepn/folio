import { z } from 'zod'
import { LEGACY_PATCH_FORMAT } from '../../legacy/compat'
import { importHabitScheduleSchema, importProjectSchema, importRecurrenceRuleSchema, importSeriesSchema, importTaskSchema, importTimeBlockSchema } from '../import/importSchema'

const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTime = z.string().min(10)
const baseExisting = { id: z.string().min(1), ifUpdatedAt: isoDateTime, reason: z.string().trim().max(500).optional() }

const projectChanges = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(10_000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  icon: z.string().trim().max(24).nullable().optional(),
  type: z.enum(['standard', 'academic']).optional(),
  favorite: z.boolean().optional(),
  examDate: localDate.nullable().optional(),
  weeklyTargetMinutes: z.number().int().positive().max(10_080).nullable().optional(),
}).strict()

const taskChanges = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  projectId: z.string().min(1).nullable().optional(),
  projectRef: ref.optional(),
  priority: z.enum(['normal', 'high', 'critical']).optional(),
  status: z.enum(['todo', 'inbox']).optional(),
  plannedDate: localDate.nullable().optional(),
  deadline: localDate.nullable().optional(),
  estimatedMinutes: z.number().int().positive().max(1440).nullable().optional(),
}).strict()

const habitChanges = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(10_000).optional(),
  kind: z.enum(['check', 'duration']).optional(),
  target: z.number().int().positive().max(1440).optional(),
  schedule: importHabitScheduleSchema.optional(),
  countsTowardCapacity: z.boolean().optional(),
}).strict()

const timeBlockChanges = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  date: localDate.optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  durationMinutes: z.number().int().min(15).max(1440).optional(),
}).strict()

const seriesTemplateChanges = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  projectId: z.string().min(1).nullable().optional(),
  projectRef: ref.optional(),
  priority: z.enum(['normal', 'high', 'critical']).optional(),
  estimatedMinutes: z.number().int().positive().max(1440).nullable().optional(),
  deadlineOffsetDays: z.number().int().min(0).max(3650).nullable().optional(),
  startMinute: z.number().int().min(0).max(1439).nullable().optional(),
  blockDurationMinutes: z.number().int().min(15).max(1440).nullable().optional(),
}).strict()

const seriesChanges = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(['active', 'paused']).optional(),
  startDate: localDate.optional(),
  rule: importRecurrenceRuleSchema.optional(),
  taskTemplate: seriesTemplateChanges.optional(),
}).strict()

const createProject = z.object({ op: z.literal('create'), entity: z.literal('project'), value: importProjectSchema }).strict()
const createTask = z.object({ op: z.literal('create'), entity: z.literal('task'), value: importTaskSchema.extend({ parentId: z.string().min(1).optional() }).strict() }).strict()
const createHabit = z.object({ op: z.literal('create'), entity: z.literal('habit'), value: importProjectSchema.pick({ ref: true }).extend({
  title: z.string().trim().min(1).max(160), description: z.string().max(10_000).default(''), kind: z.enum(['check','duration']), target: z.number().int().positive().max(1440).default(1), schedule: importHabitScheduleSchema, countsTowardCapacity: z.boolean().default(false),
}).strict() }).strict()
const createTimeBlock = z.object({ op: z.literal('create'), entity: z.literal('timeBlock'), value: importTimeBlockSchema.extend({ taskId: z.string().min(1).optional() }).strict() }).strict()
const createSeries = z.object({ op: z.literal('create'), entity: z.literal('recurringSeries'), value: importSeriesSchema }).strict()

const updateProject = z.object({ op: z.literal('update'), entity: z.literal('project'), ...baseExisting, changes: projectChanges }).strict()
const updateTask = z.object({ op: z.literal('update'), entity: z.literal('task'), ...baseExisting, changes: taskChanges }).strict()
const updateHabit = z.object({ op: z.literal('update'), entity: z.literal('habit'), ...baseExisting, changes: habitChanges }).strict()
const updateTimeBlock = z.object({ op: z.literal('update'), entity: z.literal('timeBlock'), ...baseExisting, changes: timeBlockChanges }).strict()
const updateSeries = z.object({ op: z.literal('update'), entity: z.literal('recurringSeries'), ...baseExisting, changes: seriesChanges }).strict()

const deleteFor = (entity: 'project'|'task'|'habit'|'timeBlock'|'recurringSeries') => z.object({ op: z.literal('delete'), entity: z.literal(entity), ...baseExisting }).strict()

export const patchOperationSchema = z.union([
  createProject, createTask, createHabit, createTimeBlock, createSeries,
  updateProject, updateTask, updateHabit, updateTimeBlock, updateSeries,
  deleteFor('project'), deleteFor('task'), deleteFor('habit'), deleteFor('timeBlock'), deleteFor('recurringSeries'),
])

export const patchDocumentSchema = z.object({
  format: z.union([z.literal('folio-patch'), z.literal(LEGACY_PATCH_FORMAT)]),
  version: z.literal(1),
  title: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  operations: z.array(patchOperationSchema).min(1).max(500),
}).strict().transform((value) => ({ ...value, format: 'folio-patch' as const }))
