import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, localDateRange, startOfLocalWeek } from '../domain/date'
import { habitAdherence, habitCurrentPause, habitCurrentStreak, habitPauseLabel, habitScheduleLabel, habitScheduledForDate, habitWeekProgress } from '../domain/habit'
import type { HabitEntryEntity, LocalDate } from '../domain/models'
import { habitRepository } from '../repositories/habitRepository'
import type { HabitPreview } from '../types/ui'

function mapByHabit(entries: HabitEntryEntity[]) {
  const map = new Map<string, HabitEntryEntity[]>()
  for (const entry of entries) {
    const list = map.get(entry.habitId) ?? []
    list.push(entry)
    map.set(entry.habitId, list)
  }
  return map
}

export function useHabitData(today: LocalDate = localDateKey()) {
  return useLiveQuery(async () => {
    const adherenceStart = addLocalDays(startOfLocalWeek(today), -21)
    const weekStart = startOfLocalWeek(today)
    const [active, archived, entries] = await Promise.all([
      habitRepository.listActive(),
      habitRepository.listArchived(),
      habitRepository.listAllEntries(),
    ])
    const byHabit = mapByHabit(entries)
    const todayEntries = new Map(entries.filter((entry) => entry.date === today).map((entry) => [entry.habitId, entry]))

    const makePreview = (habit: (typeof active)[number], flexible = false): HabitPreview => {
      const habitEntries = byHabit.get(habit.id) ?? []
      const entry = todayEntries.get(habit.id)
      const week = habitWeekProgress(habit, habitEntries, today)
      const adherence = habitAdherence(habit, habitEntries, adherenceStart, today, today)
      const currentValue = entry?.value ?? 0
      const pause = habitCurrentPause(habit, today)
      const paused = Boolean(pause)
      return {
        id: habit.id,
        title: habit.title,
        description: habit.description,
        kind: habit.kind,
        completed: entry?.status === 'completed' || currentValue >= habit.target,
        skipped: entry?.status === 'skipped',
        flexible,
        paused,
        pauseLabel: habitPauseLabel(habit, today),
        scheduledToday: Boolean(entry) || (!paused && (flexible || habitScheduledForDate(habit, today))),
        progress: habit.kind === 'duration' ? `${currentValue} / ${habit.target}m` : undefined,
        countsTowardCapacity: !paused && habit.countsTowardCapacity && (!flexible || Boolean(entry)),
        target: habit.target,
        currentValue,
        scheduleLabel: habitScheduleLabel(habit),
        streak: habitCurrentStreak(habit, habitEntries, today),
        weeklyProgress: week.label,
        weeklyPercent: week.target ? Math.min(100, Math.round((week.completed / week.target) * 100)) : 100,
        adherence4w: adherence.percent,
        archived: habit.archived,
      }
    }

    const previews = active.map((habit) => makePreview(habit))
    const previewMap = new Map(previews.map((preview) => [preview.id, preview]))
    const fixedTodayIds = new Set(active.filter((habit) => todayEntries.has(habit.id) || habitScheduledForDate(habit, today)).map((habit) => habit.id))
    const fixedToday = active.filter((habit) => fixedTodayIds.has(habit.id)).map((habit) => makePreview(habit))
    const flexible = active
      .filter((habit) => habit.schedule.type === 'times-per-week' && !fixedTodayIds.has(habit.id) && !habitCurrentPause(habit, today))
      .filter((habit) => {
        const progress = habitWeekProgress(habit, byHabit.get(habit.id) ?? [], today)
        return progress.target > 0 && progress.completed < progress.target
      })
      .map((habit) => makePreview(habit, true))

    let adherenceCompleted = 0
    let adherenceTarget = 0
    for (const habit of active) {
      const habitEntries = byHabit.get(habit.id) ?? []
      if (habit.schedule.type === 'times-per-week') {
        const week = habitWeekProgress(habit, habitEntries, today)
        const weekday = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / 86_400_000) + 1
        const expectedByNow = week.target ? Math.floor((week.target * Math.min(7, Math.max(1, weekday))) / 7) : 0
        adherenceCompleted += Math.min(week.completed, expectedByNow)
        adherenceTarget += expectedByNow
      } else {
        const dueDates = localDateRange(weekStart, 7).filter((date) => date <= today && habitScheduledForDate(habit, date))
        const entryMap = new Map(habitEntries.map((entry) => [entry.date, entry]))
        for (const date of dueDates) {
          const entry = entryMap.get(date)
          if (entry?.status === 'skipped') continue
          adherenceTarget += 1
          if (entry?.status === 'completed') adherenceCompleted += 1
        }
      }
    }

    const atRiskHabits = previews
      .filter((habit) => !habit.paused && (habit.weeklyPercent ?? 100) < 100)
      .sort((a, b) => (a.weeklyPercent ?? 100) - (b.weeklyPercent ?? 100))

    return {
      habitEntities: active,
      habits: previews,
      todayHabits: [...fixedToday, ...flexible],
      archivedHabits: archived,
      entries,
      weeklyAdherence: adherenceTarget ? Math.round((adherenceCompleted / adherenceTarget) * 100) : 100,
      dueToday: active.filter((habit) => habitScheduledForDate(habit, today)).filter((habit) => { const preview = previewMap.get(habit.id); return preview && !preview.completed && !preview.skipped }).length,
      longestStreak: previews.reduce((max, habit) => Math.max(max, habit.streak ?? 0), 0),
      pausedCount: previews.filter((habit) => habit.paused).length,
      atRiskHabits,
    }
  }, [today])
}
