import type { RecurringSeriesEntity } from '../../domain/models'
import { calendarOccurrenceDates, nextCompletionRelativeDate } from './recurrenceLogic'

function series(partial: Partial<RecurringSeriesEntity>): RecurringSeriesEntity {
  const now = '2026-08-20T10:00:00.000Z'
  return {
    id: 's', title: 'Test', timezone: 'Europe/Berlin', status: 'active', startDate: '2026-08-20',
    rule: { frequency: 'daily', interval: 1 },
    taskTemplate: { title: 'Test', description: '', priority: 'normal' }, exceptions: {}, createdAt: now, updatedAt: now,
    ...partial,
  }
}

export function validateRecurrenceCases() {
  const failures: string[] = []
  const daily = calendarOccurrenceDates(series({ rule: { frequency: 'daily', interval: 2 } }), '2026-08-26')
  if (daily.join(',') !== '2026-08-20,2026-08-22,2026-08-24,2026-08-26') failures.push(`daily: ${daily.join(',')}`)
  const weekly = calendarOccurrenceDates(series({ rule: { frequency: 'weekly', interval: 1, weekdays: [1,3,5] } }), '2026-08-30')
  if (weekly.join(',') !== '2026-08-21,2026-08-24,2026-08-26,2026-08-28') failures.push(`weekly: ${weekly.join(',')}`)
  const monthly = calendarOccurrenceDates(series({ startDate: '2026-01-31', rule: { frequency: 'monthly', interval: 1, monthDay: 31 } }), '2026-04-30')
  if (monthly.join(',') !== '2026-01-31,2026-02-28,2026-03-31,2026-04-30') failures.push(`monthly: ${monthly.join(',')}`)
  const counted = calendarOccurrenceDates(series({ rule: { frequency: 'daily', interval: 1, count: 3 } }), '2026-09-30')
  if (counted.length !== 3) failures.push(`count: ${counted.length}`)
  const relative = nextCompletionRelativeDate(series({ rule: { frequency: 'after-completion', interval: 7 } }), '2026-08-23T20:00:00+02:00')
  if (relative !== '2026-08-30') failures.push(`after completion: ${relative}`)
  return failures
}
