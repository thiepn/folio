import { addLocalDays, localDateKey, localDateRange, localDateToDate, startOfLocalWeek } from './date'
import type { HabitEntity, HabitEntryEntity, HabitPausePeriod, LocalDate } from './models'

export function habitPauseForDate(habit: HabitEntity, date: LocalDate): HabitPausePeriod | undefined {
  return (habit.pauses ?? []).find((pause) => date >= pause.startDate && (!pause.endDate || date <= pause.endDate))
}
export function habitPausedForDate(habit: HabitEntity, date: LocalDate) { return Boolean(habitPauseForDate(habit, date)) }
export function habitCurrentPause(habit: HabitEntity, today: LocalDate) { return habitPauseForDate(habit, today) }

function monthStart(date: LocalDate): LocalDate { return `${date.slice(0, 7)}-01` }
function nextMonthStart(date: LocalDate): LocalDate {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  const next = month === 12 ? [year + 1, 1] : [year, month + 1]
  return `${next[0]}-${String(next[1]).padStart(2, '0')}-01`
}
function monthEnd(date: LocalDate): LocalDate { return addLocalDays(nextMonthStart(date), -1) }
function daysInclusive(start: LocalDate, end: LocalDate): LocalDate[] {
  const count = Math.max(0, Math.round((localDateToDate(end).getTime() - localDateToDate(start).getTime()) / 86_400_000)) + 1
  return localDateRange(start, count)
}
function createdDate(habit: HabitEntity) { return localDateKey(new Date(habit.createdAt)) }
function flexible(habit: HabitEntity) { return habit.schedule.type === 'times-per-week' || habit.schedule.type === 'times-per-month' }

export function habitScheduledForDate(habit: HabitEntity, date: LocalDate): boolean {
  if (habitPausedForDate(habit, date)) return false
  const weekday = localDateToDate(date).getDay()
  switch (habit.schedule.type) {
    case 'daily': return true
    case 'weekdays': return weekday >= 1 && weekday <= 5
    case 'selected-days': return habit.schedule.weekdays?.includes(weekday) ?? false
    case 'times-per-week':
    case 'times-per-month': return false
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
    case 'times-per-month': return `${habit.schedule.timesPerMonth ?? 1}× per month`
  }
}

export function habitPauseLabel(habit: HabitEntity, today: LocalDate): string | undefined {
  const pause = habitCurrentPause(habit, today)
  if (!pause) return undefined
  return pause.endDate ? `Paused through ${pause.endDate}` : 'Paused until resumed'
}
export function entryCompleted(entry?: HabitEntryEntity) { return entry?.status === 'completed' }
export function entrySkipped(entry?: HabitEntryEntity) { return entry?.status === 'skipped' }
export function entriesByDate(entries: HabitEntryEntity[]) { return new Map(entries.map((entry) => [entry.date, entry])) }

function proportionalTarget(base: number, habit: HabitEntity, start: LocalDate, end: LocalDate, denominator: number) {
  const created = createdDate(habit)
  const eligible = daysInclusive(start, end).filter((date) => date >= created && !habitPausedForDate(habit, date)).length
  if (!eligible) return 0
  return Math.max(1, Math.ceil((base * eligible) / Math.max(1, denominator)))
}
function weeklyTarget(habit: HabitEntity, weekStart: LocalDate) {
  return proportionalTarget(habit.schedule.timesPerWeek ?? 1, habit, weekStart, addLocalDays(weekStart, 6), 7)
}
function monthlyTarget(habit: HabitEntity, date: LocalDate, rangeStart = monthStart(date), rangeEnd = monthEnd(date)) {
  const start = monthStart(date), end = monthEnd(date)
  const denominator = daysInclusive(start, end).length
  return proportionalTarget(habit.schedule.timesPerMonth ?? 1, habit, rangeStart, rangeEnd, denominator)
}

export function habitWeekProgress(habit: HabitEntity, entries: HabitEntryEntity[], date: LocalDate) {
  if (habit.schedule.type === 'times-per-month') return habitPeriodProgress(habit, entries, date)
  const start = startOfLocalWeek(date)
  const dates = localDateRange(start, 7)
  const byDate = entriesByDate(entries)
  if (habit.schedule.type === 'times-per-week') {
    const target = weeklyTarget(habit, start)
    const created = createdDate(habit)
    const completed = dates.filter((day) => day >= created && !habitPausedForDate(habit, day) && entryCompleted(byDate.get(day))).length
    return { completed, target, skipped: 0, due: target, label: target ? `${Math.min(completed, target)} / ${target} this week` : 'Paused this week', period: 'week' as const }
  }
  const created = createdDate(habit)
  const dueDates = dates.filter((day) => day >= created && day <= date && habitScheduledForDate(habit, day))
  const skipped = dueDates.filter((day) => entrySkipped(byDate.get(day))).length
  const eligible = dueDates.filter((day) => !entrySkipped(byDate.get(day)))
  const completed = eligible.filter((day) => entryCompleted(byDate.get(day))).length
  return { completed, target: eligible.length, skipped, due: dueDates.length, label: eligible.length ? `${completed} / ${eligible.length} due so far` : habitCurrentPause(habit, date) ? 'Paused' : 'No due days yet', period: 'week' as const }
}

export function habitPeriodProgress(habit: HabitEntity, entries: HabitEntryEntity[], date: LocalDate) {
  if (habit.schedule.type !== 'times-per-month') return habitWeekProgress(habit, entries, date)
  const start = monthStart(date)
  const end = monthEnd(date)
  const byDate = entriesByDate(entries)
  const target = monthlyTarget(habit, date)
  const completed = daysInclusive(start, end).filter((day) => day <= date && !habitPausedForDate(habit, day) && entryCompleted(byDate.get(day))).length
  return { completed, target, skipped: 0, due: target, label: target ? `${Math.min(completed, target)} / ${target} this month` : 'Paused this month', period: 'month' as const }
}

export function habitCurrentStreak(habit: HabitEntity, entries: HabitEntryEntity[], today: LocalDate): number {
  const byDate = entriesByDate(entries)
  const created = createdDate(habit)
  if (habit.schedule.type === 'times-per-week') {
    let cursor = startOfLocalWeek(today), earliest = startOfLocalWeek(created), streak = 0
    while (cursor >= earliest) {
      const target = weeklyTarget(habit, cursor)
      if (!target) { cursor = addLocalDays(cursor, -7); continue }
      const completed = localDateRange(cursor, 7).filter((day) => day >= created && !habitPausedForDate(habit, day) && entryCompleted(byDate.get(day))).length
      if (cursor === startOfLocalWeek(today) && completed < target) { cursor = addLocalDays(cursor, -7); continue }
      if (completed >= target) streak += 1; else break
      cursor = addLocalDays(cursor, -7)
    }
    return streak
  }
  if (habit.schedule.type === 'times-per-month') {
    let cursor = monthStart(today), earliest = monthStart(created), streak = 0
    while (cursor >= earliest) {
      const target = monthlyTarget(habit, cursor)
      if (!target) { cursor = monthStart(addLocalDays(cursor, -1)); continue }
      const completed = daysInclusive(cursor, monthEnd(cursor)).filter((day) => day >= created && !habitPausedForDate(habit, day) && entryCompleted(byDate.get(day))).length
      if (cursor === monthStart(today) && completed < target) { cursor = monthStart(addLocalDays(cursor, -1)); continue }
      if (completed >= target) streak += 1; else break
      cursor = monthStart(addLocalDays(cursor, -1))
    }
    return streak
  }
  let streak = 0, date = today
  while (date >= created) {
    if (habitPausedForDate(habit, date)) { date = addLocalDays(date, -1); continue }
    if (habitScheduledForDate(habit, date)) {
      const entry = byDate.get(date)
      if (entrySkipped(entry)) { date = addLocalDays(date, -1); continue }
      if (date === today && !entryCompleted(entry)) { date = addLocalDays(date, -1); continue }
      if (entryCompleted(entry)) streak += 1; else break
    }
    date = addLocalDays(date, -1)
  }
  return streak
}

export function habitAdherence(habit: HabitEntity, entries: HabitEntryEntity[], start: LocalDate, end: LocalDate, today: LocalDate) {
  const cappedEnd = end > today ? today : end
  const created = createdDate(habit)
  const effectiveStart = start < created ? created : start
  if (effectiveStart > cappedEnd) return { completed: 0, target: 0, percent: 100 }
  const byDate = entriesByDate(entries)

  if (habit.schedule.type === 'times-per-week') {
    let cursor = startOfLocalWeek(effectiveStart), completed = 0, target = 0
    while (cursor <= cappedEnd) {
      const rangeStart = cursor < effectiveStart ? effectiveStart : cursor
      const rangeEnd = addLocalDays(cursor, 6) > cappedEnd ? cappedEnd : addLocalDays(cursor, 6)
      const weekTarget = proportionalTarget(habit.schedule.timesPerWeek ?? 1, habit, rangeStart, rangeEnd, 7)
      const weekCompleted = daysInclusive(rangeStart, rangeEnd).filter((date) => !habitPausedForDate(habit, date) && entryCompleted(byDate.get(date))).length
      completed += Math.min(weekCompleted, weekTarget); target += weekTarget; cursor = addLocalDays(cursor, 7)
    }
    return { completed, target, percent: target ? Math.round((completed / target) * 100) : 100 }
  }

  if (habit.schedule.type === 'times-per-month') {
    let cursor = monthStart(effectiveStart), completed = 0, target = 0
    while (cursor <= cappedEnd) {
      const rangeStart = cursor < effectiveStart ? effectiveStart : cursor
      const rangeEnd = monthEnd(cursor) > cappedEnd ? cappedEnd : monthEnd(cursor)
      const monthTargetValue = monthlyTarget(habit, cursor, rangeStart, rangeEnd)
      const monthCompleted = daysInclusive(rangeStart, rangeEnd).filter((date) => !habitPausedForDate(habit, date) && entryCompleted(byDate.get(date))).length
      completed += Math.min(monthCompleted, monthTargetValue); target += monthTargetValue; cursor = nextMonthStart(cursor)
    }
    return { completed, target, percent: target ? Math.round((completed / target) * 100) : 100 }
  }

  const dates = daysInclusive(effectiveStart, cappedEnd).filter((date) => habitScheduledForDate(habit, date))
  const eligible = dates.filter((date) => !entrySkipped(byDate.get(date)))
  const completed = eligible.filter((date) => entryCompleted(byDate.get(date))).length
  return { completed, target: eligible.length, percent: eligible.length ? Math.round((completed / eligible.length) * 100) : 100 }
}

export function habitBestStreak(habit: HabitEntity, entries: HabitEntryEntity[], today: LocalDate) {
  const created = createdDate(habit)
  if (habit.schedule.type === 'times-per-week') {
    let cursor = startOfLocalWeek(created), best = 0, run = 0
    while (cursor <= startOfLocalWeek(today)) {
      const p = habitWeekProgress(habit, entries, addLocalDays(cursor, 6))
      if (!p.target) { cursor = addLocalDays(cursor, 7); continue }
      if (p.completed >= p.target) { run += 1; best = Math.max(best, run) } else run = 0
      cursor = addLocalDays(cursor, 7)
    }
    return best
  }
  if (habit.schedule.type === 'times-per-month') {
    let cursor = monthStart(created), best = 0, run = 0
    while (cursor <= monthStart(today)) {
      const p = habitPeriodProgress(habit, entries, monthEnd(cursor) > today ? today : monthEnd(cursor))
      if (!p.target) { cursor = nextMonthStart(cursor); continue }
      if (p.completed >= p.target) { run += 1; best = Math.max(best, run) } else if (cursor !== monthStart(today)) run = 0
      cursor = nextMonthStart(cursor)
    }
    return best
  }
  const byDate = entriesByDate(entries)
  let date = created, best = 0, run = 0
  while (date <= today) {
    if (habitPausedForDate(habit, date) || !habitScheduledForDate(habit, date) || entrySkipped(byDate.get(date))) { date = addLocalDays(date, 1); continue }
    if (entryCompleted(byDate.get(date))) { run += 1; best = Math.max(best, run) } else if (date < today) run = 0
    date = addLocalDays(date, 1)
  }
  return best
}

export function habitLifetimeStats(habit: HabitEntity, entries: HabitEntryEntity[], today: LocalDate) {
  const completedEntries = entries.filter((entry) => entry.status === 'completed')
  const adherence90 = habitAdherence(habit, entries, addLocalDays(today, -89), today, today)
  return {
    completions: completedEntries.length,
    totalValue: completedEntries.reduce((sum, entry) => sum + entry.value, 0),
    bestStreak: habitBestStreak(habit, entries, today),
    adherence90: adherence90.percent,
  }
}

export interface HabitWeekTrendPoint { weekStart: LocalDate; weekEnd: LocalDate; completed: number; target: number; percent: number; neutral: boolean }
export function habitWeeklyTrend(habit: HabitEntity, entries: HabitEntryEntity[], today: LocalDate, weeks = 12): HabitWeekTrendPoint[] {
  const current = startOfLocalWeek(today)
  return Array.from({ length: weeks }, (_, index) => addLocalDays(current, -(weeks - 1 - index) * 7)).map((weekStart) => {
    const weekEnd = addLocalDays(weekStart, 6)
    const cappedEnd = weekEnd > today ? today : weekEnd
    const adherence = habitAdherence(habit, entries, weekStart, cappedEnd, today)
    return { weekStart, weekEnd, ...adherence, neutral: adherence.target === 0 }
  })
}

export function habitHistoryStatus(habit: HabitEntity, entry: HabitEntryEntity | undefined, date: LocalDate, today: LocalDate): 'complete' | 'skipped' | 'paused' | 'missed' | 'open' | 'off' {
  const created = createdDate(habit)
  if (date < created) return 'off'
  if (entry?.status === 'completed') return 'complete'
  if (entry?.status === 'skipped') return 'skipped'
  if (habitPausedForDate(habit, date)) return 'paused'
  const scheduled = flexible(habit) ? Boolean(entry) : habitScheduledForDate(habit, date)
  if (!scheduled) return 'off'
  if (date >= today) return 'open'
  return 'missed'
}
