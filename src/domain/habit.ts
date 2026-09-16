import { addLocalDays, localDateKey, localDateRange, localDateToDate, startOfLocalWeek } from './date'
import type { HabitEntity, HabitEntryEntity, LocalDate } from './models'

export function habitScheduledForDate(habit: HabitEntity, date: LocalDate): boolean {
  const weekday = localDateToDate(date).getDay()
  switch (habit.schedule.type) {
    case 'daily': return true
    case 'weekdays': return weekday >= 1 && weekday <= 5
    case 'selected-days': return habit.schedule.weekdays?.includes(weekday) ?? false
    case 'times-per-week': return false
  }
}

export function habitScheduleLabel(habit: HabitEntity): string {
  switch (habit.schedule.type) {
    case 'daily': return 'Every day'
    case 'weekdays': return 'Weekdays'
    case 'selected-days': {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return (habit.schedule.weekdays ?? []).map((day) => labels[day]).join(' · ') || 'Selected days'
    }
    case 'times-per-week': return `${habit.schedule.timesPerWeek ?? 1}× per week`
  }
}

export function entryCompleted(entry?: HabitEntryEntity): boolean {
  return entry?.status === 'completed'
}

export function entrySkipped(entry?: HabitEntryEntity): boolean {
  return entry?.status === 'skipped'
}

export function entriesByDate(entries: HabitEntryEntity[]): Map<LocalDate, HabitEntryEntity> {
  return new Map(entries.map((entry) => [entry.date, entry]))
}

function flexibleTargetForWeek(habit: HabitEntity, weekStart: LocalDate): number {
  const target = habit.schedule.timesPerWeek ?? 1
  const createdDate = localDateKey(new Date(habit.createdAt))
  const weekEnd = addLocalDays(weekStart, 6)
  if (createdDate <= weekStart) return target
  if (createdDate > weekEnd) return 0
  const remainingDays = Math.max(1, Math.round((localDateToDate(weekEnd).getTime() - localDateToDate(createdDate).getTime()) / 86_400_000) + 1)
  return Math.max(1, Math.ceil((target * remainingDays) / 7))
}

export function habitWeekProgress(habit: HabitEntity, entries: HabitEntryEntity[], date: LocalDate) {
  const start = startOfLocalWeek(date)
  const dates = localDateRange(start, 7)
  const byDate = entriesByDate(entries)
  if (habit.schedule.type === 'times-per-week') {
    const target = flexibleTargetForWeek(habit, start)
    const completed = dates.filter((day) => day >= localDateKey(new Date(habit.createdAt)) && entryCompleted(byDate.get(day))).length
    return { completed, target, skipped: 0, due: target, label: target ? `${Math.min(completed, target)} / ${target} this week` : 'Starts next week' }
  }
  const createdDate = localDateKey(new Date(habit.createdAt))
  const dueDates = dates.filter((day) => day >= createdDate && day <= date && habitScheduledForDate(habit, day))
  const skipped = dueDates.filter((day) => entrySkipped(byDate.get(day))).length
  const eligible = dueDates.filter((day) => !entrySkipped(byDate.get(day)))
  const completed = eligible.filter((day) => entryCompleted(byDate.get(day))).length
  return { completed, target: eligible.length, skipped, due: dueDates.length, label: eligible.length ? `${completed} / ${eligible.length} due so far` : 'No due days yet' }
}

export function habitCurrentStreak(habit: HabitEntity, entries: HabitEntryEntity[], today: LocalDate): number {
  const byDate = entriesByDate(entries)
  const createdDate = habit.createdAt ? localDateKey(new Date(habit.createdAt)) : addLocalDays(today, -365)

  if (habit.schedule.type === 'times-per-week') {
    let weekStart = startOfLocalWeek(today)
    const earliestWeek = startOfLocalWeek(createdDate)
    let streak = 0
    while (weekStart >= earliestWeek) {
      const dates = localDateRange(weekStart, 7)
      const target = flexibleTargetForWeek(habit, weekStart)
      if (target === 0) break
      const completed = dates.filter((day) => day >= createdDate && entryCompleted(byDate.get(day))).length
      const currentWeek = weekStart === startOfLocalWeek(today)
      if (currentWeek && completed < target) {
        weekStart = addLocalDays(weekStart, -7)
        continue
      }
      if (completed >= target) streak += 1
      else break
      weekStart = addLocalDays(weekStart, -7)
    }
    return streak
  }

  let streak = 0
  let date = today
  while (date >= createdDate) {
    if (habitScheduledForDate(habit, date)) {
      const entry = byDate.get(date)
      if (entrySkipped(entry)) { date = addLocalDays(date, -1); continue }
      if (date === today && !entryCompleted(entry)) { date = addLocalDays(date, -1); continue }
      if (entryCompleted(entry)) streak += 1
      else break
    }
    date = addLocalDays(date, -1)
  }
  return streak
}

export function habitAdherence(habit: HabitEntity, entries: HabitEntryEntity[], start: LocalDate, end: LocalDate, today: LocalDate) {
  const cappedEnd = end > today ? today : end
  const createdDate = localDateKey(new Date(habit.createdAt))
  const effectiveStart = start < createdDate ? createdDate : start
  if (effectiveStart > cappedEnd) return { completed: 0, target: 0, percent: 100 }
  const byDate = entriesByDate(entries)
  if (habit.schedule.type === 'times-per-week') {
    let cursor = startOfLocalWeek(effectiveStart)
    let completed = 0
    let target = 0
    while (cursor <= cappedEnd) {
      const weekDates = localDateRange(cursor, 7).filter((date) => date >= effectiveStart && date <= cappedEnd)
      const weekTarget = flexibleTargetForWeek(habit, cursor)
      const weekCompleted = weekDates.filter((date) => entryCompleted(byDate.get(date))).length
      completed += Math.min(weekCompleted, weekTarget)
      target += weekTarget
      cursor = addLocalDays(cursor, 7)
    }
    return { completed, target, percent: target ? Math.round((completed / target) * 100) : 100 }
  }

  const dates = localDateRange(effectiveStart, Math.max(0, Math.round((localDateToDate(cappedEnd).getTime() - localDateToDate(effectiveStart).getTime()) / 86_400_000)) + 1)
    .filter((date) => habitScheduledForDate(habit, date))
  const eligible = dates.filter((date) => !entrySkipped(byDate.get(date)))
  const completed = eligible.filter((date) => entryCompleted(byDate.get(date))).length
  return { completed, target: eligible.length, percent: eligible.length ? Math.round((completed / eligible.length) * 100) : 100 }
}

export function habitHistoryStatus(habit: HabitEntity, entry: HabitEntryEntity | undefined, date: LocalDate, today: LocalDate): 'complete' | 'skipped' | 'missed' | 'open' | 'off' {
  const createdDate = localDateKey(new Date(habit.createdAt))
  if (date < createdDate) return 'off'
  if (entry?.status === 'completed') return 'complete'
  if (entry?.status === 'skipped') return 'skipped'
  const scheduled = habit.schedule.type === 'times-per-week' ? Boolean(entry) : habitScheduledForDate(habit, date)
  if (!scheduled) return 'off'
  if (date >= today) return 'open'
  return 'missed'
}
