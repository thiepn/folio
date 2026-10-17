import type { FocusSessionEntity, HabitEntity, HabitEntryEntity, LocalDate, TimeBlockEntity } from '../domain/models'
import { localDateKey } from '../domain/date'

/**
 * Read-only, user-selected review over original Folio records. No new progress
 * authority, no inferred spiritual growth, and no mutation of habit/focus/calendar IDs.
 */
export interface FaithDisciplineWeek {
  from: LocalDate
  through: LocalDate
  practices: Array<{ id: string; title: string; completedDays: number; restDays: number }>
  focus: { sessions: number; seconds: number; interruptions: number }
  scheduledBlocks: number
}
export function faithDisciplineWeek(
  from: LocalDate,
  through: LocalDate,
  selectedHabitIds: readonly string[],
  selectedBlockIds: readonly string[],
  habits: readonly HabitEntity[],
  entries: readonly HabitEntryEntity[],
  sessions: readonly FocusSessionEntity[],
  blocks: readonly TimeBlockEntity[],
): FaithDisciplineWeek {
  const inRange = (day: string) => day >= from && day <= through
  const parse = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value+'T12:00:00Z')) &&
    new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value
  if (!parse(from) || !parse(through) || from > through ||
      Date.parse(through+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>6*86400000)
    throw new Error('Choose a valid week of no more than seven days.')
  if (selectedHabitIds.length > 20 || selectedBlockIds.length > 50 ||
      new Set(selectedHabitIds).size !== selectedHabitIds.length ||
      new Set(selectedBlockIds).size !== selectedBlockIds.length)
    throw new Error('Duplicate or oversized source selection.')
  const chosenHabits = habits.filter(h => selectedHabitIds.includes(h.id) && !h.archived)
  const practices = chosenHabits.map(habit => {
    const sourceRows = entries.filter(e => e.habitId === habit.id && inRange(e.date))
    return {
      id: habit.id,
      title: habit.title,
      completedDays: new Set(sourceRows.filter(e => e.status === 'completed').map(e => e.date)).size,
      restDays: new Set(sourceRows.filter(e => e.status === 'skipped').map(e => e.date)).size,
    }
  })
  // An explicitly tagged original Folio session is eligible. Untagged time
  // cannot be attributed to faith practices merely from its task title.
  const originalSessions = sessions.filter(s => s.status === 'finished' &&
    s.tags.includes('faith-discipline') && inRange(localDateKey(new Date(s.startedAt))))
  const selectedBlocks = blocks.filter(b => selectedBlockIds.includes(b.id) &&
    b.source !== 'google' && b.source !== 'klips' &&
    b.start.slice(0,10) <= through && b.end.slice(0,10) >= from)
  return {
    from, through, practices,
    focus: {
      sessions: originalSessions.length,
      seconds: originalSessions.reduce((sum,s)=>sum+Math.max(0,s.durationSeconds),0),
      interruptions: originalSessions.reduce((sum,s)=>sum+Math.max(0,s.interruptionCount),0),
    },
    scheduledBlocks: selectedBlocks.length,
  }
}
