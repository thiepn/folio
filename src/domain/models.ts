export type EntityId = string
export type LocalDate = string
export type IsoDateTime = string

export type TaskPriority = 'normal' | 'high' | 'critical'
export type TaskStatus = 'inbox' | 'todo' | 'completed' | 'cancelled'
export type ProjectType = 'standard' | 'academic'
export type ProjectStatus = 'active' | 'on-hold' | 'completed'
export type HabitKind = 'check' | 'duration'
export type HabitEntryStatus = 'open' | 'completed' | 'skipped'
export type TimeBlockKind = 'task' | 'event'
export type FocusMode = 'stopwatch' | 'countdown'
export type FocusSessionStatus = 'running' | 'paused' | 'finished' | 'cancelled'
export type ImportBatchStatus = 'previewed' | 'applied' | 'reverted' | 'failed'
export type PatchBatchStatus = 'previewed' | 'applied' | 'reverted' | 'failed'
export type CalendarImportBatchStatus = 'applied' | 'reverted' | 'failed'
export type ProvenanceEntityType = 'project' | 'task' | 'habit' | 'timeBlock' | 'recurringSeries'
export type PatchOperationKind = 'create' | 'update' | 'delete'
export type DailyPlanStatus = 'draft' | 'committed'
export type DailyPlanBucket = 'must' | 'planned' | 'optional'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'after-completion'
export type CompletionIntervalUnit = 'day' | 'week' | 'month' | 'year'
export type MonthlyRecurrenceMode = 'days' | 'ordinal-weekday' | 'last-day'
export type RecurrenceOrdinal = 1 | 2 | 3 | 4 | 5 | -1
export type RecurringSeriesStatus = 'active' | 'paused' | 'archived'
export type ReviewKind = 'daily' | 'weekly' | 'monthly'
export type TaskProgressMode = 'auto' | 'manual'
export type TaskActivityKind = 'created' | 'updated' | 'completed' | 'reopened' | 'subtask' | 'comment' | 'restored' | 'duplicated'
export type ReminderOwnerType = 'task' | 'series' | 'habit' | 'system'
export type ReminderTriggerType = 'absolute' | 'task-date' | 'time-block' | 'habit-time' | 'daily'
export type ReminderTaskDateField = 'plannedDate' | 'deadline'
export type ReminderBlockEdge = 'start' | 'end'
export type ReminderOccurrenceStatus = 'scheduled' | 'snoozed' | 'due' | 'dismissed' | 'cancelled'
export type ListSortMode = 'manual' | 'planned' | 'deadline' | 'priority' | 'title' | 'created' | 'updated'
export type ListGroupMode = 'section' | 'none' | 'planned' | 'priority' | 'tag'

export interface TaskChecklistItem {
  id: EntityId
  text: string
  completed: boolean
  sortOrder: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
}

export interface TaskComment {
  id: EntityId
  body: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TaskActivityEntry {
  id: EntityId
  kind: TaskActivityKind
  label: string
  at: IsoDateTime
}

export interface TaskEntity {
  id: EntityId
  title: string
  description: string
  projectId?: EntityId
  listId?: EntityId
  sectionId?: EntityId
  parentTaskId?: EntityId
  priority: TaskPriority
  status: TaskStatus
  lastOpenStatus?: 'inbox' | 'todo'
  plannedDate?: LocalDate
  deadline?: LocalDate
  timelineStart?: LocalDate
  timelineEnd?: LocalDate
  timelineMilestone: boolean
  estimatedMinutes?: number
  tags: string[]
  tagIds: EntityId[]
  checklist: TaskChecklistItem[]
  progressMode: TaskProgressMode
  progressPercent: number
  sourceUrl?: string
  location?: string
  pinned: boolean
  comments: TaskComment[]
  activity: TaskActivityEntry[]
  seriesId?: EntityId
  recurrenceDate?: LocalDate
  blockedByTaskIds: EntityId[]
  sortOrder: number
  rescheduleCount: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
  deletedAt?: IsoDateTime
}

export interface FolderEntity {
  id: EntityId
  name: string
  color?: string
  icon?: string
  sortOrder: number
  collapsed: boolean
  archived: boolean
  archivedAt?: IsoDateTime
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ListEntity {
  id: EntityId
  name: string
  description: string
  folderId?: EntityId
  color?: string
  icon?: string
  favorite: boolean
  archived: boolean
  archivedAt?: IsoDateTime
  sortOrder: number
  sortMode: ListSortMode
  groupMode: ListGroupMode
  showCompleted: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface SectionEntity {
  id: EntityId
  listId: EntityId
  name: string
  sortOrder: number
  archived: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TagEntity {
  id: EntityId
  name: string
  normalizedName: string
  parentTagId?: EntityId
  color?: string
  favorite: boolean
  archived: boolean
  sortOrder: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ProjectMilestone {
  id: EntityId
  title: string
  dueDate?: LocalDate
  completedAt?: IsoDateTime
  sortOrder: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ProjectActivityEntry {
  id: EntityId
  kind: 'project' | 'milestone'
  label: string
  at: IsoDateTime
}

export interface ProjectEntity {
  id: EntityId
  name: string
  description: string
  notes: string
  color?: string
  icon?: string
  type: ProjectType
  status: ProjectStatus
  deadline?: LocalDate
  nextActionTaskId?: EntityId
  milestones: ProjectMilestone[]
  activity: ProjectActivityEntry[]
  completedAt?: IsoDateTime
  archived: boolean
  archivedAt?: IsoDateTime
  favorite: boolean
  examDate?: LocalDate
  weeklyTargetMinutes?: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface HabitPausePeriod {
  id: EntityId
  startDate: LocalDate
  endDate?: LocalDate
  createdAt: IsoDateTime
}

export interface HabitEntity {
  id: EntityId
  title: string
  description: string
  kind: HabitKind
  target: number
  schedule: {
    type: 'daily' | 'weekdays' | 'selected-days' | 'times-per-week'
    weekdays?: number[]
    timesPerWeek?: number
  }
  countsTowardCapacity: boolean
  pauses: HabitPausePeriod[]
  archived: boolean
  archivedAt?: IsoDateTime
  sortOrder: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface HabitEntryEntity {
  id: string
  habitId: EntityId
  date: LocalDate
  value: number
  status: HabitEntryStatus
  completedAt?: IsoDateTime
  skippedAt?: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TimeBlockEntity {
  id: EntityId
  taskId?: EntityId
  title: string
  description?: string
  location?: string
  kind: TimeBlockKind
  allDay?: boolean
  timeZone?: string
  source?: 'folio' | 'ics'
  sourceCalendar?: string
  sourceUid?: string
  start: IsoDateTime
  end: IsoDateTime
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface FocusSessionEntity {
  id: EntityId
  taskId?: EntityId
  taskTitleSnapshot?: string
  taskEstimateMinutesSnapshot?: number
  projectIdSnapshot?: EntityId
  projectNameSnapshot?: string
  mode: FocusMode
  targetSeconds?: number
  plannedSeconds?: number
  intention?: string
  note?: string
  startedAt: IsoDateTime
  resumedAt?: IsoDateTime
  endedAt?: IsoDateTime
  durationSeconds: number
  status: FocusSessionStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface RecurrenceException {
  skip?: boolean
  title?: string
  description?: string
  projectId?: EntityId | null
  listId?: EntityId | null
  sectionId?: EntityId | null
  priority?: TaskPriority
  estimatedMinutes?: number | null
  tags?: string[]
  tagIds?: EntityId[]
  checklist?: string[]
  sourceUrl?: string | null
  location?: string | null
  pinned?: boolean
  plannedDate?: LocalDate | null
  deadline?: LocalDate | null
  timelineStart?: LocalDate | null
  timelineEnd?: LocalDate | null
  timelineMilestone?: boolean
  startMinute?: number
  blockDurationMinutes?: number
}

export interface RecurringSeriesEntity {
  id: EntityId
  title: string
  timezone: string
  status: RecurringSeriesStatus
  startDate: LocalDate
  rule: {
    frequency: RecurrenceFrequency
    interval: number
    weekdays?: number[]
    monthDay?: number
    monthlyMode?: MonthlyRecurrenceMode
    monthDays?: number[]
    ordinal?: RecurrenceOrdinal
    weekday?: number
    yearMonths?: number[]
    afterCompletionUnit?: CompletionIntervalUnit
    until?: LocalDate
    count?: number
  }
  taskTemplate: {
    title: string
    description: string
    projectId?: EntityId
    listId?: EntityId
    sectionId?: EntityId
    priority: TaskPriority
    estimatedMinutes?: number
    tags: string[]
    tagIds: EntityId[]
    checklist: string[]
    sourceUrl?: string
    location?: string
    pinned: boolean
    deadlineOffsetDays?: number
    startMinute?: number
    blockDurationMinutes?: number
  }
  exceptions: Record<LocalDate, RecurrenceException>
  materializedThrough?: LocalDate
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ReminderEntity {
  id: EntityId
  ownerType: ReminderOwnerType
  ownerId: string
  label?: string
  triggerType: ReminderTriggerType
  absoluteAt?: IsoDateTime
  taskDateField?: ReminderTaskDateField
  dayOffset?: number
  minuteOfDay?: number
  blockEdge?: ReminderBlockEdge
  offsetMinutes?: number
  weekdays?: number[]
  timeZone: string
  persistent: boolean
  enabled: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ReminderOccurrenceEntity {
  id: EntityId
  reminderId: EntityId
  ownerType: ReminderOwnerType
  ownerId: string
  targetTaskId?: EntityId
  sourceKey: string
  scheduledFor: IsoDateTime
  fireAt: IsoDateTime
  status: ReminderOccurrenceStatus
  snoozedUntil?: IsoDateTime
  deliveredAt?: IsoDateTime
  dismissedAt?: IsoDateTime
  deliveryCount: number
  titleSnapshot: string
  bodySnapshot?: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface SettingEntity<T = unknown> {
  key: string
  value: T
  updatedAt: IsoDateTime
}

export interface DailyPlanEntity {
  date: LocalDate
  status: DailyPlanStatus
  capacityMinutes?: number
  committedAt?: IsoDateTime
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface DailyPlanItemEntity {
  id: string
  date: LocalDate
  taskId: EntityId
  bucket: DailyPlanBucket
  sortOrder: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ReviewRecordMetrics {
  plannedTasks: number
  completedPlannedTasks: number
  completedTasks: number
  focusSeconds: number
  focusSessions: number
  habitCompletions: number
  scheduledMinutes: number
  completedMilestones: number
  activeProjects: number
}

export interface ReviewRecordEntity {
  id: EntityId
  kind: ReviewKind
  periodStart: LocalDate
  periodEnd: LocalDate
  title: string
  summary: string
  wins: string
  friction: string
  lessons: string
  nextFocus: string
  metrics: ReviewRecordMetrics
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt: IsoDateTime
}

export interface ProvenanceEntityRef {
  type: ProvenanceEntityType
  id: EntityId
}

export interface DailyPlanSnapshot {
  date: LocalDate
  before?: DailyPlanEntity
}

export interface ImportBatchEntity {
  id: EntityId
  title: string
  source: 'chatgpt' | 'file' | 'clipboard' | 'system'
  status: ImportBatchStatus
  affectedEntities: ProvenanceEntityRef[]
  createdSnapshots: PatchSnapshot[]
  priorDailyPlans: DailyPlanSnapshot[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  revertedAt?: IsoDateTime
  errorMessage?: string
}

export type PatchSnapshotType = ProvenanceEntityType | 'dailyPlan' | 'dailyPlanItem'

export interface PatchSnapshot {
  type: PatchSnapshotType
  id: string
  value: unknown
}

export interface PatchOperationSummary {
  operationId: string
  op: PatchOperationKind
  entity: ProvenanceEntityType
  targetId: string
  label: string
}

export interface PatchBatchEntity {
  id: EntityId
  title: string
  source: 'chatgpt' | 'file' | 'clipboard' | 'system'
  status: PatchBatchStatus
  operations: PatchOperationSummary[]
  beforeSnapshots: PatchSnapshot[]
  afterSnapshots: PatchSnapshot[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  revertedAt?: IsoDateTime
  errorMessage?: string
}


export interface CalendarImportEventRef {
  uid?: string
  sourceKey?: string
  fingerprint: string
  timeBlockId: EntityId
  original: TimeBlockEntity
}

export interface CalendarImportBatchEntity {
  id: EntityId
  source: 'ics-file' | 'ics-paste'
  fileName?: string
  calendarName?: string
  status: CalendarImportBatchStatus
  events: CalendarImportEventRef[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  revertedAt?: IsoDateTime
  errorMessage?: string
}

export interface LegacyTaskV1 {
  id: EntityId
  title: string
  projectId?: EntityId
  plannedDate?: LocalDate
  completed?: boolean
  priority?: TaskPriority
  estimatedMinutes?: number
}
