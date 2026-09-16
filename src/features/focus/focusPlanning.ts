import { localDateKey, localDateToDate } from '../../domain/date'
import type { TaskPreview } from '../../types/ui'

function dayDistance(from: string, to: string) {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

export function focusTaskScore(task: TaskPreview, today = localDateKey()): number {
  if (task.completed || task.status !== 'todo') return -100_000
  if ((task.activeBlockerCount ?? 0) > 0) return -50_000
  let score = 0
  if (task.plannedDate === today) score += 800
  else if (task.plannedDate && task.plannedDate < today) score += 700
  else if (task.plannedDate) score += Math.max(0, 180 - Math.max(0, dayDistance(today, task.plannedDate)) * 18)
  if (task.planningBucket === 'must') score += 360
  else if (task.planningBucket === 'planned') score += 160
  if (task.priority === 'critical') score += 320
  else if (task.priority === 'high') score += 180
  if (task.deadline) {
    const days = dayDistance(today, task.deadline)
    if (days < 0) score += 500
    else score += Math.max(0, 360 - days * 45)
  }
  score -= Math.min(120, task.rescheduleCount * 12)
  return score
}

export function rankFocusTasks(tasks: TaskPreview[], today = localDateKey()): TaskPreview[] {
  return [...tasks]
    .filter((task) => !task.completed && task.status === 'todo' && (task.activeBlockerCount ?? 0) === 0)
    .sort((a, b) => focusTaskScore(b, today) - focusTaskScore(a, today) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.title.localeCompare(b.title))
}

export function suggestFocusMinutes(task: TaskPreview | undefined, alreadyFocusedSeconds = 0): number {
  if (!task?.durationMinutes) return 25
  const remaining = Math.max(5, Math.ceil(task.durationMinutes - alreadyFocusedSeconds / 60))
  if (remaining <= 15) return remaining
  if (remaining <= 30) return 25
  if (remaining <= 50) return 45
  if (remaining <= 75) return 60
  return 90
}

export function focusTaskReason(task: TaskPreview, today = localDateKey()): string {
  if (task.plannedDate === today && task.deadline === today) return 'Planned today · due today'
  if (task.deadline && task.deadline < today) return 'Deadline overdue'
  if (task.plannedDate && task.plannedDate < today) return 'Carryover work'
  if (task.plannedDate === today) return 'Planned today'
  if (task.deadline === today) return 'Due today'
  if (task.priority === 'critical') return 'Critical priority'
  if (task.deadline) return `Due ${task.deadline}`
  if (task.project) return task.project
  return 'Open task'
}
