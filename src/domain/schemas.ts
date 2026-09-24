import { z } from 'zod'
import { LEGACY_BACKUP_FORMAT } from '../legacy/compat'

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTime = z.string().min(10)

export const taskPrioritySchema = z.enum(['normal', 'high', 'critical'])
export const taskStatusSchema = z.enum(['inbox', 'todo', 'completed', 'cancelled'])

export const projectTypeSchema = z.enum(['standard', 'academic'])
export const projectStatusSchema = z.enum(['active', 'on-hold', 'completed'])
export const reviewKindSchema = z.enum(['daily', 'weekly', 'monthly'])

export const habitKindSchema = z.enum(['check', 'quantity', 'duration'])
export const habitEntryStatusSchema = z.enum(['open', 'completed', 'skipped'])
export const habitScheduleSchema = z.object({
  type: z.enum(['daily', 'weekdays', 'selected-days', 'times-per-week', 'times-per-month']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timesPerWeek: z.number().int().min(1).max(7).optional(),
  timesPerMonth: z.number().int().min(1).max(31).optional(),
}).superRefine((value, ctx) => {
  if (value.type === 'selected-days' && (!value.weekdays || value.weekdays.length === 0)) ctx.addIssue({ code: 'custom', message: 'Choose at least one weekday.', path: ['weekdays'] })
  if (value.type === 'times-per-week' && !value.timesPerWeek) ctx.addIssue({ code: 'custom', message: 'Choose how many times per week.', path: ['timesPerWeek'] })
  if (value.type === 'times-per-month' && !value.timesPerMonth) ctx.addIssue({ code: 'custom', message: 'Choose how many times per month.', path: ['timesPerMonth'] })
})

export const habitPausePeriodSchema = z.object({
  id: z.string().min(1),
  startDate: localDate,
  endDate: localDate.optional(),
  createdAt: isoDateTime,
}).superRefine((value, ctx) => {
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: 'custom', message: 'Pause end date must be on or after its start date.', path: ['endDate'] })
})

export const habitCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).default(''),
  kind: habitKindSchema.default('check'),
  target: z.number().int().positive().max(100_000).default(1),
  unit: z.string().trim().min(1).max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  groupId: z.string().optional(),
  schedule: habitScheduleSchema,
  countsTowardCapacity: z.boolean().default(false),
  pauses: z.array(habitPausePeriodSchema).default([]),
})

export const habitUpdateSchema = habitCreateSchema.partial().extend({
  groupId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().finite().optional(),
})

export const habitGroupCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().finite().optional(),
  collapsed: z.boolean().default(false),
})
export const habitGroupUpdateSchema = habitGroupCreateSchema.partial()

export const habitTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(10_000).default(''),
  kind: habitKindSchema.default('check'),
  target: z.number().int().positive().max(100_000).default(1),
  unit: z.string().trim().min(1).max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  schedule: habitScheduleSchema,
  countsTowardCapacity: z.boolean().default(false),
})


export const listSortModeSchema = z.enum(['manual','planned','deadline','priority','title','created','updated'])
export const listGroupModeSchema = z.enum(['section','none','planned','priority','tag'])

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(24).optional(),
  sortOrder: z.number().finite().optional(),
  collapsed: z.boolean().default(false),
})
export const folderUpdateSchema = folderCreateSchema.partial().extend({ archived: z.boolean().optional() })

export const listCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10_000).default(''),
  folderId: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(24).optional(),
  favorite: z.boolean().default(false),
  sortOrder: z.number().finite().optional(),
  sortMode: listSortModeSchema.default('manual'),
  groupMode: listGroupModeSchema.default('section'),
  showCompleted: z.boolean().default(true),
})
export const listUpdateSchema = listCreateSchema.partial().extend({
  folderId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
})

export const sectionCreateSchema = z.object({
  listId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().finite().optional(),
})
export const sectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().finite().optional(),
  archived: z.boolean().optional(),
})

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  parentTagId: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  favorite: z.boolean().default(false),
  sortOrder: z.number().finite().optional(),
})
export const tagUpdateSchema = tagCreateSchema.partial().extend({
  parentTagId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
})

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(10_000).default(''),
  notes: z.string().max(20_000).default(''),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(24).optional(),
  type: projectTypeSchema.default('standard'),
  status: projectStatusSchema.default('active'),
  deadline: localDate.optional(),
  favorite: z.boolean().default(false),
  examDate: localDate.optional(),
  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).optional(),
})

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  archived: z.boolean().optional(),
  deadline: localDate.nullable().optional(),
  nextActionTaskId: z.string().nullable().optional(),
  examDate: localDate.nullable().optional(),
  weeklyTargetMinutes: z.number().int().positive().max(7 * 24 * 60).nullable().optional(),
})

export const taskProgressModeSchema = z.enum(['auto', 'manual'])

export const taskChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(500),
  completed: z.boolean().default(false),
  sortOrder: z.number().finite(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime.optional(),
})

export const taskCommentSchema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(10_000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const taskActivityEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['created', 'updated', 'completed', 'reopened', 'subtask', 'comment', 'restored', 'duplicated']),
  label: z.string().trim().min(1).max(500),
  at: isoDateTime,
})

const taskTagsSchema = z.array(z.string().trim().min(1).max(40)).max(50).default([])

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(100_000).default(''),
  projectId: z.string().optional(),
  listId: z.string().optional(),
  sectionId: z.string().optional(),
  parentTaskId: z.string().optional(),
  priority: taskPrioritySchema.default('normal'),
  status: taskStatusSchema.default('todo'),
  plannedDate: localDate.optional(),
  deadline: localDate.optional(),
  timelineStart: localDate.optional(),
  timelineEnd: localDate.optional(),
  timelineMilestone: z.boolean().default(false),
  estimatedMinutes: z.number().int().positive().max(24 * 60).optional(),
  tags: taskTagsSchema,
  tagIds: z.array(z.string()).max(50).default([]),
  checklist: z.array(taskChecklistItemSchema).max(500).default([]),
  progressMode: taskProgressModeSchema.default('auto'),
  progressPercent: z.number().int().min(0).max(100).default(0),
  sourceUrl: z.string().trim().url().max(2048).optional(),
  location: z.string().trim().max(500).optional(),
  pinned: z.boolean().default(false),
  comments: z.array(taskCommentSchema).max(500).default([]),
  seriesId: z.string().optional(),
  recurrenceDate: localDate.optional(),
  blockedByTaskIds: z.array(z.string()).max(100).default([]),
})



export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(100_000).optional(),
  projectId: z.string().nullable().optional(),
  listId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  plannedDate: localDate.nullable().optional(),
  deadline: localDate.nullable().optional(),
  timelineStart: localDate.nullable().optional(),
  timelineEnd: localDate.nullable().optional(),
  timelineMilestone: z.boolean().optional(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  tagIds: z.array(z.string()).max(50).optional(),
  checklist: z.array(taskChecklistItemSchema).max(500).optional(),
  progressMode: taskProgressModeSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  sourceUrl: z.string().trim().url().max(2048).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  pinned: z.boolean().optional(),
  comments: z.array(taskCommentSchema).max(500).optional(),
  blockedByTaskIds: z.array(z.string()).max(100).optional(),
  sortOrder: z.number().finite().optional(),
})


export const noteCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(200_000).default(''),
  sourceTaskId: z.string().optional(),
})

export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(200_000).optional(),
  sourceTaskId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
})


export const timeBlockKindSchema = z.enum(['task', 'event'])

export const timeBlockCreateSchema = z.object({
  taskId: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  location: z.string().trim().max(500).optional(),
  kind: timeBlockKindSchema,
  allDay: z.boolean().default(false),
  timeZone: z.string().trim().min(1).max(100).optional(),
  source: z.enum(['folio','ics']).default('folio'),
  sourceCalendar: z.string().trim().max(200).optional(),
  sourceUid: z.string().trim().max(500).optional(),
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
  allDay: z.boolean().optional(),
  timeZone: z.string().trim().min(1).max(100).nullable().optional(),
  sourceCalendar: z.string().trim().max(200).nullable().optional(),
  sourceUid: z.string().trim().max(500).nullable().optional(),
  start: isoDateTime.optional(),
  end: isoDateTime.optional(),
}).superRefine((value, ctx) => {
  if (value.start && value.end && new Date(value.end).getTime() <= new Date(value.start).getTime()) {
    ctx.addIssue({ code: 'custom', message: 'Time block end must be after start.', path: ['end'] })
  }
})


export const focusModeSchema = z.enum(['stopwatch', 'countdown', 'pomodoro'])
export const focusSessionStatusSchema = z.enum(['running', 'paused', 'finished', 'cancelled'])

export const focusCycleSettingsSchema = z.object({
  workSeconds: z.number().int().min(60).max(24 * 60 * 60),
  shortBreakSeconds: z.number().int().min(60).max(4 * 60 * 60),
  longBreakSeconds: z.number().int().min(60).max(8 * 60 * 60),
  cyclesBeforeLongBreak: z.number().int().min(1).max(12),
})

export const focusSessionCreateSchema = z.object({
  taskId: z.string().optional(),
  taskTitleSnapshot: z.string().trim().min(1).max(300).optional(),
  taskEstimateMinutesSnapshot: z.number().int().positive().max(24 * 60).optional(),
  projectIdSnapshot: z.string().optional(),
  projectNameSnapshot: z.string().trim().min(1).max(120).optional(),
  mode: focusModeSchema.default('stopwatch'),
  source: z.enum(['timer','manual']).default('timer'),
  targetSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),
  plannedSeconds: z.number().int().positive().max(24 * 60 * 60).optional(),
  intention: z.string().trim().max(240).optional(),
  note: z.string().trim().max(4000).optional(),
  context: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  interruptionCount: z.number().int().nonnegative().max(10_000).default(0),
  cycle: focusCycleSettingsSchema.optional(),
  cycleIndex: z.number().int().nonnegative().max(10_000).optional(),
  phase: z.enum(['focus','short-break','long-break']).optional(),
  phaseElapsedSeconds: z.number().int().nonnegative().max(24 * 60 * 60).default(0),
  breakSeconds: z.number().int().nonnegative().max(365 * 24 * 60 * 60).default(0),
  startedAt: isoDateTime.optional(),
  endedAt: isoDateTime.optional(),
  durationSeconds: z.number().int().nonnegative().max(365 * 24 * 60 * 60).default(0),
  status: focusSessionStatusSchema.default('running'),
}).superRefine((value, ctx) => {
  if (value.mode === 'countdown' && !value.targetSeconds) ctx.addIssue({ code: 'custom', message: 'Countdown sessions require a target duration.', path: ['targetSeconds'] })
  if (value.mode === 'pomodoro' && !value.cycle) ctx.addIssue({ code: 'custom', message: 'Pomodoro sessions require cycle settings.', path: ['cycle'] })
  if (value.source === 'manual' && (!value.startedAt || !value.endedAt || value.status !== 'finished')) ctx.addIssue({ code: 'custom', message: 'Manual time entries require start/end timestamps and finished status.', path: ['source'] })
})

export const focusSessionEditSchema = z.object({
  taskId: z.string().nullable().optional(),
  startedAt: isoDateTime.optional(),
  endedAt: isoDateTime.optional(),
  durationSeconds: z.number().int().nonnegative().max(365 * 24 * 60 * 60).optional(),
  note: z.string().trim().max(4000).nullable().optional(),
  context: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  interruptionCount: z.number().int().nonnegative().max(10_000).optional(),
}).superRefine((value, ctx) => {
  if (value.startedAt && value.endedAt && Date.parse(value.endedAt) <= Date.parse(value.startedAt)) ctx.addIssue({ code: 'custom', message: 'Focus session end must be after start.', path: ['endedAt'] })
})

export const reminderOwnerTypeSchema = z.enum(['task', 'series', 'habit', 'system'])
export const reminderTriggerTypeSchema = z.enum(['absolute', 'task-date', 'time-block', 'habit-time', 'daily'])
export const reminderTaskDateFieldSchema = z.enum(['plannedDate', 'deadline'])
export const reminderBlockEdgeSchema = z.enum(['start', 'end'])

export const reminderCreateSchema = z.object({
  ownerType: reminderOwnerTypeSchema,
  ownerId: z.string().min(1).max(200),
  label: z.string().trim().max(240).optional(),
  triggerType: reminderTriggerTypeSchema,
  absoluteAt: isoDateTime.optional(),
  taskDateField: reminderTaskDateFieldSchema.optional(),
  dayOffset: z.number().int().min(-3650).max(3650).optional(),
  minuteOfDay: z.number().int().min(0).max(1439).optional(),
  blockEdge: reminderBlockEdgeSchema.optional(),
  offsetMinutes: z.number().int().min(-30 * 24 * 60).max(30 * 24 * 60).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timeZone: z.string().trim().min(1).max(100).default('local'),
  persistent: z.boolean().default(false),
  enabled: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.triggerType === 'absolute' && !value.absoluteAt) ctx.addIssue({ code: 'custom', message: 'Absolute reminders require a date and time.', path: ['absoluteAt'] })
  if (value.triggerType === 'task-date' && !value.taskDateField) ctx.addIssue({ code: 'custom', message: 'Task-date reminders require planned date or deadline.', path: ['taskDateField'] })
  if ((value.triggerType === 'task-date' || value.triggerType === 'habit-time' || value.triggerType === 'daily') && value.minuteOfDay === undefined) ctx.addIssue({ code: 'custom', message: 'This reminder requires a time of day.', path: ['minuteOfDay'] })
  if (value.triggerType === 'time-block' && !value.blockEdge) ctx.addIssue({ code: 'custom', message: 'Time-block reminders require a start or end anchor.', path: ['blockEdge'] })
  if ((value.triggerType === 'task-date' || value.triggerType === 'time-block') && !['task','series'].includes(value.ownerType)) ctx.addIssue({ code: 'custom', message: 'Task reminders must belong to a task or recurring series.', path: ['ownerType'] })
  if (value.triggerType === 'habit-time' && value.ownerType !== 'habit') ctx.addIssue({ code: 'custom', message: 'Habit-time reminders must belong to a habit.', path: ['ownerType'] })
  if (value.triggerType === 'daily' && value.ownerType !== 'system') ctx.addIssue({ code: 'custom', message: 'Daily system reminders must use the system owner.', path: ['ownerType'] })
})

export const reminderUpdateSchema = reminderCreateSchema.partial()

export const appearanceSchema = z.object({
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  intensity: z.enum(['subtle', 'balanced', 'vivid']),
  density: z.enum(['comfortable', 'compact']),
})

export const reviewRecordMetricsSchema = z.object({
  plannedTasks: z.number().int().nonnegative(),
  completedPlannedTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  focusSeconds: z.number().nonnegative(),
  focusSessions: z.number().int().nonnegative(),
  habitCompletions: z.number().int().nonnegative(),
  scheduledMinutes: z.number().int().nonnegative(),
  completedMilestones: z.number().int().nonnegative(),
  activeProjects: z.number().int().nonnegative(),
})

export const reviewRecordSchema = z.object({
  id: z.string().min(1),
  kind: reviewKindSchema,
  periodStart: localDate,
  periodEnd: localDate,
  title: z.string().max(240),
  summary: z.string().max(20_000),
  wins: z.string().max(20_000),
  friction: z.string().max(20_000),
  lessons: z.string().max(20_000),
  nextFocus: z.string().max(20_000),
  metrics: reviewRecordMetricsSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime,
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
    reviewRecords: z.array(z.unknown()).default([]),
    reminders: z.array(z.unknown()).default([]),
    reminderOccurrences: z.array(z.unknown()).default([]),
    folders: z.array(z.unknown()).default([]),
    lists: z.array(z.unknown()).default([]),
    sections: z.array(z.unknown()).default([]),
    tags: z.array(z.unknown()).default([]),
    notes: z.array(z.unknown()).default([]),
    attachments: z.array(z.unknown()).default([]),
    habitGroups: z.array(z.unknown()).default([]),
    habitTemplates: z.array(z.unknown()).default([]),
  }),
}).transform((value) => ({ ...value, format: 'folio-backup' as const }))

export const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly', 'after-completion'])
export const completionIntervalUnitSchema = z.enum(['day', 'week', 'month', 'year'])
export const monthlyRecurrenceModeSchema = z.enum(['days', 'ordinal-weekday', 'last-day'])
export const recurrenceOrdinalSchema = z.union([z.literal(-1), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
export const recurringSeriesStatusSchema = z.enum(['active', 'paused', 'archived'])

export const recurrenceRuleSchema = z.object({
  frequency: recurrenceFrequencySchema,
  interval: z.number().int().positive().max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  monthDay: z.number().int().min(1).max(31).optional(),
  monthlyMode: monthlyRecurrenceModeSchema.default('days'),
  monthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
  ordinal: recurrenceOrdinalSchema.optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  yearMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  afterCompletionUnit: completionIntervalUnitSchema.default('day'),
  until: localDate.optional(),
  count: z.number().int().positive().max(10_000).optional(),
}).superRefine((value, ctx) => {
  if (value.until && value.count) ctx.addIssue({ code: 'custom', message: 'Use either an end date or an occurrence count, not both.', path: ['until'] })
  if (value.frequency === 'weekly' && (!value.weekdays || value.weekdays.length === 0)) ctx.addIssue({ code: 'custom', message: 'Weekly recurrence requires at least one weekday.', path: ['weekdays'] })
  if (value.frequency === 'monthly' && value.monthlyMode === 'days' && value.monthDays && value.monthDays.length === 0) ctx.addIssue({ code: 'custom', message: 'Choose at least one date of the month.', path: ['monthDays'] })
  if (value.frequency === 'monthly' && value.monthlyMode === 'ordinal-weekday' && value.ordinal === undefined) ctx.addIssue({ code: 'custom', message: 'Choose which weekday occurrence to repeat on.', path: ['ordinal'] })
  if (value.frequency === 'monthly' && value.monthlyMode === 'ordinal-weekday' && value.weekday === undefined) ctx.addIssue({ code: 'custom', message: 'Choose a weekday.', path: ['weekday'] })
  if (value.frequency === 'yearly' && value.yearMonths && value.yearMonths.length === 0) ctx.addIssue({ code: 'custom', message: 'Choose at least one month.', path: ['yearMonths'] })
})

export const recurringSeriesCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  timezone: z.string().min(1).default('local'),
  startDate: localDate,
  rule: recurrenceRuleSchema,
  taskTemplate: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(100_000).default(''),
    projectId: z.string().optional(),
    listId: z.string().optional(),
    sectionId: z.string().optional(),
    priority: taskPrioritySchema.default('normal'),
    estimatedMinutes: z.number().int().positive().max(24 * 60).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    tagIds: z.array(z.string()).max(50).default([]),
    checklist: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
    sourceUrl: z.string().trim().url().max(2048).optional(),
    location: z.string().trim().max(500).optional(),
    pinned: z.boolean().default(false),
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
