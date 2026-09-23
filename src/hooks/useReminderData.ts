import { useLiveQuery } from 'dexie-react-hooks'
import { reminderRepository } from '../repositories/reminderRepository'

export function useReminderData() {
  return useLiveQuery(async () => {
    const [definitions, outstanding, upcoming] = await Promise.all([
      reminderRepository.listDefinitions(),
      reminderRepository.listOutstanding(),
      reminderRepository.listUpcoming(40),
    ])
    const due = outstanding.filter((item) => item.status === 'due')
    const snoozed = outstanding.filter((item) => item.status === 'snoozed')
    return {
      definitions,
      outstanding,
      due,
      snoozed,
      upcoming,
      dueCount: due.length,
      next: [...snoozed, ...upcoming].sort((a, b) => (a.snoozedUntil ?? a.fireAt).localeCompare(b.snoozedUntil ?? b.fireAt))[0],
    }
  }, [])
}
