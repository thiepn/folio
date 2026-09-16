import type { HabitEntity, HabitEntryEntity } from '../../domain/models'
import { habitAdherence, habitCurrentStreak, habitWeekProgress } from '../../domain/habit'

const now = '2026-08-20T10:00:00.000Z'
function habit(partial: Partial<HabitEntity>): HabitEntity {
  return { id: 'h', title: 'Habit', description: '', kind: 'check', target: 1, schedule: { type: 'daily' }, countsTowardCapacity: false, archived: false, sortOrder: 1, createdAt: '2026-08-01T10:00:00.000Z', updatedAt: now, ...partial, pauses: partial.pauses ?? [] }
}
function entry(date: string, status: 'open' | 'completed' | 'skipped', value = status === 'completed' ? 1 : 0): HabitEntryEntity {
  return { id: `h:${date}`, habitId: 'h', date, value, status, completedAt: status === 'completed' ? now : undefined, skippedAt: status === 'skipped' ? now : undefined, updatedAt: now }
}

export function validateHabitLogicCases() {
  const failures: string[] = []
  const daily = habit({})
  const dailyEntries = [entry('2026-08-17', 'completed'), entry('2026-08-18', 'skipped'), entry('2026-08-19', 'completed')]
  if (habitCurrentStreak(daily, dailyEntries, '2026-08-20') !== 2) failures.push('rest day should be streak-neutral')
  const adherence = habitAdherence(daily, dailyEntries, '2026-08-17', '2026-08-20', '2026-08-20')
  if (adherence.completed !== 2 || adherence.target !== 3 || adherence.percent !== 67) failures.push(`daily adherence ${JSON.stringify(adherence)}`)

  const paused = habit({ pauses: [{ id: 'pause-1', startDate: '2026-08-18', endDate: '2026-08-18', createdAt: now }] })
  const pausedEntries = [entry('2026-08-17', 'completed'), entry('2026-08-19', 'completed')]
  if (habitCurrentStreak(paused, pausedEntries, '2026-08-20') !== 2) failures.push('paused date should be streak-neutral')
  const pausedAdherence = habitAdherence(paused, pausedEntries, '2026-08-17', '2026-08-20', '2026-08-20')
  if (pausedAdherence.completed !== 2 || pausedAdherence.target !== 3 || pausedAdherence.percent !== 67) failures.push(`paused adherence ${JSON.stringify(pausedAdherence)}`)

  const selected = habit({ schedule: { type: 'selected-days', weekdays: [1, 3, 5] } })
  const selectedEntries = [entry('2026-08-17', 'completed'), entry('2026-08-19', 'completed')]
  const selectedWeek = habitWeekProgress(selected, selectedEntries, '2026-08-20')
  if (selectedWeek.completed !== 2 || selectedWeek.target !== 2) failures.push(`selected weekdays ${JSON.stringify(selectedWeek)}`)

  const flexible = habit({ schedule: { type: 'times-per-week', timesPerWeek: 3 } })
  const flexibleEntries = [entry('2026-08-17', 'completed'), entry('2026-08-19', 'completed')]
  const flexibleWeek = habitWeekProgress(flexible, flexibleEntries, '2026-08-20')
  if (flexibleWeek.completed !== 2 || flexibleWeek.target !== 3) failures.push(`times-per-week ${JSON.stringify(flexibleWeek)}`)

  return failures
}
