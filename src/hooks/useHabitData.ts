import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, startOfLocalWeek } from '../domain/date'
import { habitAdherence, habitCurrentPause, habitCurrentStreak, habitLifetimeStats, habitPauseLabel, habitPeriodProgress, habitScheduleLabel, habitScheduledForDate } from '../domain/habit'
import type { HabitEntryEntity, LocalDate } from '../domain/models'
import { habitRepository } from '../repositories/habitRepository'
import { habitGroupRepository } from '../repositories/habitGroupRepository'
import { habitTemplateRepository } from '../repositories/habitTemplateRepository'
import type { HabitPreview } from '../types/ui'

function mapByHabit(entries: HabitEntryEntity[]) {
  const map = new Map<string, HabitEntryEntity[]>()
  for (const entry of entries) {
    const list = map.get(entry.habitId) ?? []
    list.push(entry); map.set(entry.habitId, list)
  }
  return map
}
function isFlexible(type: string) { return type === 'times-per-week' || type === 'times-per-month' }

export function useHabitData(today: LocalDate = localDateKey()) {
  return useLiveQuery(async () => {
    const adherenceStart = addLocalDays(startOfLocalWeek(today), -21)
    const weekStart = startOfLocalWeek(today)
    const [active, archived, entries, groups, templates] = await Promise.all([
      habitRepository.listActive(),
      habitRepository.listArchived(),
      habitRepository.listAllEntries(),
      habitGroupRepository.listAll(),
      habitTemplateRepository.listAll(),
    ])
    const byHabit = mapByHabit(entries)
    const todayEntries = new Map(entries.filter((entry) => entry.date === today).map((entry) => [entry.habitId, entry]))

    const makePreview = (habit: (typeof active)[number], flexible = false): HabitPreview => {
      const habitEntries = byHabit.get(habit.id) ?? []
      const entry = todayEntries.get(habit.id)
      const period = habitPeriodProgress(habit, habitEntries, today)
      const adherence = habitAdherence(habit, habitEntries, adherenceStart, today, today)
      const lifetime = habitLifetimeStats(habit, habitEntries, today)
      const currentValue = entry?.value ?? 0
      const pause = habitCurrentPause(habit, today)
      const paused = Boolean(pause)
      const suffix = habit.kind === 'duration' ? 'm' : habit.kind === 'quantity' ? ` ${habit.unit ?? 'units'}` : ''
      const flexibleSchedule = isFlexible(habit.schedule.type)
      return {
        id: habit.id,
        title: habit.title,
        description: habit.description,
        kind: habit.kind,
        unit: habit.unit,
        color: habit.color,
        groupId: habit.groupId,
        completed: entry?.status === 'completed' || currentValue >= habit.target,
        skipped: entry?.status === 'skipped',
        flexible,
        paused,
        pauseLabel: habitPauseLabel(habit, today),
        scheduledToday: Boolean(entry) || (!paused && (flexible || habitScheduledForDate(habit, today))),
        progress: habit.kind === 'check' ? undefined : `${currentValue} / ${habit.target}${suffix}`,
        countsTowardCapacity: !paused && habit.countsTowardCapacity && (!flexibleSchedule || Boolean(entry)),
        target: habit.target,
        currentValue,
        scheduleLabel: habitScheduleLabel(habit),
        streak: habitCurrentStreak(habit, habitEntries, today),
        weeklyProgress: period.label,
        weeklyPercent: period.target ? Math.min(100, Math.round((period.completed / period.target) * 100)) : 100,
        periodProgress: period.label,
        periodPercent: period.target ? Math.min(100, Math.round((period.completed / period.target) * 100)) : 100,
        periodLabel: period.period === 'month' ? 'month' : 'week',
        adherence4w: adherence.percent,
        adherence90: lifetime.adherence90,
        bestStreak: lifetime.bestStreak,
        lifetimeCompletions: lifetime.completions,
        lifetimeValue: lifetime.totalValue,
        archived: habit.archived,
      }
    }

    const previews = active.map((habit) => makePreview(habit))
    const previewMap = new Map(previews.map((preview) => [preview.id, preview]))
    const fixedTodayIds = new Set(active.filter((habit) => todayEntries.has(habit.id) || habitScheduledForDate(habit, today)).map((habit) => habit.id))
    const fixedToday = active.filter((habit) => fixedTodayIds.has(habit.id)).map((habit) => makePreview(habit))
    const flexible = active
      .filter((habit) => isFlexible(habit.schedule.type) && !fixedTodayIds.has(habit.id) && !habitCurrentPause(habit, today))
      .filter((habit) => {
        const progress = habitPeriodProgress(habit, byHabit.get(habit.id) ?? [], today)
        return progress.target > 0 && progress.completed < progress.target
      })
      .map((habit) => makePreview(habit, true))

    let adherenceCompleted = 0, adherenceTarget = 0
    for (const habit of active) {
      const result = habitAdherence(habit, byHabit.get(habit.id) ?? [], weekStart, today, today)
      adherenceCompleted += result.completed
      adherenceTarget += result.target
    }

    const atRiskHabits = previews.filter((habit) => !habit.paused && (habit.periodPercent ?? 100) < 100).sort((a, b) => (a.periodPercent ?? 100) - (b.periodPercent ?? 100))

    return {
      habitEntities: active,
      habits: previews,
      todayHabits: [...fixedToday, ...flexible],
      archivedHabits: archived,
      entries,
      groups,
      templates,
      customTemplates: templates.filter((template) => !template.builtin),
      weeklyAdherence: adherenceTarget ? Math.round((adherenceCompleted / adherenceTarget) * 100) : 100,
      dueToday: active.filter((habit) => habitScheduledForDate(habit, today)).filter((habit) => { const preview = previewMap.get(habit.id); return preview && !preview.completed && !preview.skipped }).length,
      longestStreak: previews.reduce((max, habit) => Math.max(max, habit.streak ?? 0), 0),
      pausedCount: previews.filter((habit) => habit.paused).length,
      atRiskHabits,
    }
  }, [today])
}
