import type { RecurringSeriesEntity } from '../../domain/models'
import { calendarOccurrenceDates, nextCompletionRelativeDate } from './recurrenceLogic'

function series(partial: Partial<RecurringSeriesEntity>): RecurringSeriesEntity {
  const now = '2026-08-20T10:00:00.000Z'
  return {
    id: 's',
    title: 'Test',
    timezone: 'Europe/Berlin',
    status: 'active',
    startDate: '2026-08-20',
    rule: { frequency: 'daily', interval: 1, monthlyMode: 'days', afterCompletionUnit: 'day' },
    taskTemplate: {
      title: 'Test',
      description: '',
      priority: 'normal',
      tags: [],
      tagIds: [],
      checklist: [],
      pinned: false,
    },
    exceptions: {},
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function validateRecurrenceCases() {
  const failures: string[] = []

  const daily = calendarOccurrenceDates(series({ rule: { frequency: 'daily', interval: 2, monthlyMode: 'days', afterCompletionUnit: 'day' } }), '2026-08-26')
  if (daily.join(',') !== '2026-08-20,2026-08-22,2026-08-24,2026-08-26') failures.push(`daily: ${daily.join(',')}`)

  const weekly = calendarOccurrenceDates(series({ rule: { frequency: 'weekly', interval: 1, weekdays: [1,3,5], monthlyMode: 'days', afterCompletionUnit: 'day' } }), '2026-08-30')
  if (weekly.join(',') !== '2026-08-21,2026-08-24,2026-08-26,2026-08-28') failures.push(`weekly: ${weekly.join(',')}`)

  // Calendar-week anchoring: start Thu Aug 20, then every 2 weeks on Monday.
  // Monday Aug 24 is in the next calendar week and must not be treated as week 0.
  const biweekly = calendarOccurrenceDates(series({ rule: { frequency: 'weekly', interval: 2, weekdays: [1], monthlyMode: 'days', afterCompletionUnit: 'day' } }), '2026-09-14')
  if (biweekly.join(',') !== '2026-08-31,2026-09-14') failures.push(`biweekly calendar anchor: ${biweekly.join(',')}`)

  const monthlyClamp = calendarOccurrenceDates(series({
    startDate: '2026-01-31',
    rule: { frequency: 'monthly', interval: 1, monthlyMode: 'days', monthDays: [31], afterCompletionUnit: 'day' },
  }), '2026-04-30')
  if (monthlyClamp.join(',') !== '2026-01-31,2026-02-28,2026-03-31,2026-04-30') failures.push(`monthly clamp: ${monthlyClamp.join(',')}`)

  const monthlyMultiple = calendarOccurrenceDates(series({
    startDate: '2026-01-01',
    rule: { frequency: 'monthly', interval: 1, monthlyMode: 'days', monthDays: [1,15], afterCompletionUnit: 'day' },
  }), '2026-02-20')
  if (monthlyMultiple.join(',') !== '2026-01-01,2026-01-15,2026-02-01,2026-02-15') failures.push(`monthly multiple: ${monthlyMultiple.join(',')}`)

  const lastDay = calendarOccurrenceDates(series({
    startDate: '2026-01-01',
    rule: { frequency: 'monthly', interval: 1, monthlyMode: 'last-day', afterCompletionUnit: 'day' },
  }), '2026-03-31')
  if (lastDay.join(',') !== '2026-01-31,2026-02-28,2026-03-31') failures.push(`monthly last day: ${lastDay.join(',')}`)

  const lastFriday = calendarOccurrenceDates(series({
    startDate: '2026-01-01',
    rule: { frequency: 'monthly', interval: 1, monthlyMode: 'ordinal-weekday', ordinal: -1, weekday: 5, afterCompletionUnit: 'day' },
  }), '2026-03-31')
  if (lastFriday.join(',') !== '2026-01-30,2026-02-27,2026-03-27') failures.push(`last Friday: ${lastFriday.join(',')}`)

  const yearly = calendarOccurrenceDates(series({
    startDate: '2026-01-01',
    rule: { frequency: 'yearly', interval: 1, yearMonths: [1,7], monthDays: [31], monthlyMode: 'days', afterCompletionUnit: 'day' },
  }), '2027-02-01')
  if (yearly.join(',') !== '2026-01-31,2026-07-31,2027-01-31') failures.push(`yearly selected months: ${yearly.join(',')}`)

  const counted = calendarOccurrenceDates(series({ rule: { frequency: 'daily', interval: 1, count: 3, monthlyMode: 'days', afterCompletionUnit: 'day' } }), '2026-09-30')
  if (counted.length !== 3) failures.push(`count: ${counted.length}`)

  const relativeDay = nextCompletionRelativeDate(series({ rule: { frequency: 'after-completion', interval: 7, monthlyMode: 'days', afterCompletionUnit: 'day' } }), '2026-08-23T20:00:00+02:00')
  if (relativeDay !== '2026-08-30') failures.push(`after completion day: ${relativeDay}`)

  const relativeMonth = nextCompletionRelativeDate(series({ rule: { frequency: 'after-completion', interval: 1, monthlyMode: 'days', afterCompletionUnit: 'month' } }), '2026-01-31T20:00:00+01:00')
  if (relativeMonth !== '2026-02-28') failures.push(`after completion month clamp: ${relativeMonth}`)

  // Completion date is evaluated in the series time zone, not the device time zone.
  const berlinDate = nextCompletionRelativeDate(series({
    timezone: 'Europe/Berlin',
    rule: { frequency: 'after-completion', interval: 1, monthlyMode: 'days', afterCompletionUnit: 'day' },
  }), '2026-08-23T22:30:00.000Z')
  if (berlinDate !== '2026-08-25') failures.push(`series timezone completion date: ${berlinDate}`)

  return failures
}
