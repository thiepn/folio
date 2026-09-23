export type NavView = 'today' | 'inbox' | 'planner' | 'projects' | 'lists' | 'notes' | 'habits' | 'review'
export type AccentIntensity = 'subtle' | 'balanced' | 'vivid'
export type Density = 'comfortable' | 'compact'

export interface TaskPreview {
  id: string
  title: string
  description?: string
  project?: string
  projectId?: string
  list?: string
  listId?: string
  section?: string
  sectionId?: string
  parentTaskId?: string
  meta?: string
  durationMinutes?: number
  tags?: string[]
  tagIds?: string[]
  checklist?: Array<{ id: string; text: string; completed: boolean; sortOrder: number; createdAt: string; updatedAt: string; completedAt?: string }>
  progressMode?: 'auto' | 'manual'
  progressPercent?: number
  sourceUrl?: string
  location?: string
  pinned?: boolean
  comments?: Array<{ id: string; body: string; createdAt: string; updatedAt: string }>
  activity?: Array<{ id: string; kind: 'created' | 'updated' | 'completed' | 'reopened' | 'subtask' | 'comment' | 'restored' | 'duplicated'; label: string; at: string }>
  priority: 'normal' | 'high' | 'critical'
  completed: boolean
  plannedDate?: string
  deadline?: string
  timelineStart?: string
  timelineEnd?: string
  timelineMilestone?: boolean
  status: 'inbox' | 'todo' | 'completed' | 'cancelled'
  rescheduleCount: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  subtaskTotal?: number
  subtaskCompleted?: number
  planningBucket?: 'must' | 'planned' | 'optional'
  planningOrder?: number
  seriesId?: string
  recurrenceDate?: string
  blockedByTaskIds?: string[]
  activeBlockerCount?: number
  blockedByTitles?: string[]
}

export interface HabitPreview {
  id: string
  title: string
  description?: string
  kind: 'check' | 'duration'
  completed: boolean
  skipped?: boolean
  flexible?: boolean
  paused?: boolean
  pauseLabel?: string
  scheduledToday?: boolean
  progress?: string
  countsTowardCapacity?: boolean
  target?: number
  currentValue?: number
  scheduleLabel?: string
  streak?: number
  weeklyProgress?: string
  weeklyPercent?: number
  adherence4w?: number
  archived?: boolean
}

export interface SchedulePreview {
  kind: 'task' | 'event'
  id: string
  taskId?: string
  time: string
  date: string
  start: string
  end: string
  name: string
  durationMinutes: number
}

export interface FocusSessionPreview {
  id: string
  taskId?: string
  taskTitle: string
  projectId?: string
  projectName?: string
  mode: 'stopwatch' | 'countdown'
  targetSeconds?: number
  plannedSeconds?: number
  intention?: string
  note?: string
  durationSeconds: number
  startedAt: string
  endedAt?: string
  status: 'running' | 'paused' | 'finished' | 'cancelled'
}
