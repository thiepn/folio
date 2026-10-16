import { db } from '../db/database'
import type { LocalDate } from '../domain/models'
import { faithDisciplineWeek } from './faithDisciplineReview'

/** Only Folio's native service reads Folio IndexedDB. No Hub/KEEP access. */
export async function readFaithDisciplineWeek(
  from: LocalDate, through: LocalDate, selectedHabitIds: readonly string[],
) {
  return db.transaction('r', [db.habits, db.habitEntries, db.focusSessions], async () => {
    const [habits, entries, sessions] = await Promise.all([
      db.habits.toArray(), db.habitEntries.toArray(), db.focusSessions.toArray(),
    ])
    return faithDisciplineWeek(from, through, selectedHabitIds, [], habits, entries, sessions, [])
  })
}
