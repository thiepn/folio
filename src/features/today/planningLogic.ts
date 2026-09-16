import type { HabitPreview, TaskPreview } from '../../types/ui'

export function plannedTaskMinutes(tasks: TaskPreview[]): number {
  return tasks.filter((task) => !task.completed).reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0)
}

export function outstandingHabitMinutes(habits: HabitPreview[]): number {
  return habits
    .filter((habit) => habit.countsTowardCapacity && !habit.completed && !habit.skipped)
    .reduce((sum, habit) => sum + Math.max(0, (habit.target ?? 0) - (habit.currentValue ?? 0)), 0)
}

export function plannedDayMinutes(tasks: TaskPreview[], habits: HabitPreview[]): number {
  return plannedTaskMinutes(tasks) + outstandingHabitMinutes(habits)
}

export function recommendDeferrals(tasks: TaskPreview[], minutesOver: number, today: string): TaskPreview[] {
  if (minutesOver <= 0) return []
  const candidates = tasks
    .filter((task) => !task.completed && task.planningBucket !== 'must' && task.deadline !== today)
    .sort((a, b) => {
      const bucketScore = (value?: string) => value === 'optional' ? 0 : 1
      const deadlineScore = (value?: string) => value ? 1 : 0
      return bucketScore(a.planningBucket) - bucketScore(b.planningBucket)
        || deadlineScore(a.deadline) - deadlineScore(b.deadline)
        || (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0)
    })

  let recovered = 0
  const picked: TaskPreview[] = []
  for (const task of candidates) {
    picked.push(task)
    recovered += task.durationMinutes ?? 0
    if (recovered >= minutesOver) break
  }
  return picked
}
