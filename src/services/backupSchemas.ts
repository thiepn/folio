import { z } from 'zod'

const id = z.string().min(1)
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const iso = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO date-time')
const priority = z.enum(['normal', 'high', 'critical'])
const status = z.enum(['inbox', 'todo', 'completed', 'cancelled'])

const backupTaskChecklistItemSchema = z.object({ id, text: z.string(), completed: z.boolean(), sortOrder: z.number(), createdAt: iso, updatedAt: iso, completedAt: iso.optional() })
const backupTaskCommentSchema = z.object({ id, body: z.string(), createdAt: iso, updatedAt: iso })
const backupTaskActivitySchema = z.object({ id, kind: z.enum(['created','updated','completed','reopened','subtask','comment','restored','duplicated']), label: z.string(), at: iso })
export const backupTaskSchema = z.object({
  id, title: z.string(), description: z.string(), projectId: id.optional(), listId: id.optional(), sectionId: id.optional(), parentTaskId: id.optional(), priority, status,
  lastOpenStatus: z.enum(['inbox','todo']).optional(), plannedDate: localDate.optional(), deadline: localDate.optional(), timelineStart: localDate.optional(), timelineEnd: localDate.optional(), timelineMilestone: z.boolean().default(false), estimatedMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]), tagIds: z.array(id).default([]), checklist: z.array(backupTaskChecklistItemSchema).default([]), progressMode: z.enum(['auto','manual']).default('auto'), progressPercent: z.number().int().min(0).max(100).default(0),
  sourceUrl: z.string().optional(), location: z.string().optional(), pinned: z.boolean().default(false), comments: z.array(backupTaskCommentSchema).default([]), activity: z.array(backupTaskActivitySchema).default([]),
  seriesId: id.optional(), recurrenceDate: localDate.optional(), blockedByTaskIds: z.array(id).default([]), sortOrder: z.number(), rescheduleCount: z.number().int().nonnegative(), createdAt: iso, updatedAt: iso, completedAt: iso.optional(), deletedAt: iso.optional(),
})
const backupProjectMilestoneSchema = z.object({ id, title: z.string(), dueDate: localDate.optional(), completedAt: iso.optional(), sortOrder: z.number(), createdAt: iso, updatedAt: iso })
const backupProjectActivitySchema = z.object({ id, kind: z.enum(['project','milestone']), label: z.string(), at: iso })
export const backupProjectSchema = z.object({
  id, name: z.string(), description: z.string(), notes: z.string().default(''), color: z.string().optional(), icon: z.string().optional(), type: z.enum(['standard','academic']),
  status: z.enum(['active','on-hold','completed']).default('active'), deadline: localDate.optional(), nextActionTaskId: id.optional(), milestones: z.array(backupProjectMilestoneSchema).default([]), activity: z.array(backupProjectActivitySchema).default([]), completedAt: iso.optional(),
  archived: z.boolean(), archivedAt: iso.optional(), favorite: z.boolean(), examDate: localDate.optional(), weeklyTargetMinutes: z.number().int().positive().optional(), createdAt: iso, updatedAt: iso,
})
const backupHabitPauseSchema = z.object({ id, startDate: localDate, endDate: localDate.optional(), createdAt: iso })
export const backupHabitSchema = z.object({
  id, title: z.string(), description: z.string(), kind: z.enum(['check','duration']), target: z.number().int().positive(), schedule: z.object({ type: z.enum(['daily','weekdays','selected-days','times-per-week']), weekdays: z.array(z.number().int().min(0).max(6)).optional(), timesPerWeek: z.number().int().min(1).max(7).optional() }), countsTowardCapacity: z.boolean(), pauses: z.array(backupHabitPauseSchema).default([]), archived: z.boolean(), archivedAt: iso.optional(), sortOrder: z.number(), createdAt: iso, updatedAt: iso,
})
export const backupHabitEntrySchema = z.object({ id, habitId: id, date: localDate, value: z.number(), status: z.enum(['open','completed','skipped']), completedAt: iso.optional(), skippedAt: iso.optional(), updatedAt: iso })
export const backupTimeBlockSchema = z.object({ id, taskId: id.optional(), title: z.string(), description: z.string().optional(), location: z.string().optional(), kind: z.enum(['task','event']), allDay: z.boolean().default(false), timeZone: z.string().optional(), source: z.enum(['folio','ics']).default('folio'), sourceCalendar: z.string().optional(), sourceUid: z.string().optional(), start: iso, end: iso, createdAt: iso, updatedAt: iso }).superRefine((value, ctx) => {
  if (Date.parse(value.end) <= Date.parse(value.start)) ctx.addIssue({ code: 'custom', message: 'Time block end must be after start.', path: ['end'] })
  if (value.kind === 'task' && !value.taskId) ctx.addIssue({ code: 'custom', message: 'Task TimeBlock requires taskId.', path: ['taskId'] })
})
export const backupDailyPlanSchema = z.object({ date: localDate, status: z.enum(['draft','committed']), capacityMinutes: z.number().int().positive().optional(), committedAt: iso.optional(), createdAt: iso, updatedAt: iso })
export const backupDailyPlanItemSchema = z.object({ id, date: localDate, taskId: id, bucket: z.enum(['must','planned','optional']), sortOrder: z.number(), createdAt: iso, updatedAt: iso })
export const backupFocusSchema = z.object({ id, taskId: id.optional(), taskTitleSnapshot: z.string().optional(), taskEstimateMinutesSnapshot: z.number().int().positive().optional(), projectIdSnapshot: id.optional(), projectNameSnapshot: z.string().optional(), mode: z.enum(['stopwatch','countdown']), targetSeconds: z.number().int().positive().optional(), plannedSeconds: z.number().int().positive().optional(), intention: z.string().optional(), note: z.string().optional(), startedAt: iso, resumedAt: iso.optional(), endedAt: iso.optional(), durationSeconds: z.number().nonnegative(), status: z.enum(['running','paused','finished','cancelled']), createdAt: iso, updatedAt: iso })
const backupRecurrenceExceptionSchema = z.object({
  skip: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  projectId: id.nullable().optional(),
  listId: id.nullable().optional(),
  sectionId: id.nullable().optional(),
  priority: priority.optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tagIds: z.array(id).optional(),
  checklist: z.array(z.string()).optional(),
  sourceUrl: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  plannedDate: localDate.nullable().optional(),
  deadline: localDate.nullable().optional(),
  timelineStart: localDate.nullable().optional(),
  timelineEnd: localDate.nullable().optional(),
  timelineMilestone: z.boolean().optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  blockDurationMinutes: z.number().int().positive().optional(),
})
export const backupSeriesSchema = z.object({
  id, title: z.string(), timezone: z.string(), status: z.enum(['active','paused','archived']), startDate: localDate,
  rule: z.object({
    frequency: z.enum(['daily','weekly','monthly','yearly','after-completion']),
    interval: z.number().int().positive(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    monthlyMode: z.enum(['days','ordinal-weekday','last-day']).default('days'),
    monthDays: z.array(z.number().int().min(1).max(31)).optional(),
    ordinal: z.union([z.literal(-1),z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    yearMonths: z.array(z.number().int().min(1).max(12)).optional(),
    afterCompletionUnit: z.enum(['day','week','month','year']).default('day'),
    until: localDate.optional(),
    count: z.number().int().positive().optional(),
  }),
  taskTemplate: z.object({
    title: z.string(), description: z.string(), projectId: id.optional(), listId: id.optional(), sectionId: id.optional(), priority,
    estimatedMinutes: z.number().int().positive().optional(),
    tags: z.array(z.string()).default([]),
    tagIds: z.array(id).default([]),
    checklist: z.array(z.string()).default([]),
    sourceUrl: z.string().optional(),
    location: z.string().optional(),
    pinned: z.boolean().default(false),
    deadlineOffsetDays: z.number().int().nonnegative().optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    blockDurationMinutes: z.number().int().positive().optional(),
  }),
  exceptions: z.record(z.string(), backupRecurrenceExceptionSchema), materializedThrough: localDate.optional(), createdAt: iso, updatedAt: iso,
})
export const backupReminderSchema = z.object({
  id,
  ownerType: z.enum(['task','series','habit','system']),
  ownerId: z.string(),
  label: z.string().optional(),
  triggerType: z.enum(['absolute','task-date','time-block','habit-time','daily']),
  absoluteAt: iso.optional(),
  taskDateField: z.enum(['plannedDate','deadline']).optional(),
  dayOffset: z.number().int().optional(),
  minuteOfDay: z.number().int().min(0).max(1439).optional(),
  blockEdge: z.enum(['start','end']).optional(),
  offsetMinutes: z.number().int().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  timeZone: z.string(),
  persistent: z.boolean(),
  enabled: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
})
export const backupReminderOccurrenceSchema = z.object({
  id,
  reminderId: id,
  ownerType: z.enum(['task','series','habit','system']),
  ownerId: z.string(),
  targetTaskId: id.optional(),
  sourceKey: z.string(),
  scheduledFor: iso,
  fireAt: iso,
  status: z.enum(['scheduled','snoozed','due','dismissed','cancelled']),
  snoozedUntil: iso.optional(),
  deliveredAt: iso.optional(),
  dismissedAt: iso.optional(),
  deliveryCount: z.number().int().nonnegative(),
  titleSnapshot: z.string(),
  bodySnapshot: z.string().optional(),
  createdAt: iso,
  updatedAt: iso,
})

export const backupFolderSchema = z.object({
  id, name: z.string(), color: z.string().optional(), icon: z.string().optional(), sortOrder: z.number(), collapsed: z.boolean(),
  archived: z.boolean(), archivedAt: iso.optional(), createdAt: iso, updatedAt: iso,
})
export const backupListSchema = z.object({
  id, name: z.string(), description: z.string(), folderId: id.optional(), color: z.string().optional(), icon: z.string().optional(),
  favorite: z.boolean(), archived: z.boolean(), archivedAt: iso.optional(), sortOrder: z.number(),
  sortMode: z.enum(['manual','planned','deadline','priority','title','created','updated']),
  groupMode: z.enum(['section','none','planned','priority','tag']), showCompleted: z.boolean(), createdAt: iso, updatedAt: iso,
})
export const backupSectionSchema = z.object({
  id, listId: id, name: z.string(), sortOrder: z.number(), archived: z.boolean(), createdAt: iso, updatedAt: iso,
})
export const backupTagSchema = z.object({
  id, name: z.string(), normalizedName: z.string(), parentTagId: id.optional(), color: z.string().optional(), favorite: z.boolean(),
  archived: z.boolean(), sortOrder: z.number(), createdAt: iso, updatedAt: iso,
})

export const backupSettingSchema = z.object({ key: z.string().min(1), value: z.unknown(), updatedAt: iso })
const provenanceType = z.enum(['project','task','habit','timeBlock','recurringSeries'])
const snapshot = z.object({ type: z.enum(['project','task','habit','timeBlock','recurringSeries','dailyPlan','dailyPlanItem']), id, value: z.unknown() })
export const backupImportBatchSchema = z.object({ id, title: z.string(), source: z.enum(['chatgpt','file','clipboard','system']), status: z.enum(['previewed','applied','reverted','failed']), affectedEntities: z.array(z.object({ type: provenanceType, id })), createdSnapshots: z.array(snapshot), priorDailyPlans: z.array(z.object({ date: localDate, before: backupDailyPlanSchema.optional() })), createdAt: iso, updatedAt: iso, revertedAt: iso.optional(), errorMessage: z.string().optional() })
export const backupPatchBatchSchema = z.object({ id, title: z.string(), source: z.enum(['chatgpt','file','clipboard','system']), status: z.enum(['previewed','applied','reverted','failed']), operations: z.array(z.object({ operationId: id, op: z.enum(['create','update','delete']), entity: provenanceType, targetId: id, label: z.string() })), beforeSnapshots: z.array(snapshot), afterSnapshots: z.array(snapshot), createdAt: iso, updatedAt: iso, revertedAt: iso.optional(), errorMessage: z.string().optional() })
export const backupCalendarBatchSchema = z.object({ id, source: z.enum(['ics-file','ics-paste']), fileName: z.string().optional(), calendarName: z.string().optional(), status: z.enum(['applied','reverted','failed']), events: z.array(z.object({ uid: z.string().optional(), sourceKey: z.string().optional(), fingerprint: z.string(), timeBlockId: id, original: backupTimeBlockSchema })), createdAt: iso, updatedAt: iso, revertedAt: iso.optional(), errorMessage: z.string().optional() })

export const backupReviewRecordSchema = z.object({
  id, kind: z.enum(['daily','weekly','monthly']), periodStart: localDate, periodEnd: localDate, title: z.string(), summary: z.string(), wins: z.string(), friction: z.string(), lessons: z.string(), nextFocus: z.string(),
  metrics: z.object({ plannedTasks: z.number().int().nonnegative(), completedPlannedTasks: z.number().int().nonnegative(), completedTasks: z.number().int().nonnegative(), focusSeconds: z.number().nonnegative(), focusSessions: z.number().int().nonnegative(), habitCompletions: z.number().int().nonnegative(), scheduledMinutes: z.number().int().nonnegative(), completedMilestones: z.number().int().nonnegative(), activeProjects: z.number().int().nonnegative() }),
  createdAt: iso, updatedAt: iso, completedAt: iso,
})
