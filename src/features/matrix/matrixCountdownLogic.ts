import { addLocalDays, formatLocalDate, localDateToDate } from '../../domain/date'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskPreview } from '../../types/ui'

export type MatrixQuadrant = 'do' | 'schedule' | 'delegate' | 'later'
export type CountdownKind = 'task' | 'project' | 'exam' | 'milestone'
export type CountdownBand = 'overdue' | 'today' | 'week' | 'month' | 'later'

export interface MatrixTask {
  task: TaskPreview
  quadrant: MatrixQuadrant
  important: boolean
  urgent: boolean
  daysUntilDeadline?: number
  urgencyReason?: string
}

export interface MatrixSnapshot {
  horizonDays: number
  tasks: MatrixTask[]
  quadrants: Record<MatrixQuadrant, MatrixTask[]>
  counts: Record<MatrixQuadrant, number>
}

export interface CountdownItem {
  id: string
  kind: CountdownKind
  ownerId: string
  title: string
  context?: string
  date: string
  daysRemaining: number
  band: CountdownBand
  color?: string
  critical?: boolean
}

export interface CountdownSnapshot {
  items: CountdownItem[]
  bands: Record<CountdownBand, CountdownItem[]>
  counts: Record<CountdownBand, number>
  nearest?: CountdownItem
}

function dayDiff(from: string, to: string) {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

function matrixTask(task: TaskPreview) {
  return !task.deletedAt && task.status === 'todo' && !task.completed
}

function countdownTask(task: TaskPreview) {
  return !task.deletedAt && (task.status === 'todo' || task.status === 'inbox') && !task.completed
}

export function taskImportance(task: TaskPreview) {
  return task.priority === 'high' || task.priority === 'critical'
}

export function taskUrgency(task: TaskPreview, today: string, horizonDays: number) {
  if (task.deadline) {
    const days = dayDiff(today, task.deadline)
    if (days < 0) return { urgent: true, daysUntilDeadline: days, reason: Math.abs(days) + 'd overdue' }
    if (days === 0) return { urgent: true, daysUntilDeadline: 0, reason: 'Due today' }
    if (days <= horizonDays) return { urgent: true, daysUntilDeadline: days, reason: 'Due in ' + days + 'd' }
  }
  if (task.plannedDate && task.plannedDate <= today) {
    const days = dayDiff(task.plannedDate, today)
    return { urgent: true, daysUntilDeadline: task.deadline ? dayDiff(today, task.deadline) : undefined, reason: days ? 'Planned ' + days + 'd ago' : 'Planned today' }
  }
  return { urgent: false, daysUntilDeadline: task.deadline ? dayDiff(today, task.deadline) : undefined, reason: task.deadline ? 'Due ' + formatLocalDate(task.deadline) : undefined }
}

function quadrantOf(important: boolean, urgent: boolean): MatrixQuadrant {
  if (important && urgent) return 'do'
  if (important) return 'schedule'
  if (urgent) return 'delegate'
  return 'later'
}

const priorityRank = { critical: 0, high: 1, normal: 2 }

function matrixSort(a: MatrixTask, b: MatrixTask) {
  const overdueA = a.daysUntilDeadline != null && a.daysUntilDeadline < 0 ? a.daysUntilDeadline : Infinity
  const overdueB = b.daysUntilDeadline != null && b.daysUntilDeadline < 0 ? b.daysUntilDeadline : Infinity
  if (overdueA !== overdueB) return overdueA - overdueB
  const deadlineA = a.task.deadline ?? '9999-99-99'
  const deadlineB = b.task.deadline ?? '9999-99-99'
  if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB)
  const priority = priorityRank[a.task.priority] - priorityRank[b.task.priority]
  if (priority) return priority
  return a.task.title.localeCompare(b.task.title)
}

export function buildMatrix(tasks: TaskPreview[], today: string, horizonDays = 7): MatrixSnapshot {
  const rows = tasks.filter(matrixTask).map((task) => {
    const important = taskImportance(task)
    const urgency = taskUrgency(task, today, horizonDays)
    return {
      task,
      important,
      urgent: urgency.urgent,
      daysUntilDeadline: urgency.daysUntilDeadline,
      urgencyReason: urgency.reason,
      quadrant: quadrantOf(important, urgency.urgent),
    } satisfies MatrixTask
  }).sort(matrixSort)
  const quadrants: Record<MatrixQuadrant, MatrixTask[]> = { do: [], schedule: [], delegate: [], later: [] }
  for (const row of rows) quadrants[row.quadrant].push(row)
  return {
    horizonDays,
    tasks: rows,
    quadrants,
    counts: { do: quadrants.do.length, schedule: quadrants.schedule.length, delegate: quadrants.delegate.length, later: quadrants.later.length },
  }
}

function bandFor(daysRemaining: number): CountdownBand {
  if (daysRemaining < 0) return 'overdue'
  if (daysRemaining === 0) return 'today'
  if (daysRemaining <= 7) return 'week'
  if (daysRemaining <= 30) return 'month'
  return 'later'
}

function countdownSort(a: CountdownItem, b: CountdownItem) {
  if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining
  const kindRank: Record<CountdownKind, number> = { exam: 0, milestone: 1, project: 2, task: 3 }
  const kind = kindRank[a.kind] - kindRank[b.kind]
  return kind || a.title.localeCompare(b.title)
}

export function buildCountdown(tasks: TaskPreview[], projects: ProjectSummary[], today: string): CountdownSnapshot {
  const items: CountdownItem[] = []
  for (const task of tasks.filter(countdownTask)) {
    if (!task.deadline) continue
    const daysRemaining = dayDiff(today, task.deadline)
    items.push({
      id: 'task:' + task.id,
      kind: 'task',
      ownerId: task.id,
      title: task.title,
      context: task.project ?? 'Task',
      date: task.deadline,
      daysRemaining,
      band: bandFor(daysRemaining),
      critical: task.priority === 'critical',
    })
  }
  for (const project of projects) {
    if (project.archived || project.status === 'completed') continue
    if (project.deadline) {
      const daysRemaining = dayDiff(today, project.deadline)
      items.push({ id: 'project:' + project.id, kind: 'project', ownerId: project.id, title: project.name, context: 'Project deadline', date: project.deadline, daysRemaining, band: bandFor(daysRemaining), color: project.color })
    }
    if (project.examDate) {
      const daysRemaining = dayDiff(today, project.examDate)
      items.push({ id: 'exam:' + project.id, kind: 'exam', ownerId: project.id, title: project.name + ' exam', context: project.name, date: project.examDate, daysRemaining, band: bandFor(daysRemaining), color: project.color, critical: true })
    }
    for (const milestone of project.milestones ?? []) {
      if (!milestone.dueDate || milestone.completedAt) continue
      const daysRemaining = dayDiff(today, milestone.dueDate)
      items.push({ id: 'milestone:' + project.id + ':' + milestone.id, kind: 'milestone', ownerId: project.id, title: milestone.title, context: project.name, date: milestone.dueDate, daysRemaining, band: bandFor(daysRemaining), color: project.color })
    }
  }
  items.sort(countdownSort)
  const bands: Record<CountdownBand, CountdownItem[]> = { overdue: [], today: [], week: [], month: [], later: [] }
  for (const item of items) bands[item.band].push(item)
  return {
    items,
    bands,
    counts: { overdue: bands.overdue.length, today: bands.today.length, week: bands.week.length, month: bands.month.length, later: bands.later.length },
    nearest: items.find((item) => item.daysRemaining >= 0) ?? [...items].filter((item) => item.daysRemaining < 0).sort((a, b) => b.daysRemaining - a.daysRemaining)[0],
  }
}

export function countdownWindow(items: CountdownItem[], days: number | 'all') {
  if (days === 'all') return items
  return items.filter((item) => item.daysRemaining <= days)
}

export function countdownLabel(item: CountdownItem) {
  if (item.daysRemaining < 0) return Math.abs(item.daysRemaining) + 'd overdue'
  if (item.daysRemaining === 0) return 'Today'
  if (item.daysRemaining === 1) return 'Tomorrow'
  return item.daysRemaining + ' days'
}

export function matrixHorizonDate(today: string, horizonDays: number) {
  return addLocalDays(today, horizonDays)
}
