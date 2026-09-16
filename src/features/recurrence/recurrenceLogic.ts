import { addLocalDays, localDateKey, localDateToDate } from '../../domain/date'
import type { LocalDate, RecurringSeriesEntity } from '../../domain/models'

export const DEFAULT_MATERIALIZATION_DAYS = 120

function dayDiff(from: LocalDate, to: LocalDate) {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

function monthDiff(from: LocalDate, to: LocalDate) {
  const a = localDateToDate(from), b = localDateToDate(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

function daysInMonth(year: number, monthIndex: number) { return new Date(year, monthIndex + 1, 0).getDate() }

function calendarMatches(series: RecurringSeriesEntity, date: LocalDate) {
  const { frequency, interval } = series.rule
  if (date < series.startDate) return false
  if (series.rule.until && date > series.rule.until) return false
  const start = localDateToDate(series.startDate)
  const current = localDateToDate(date)

  if (frequency === 'daily') return dayDiff(series.startDate, date) % interval === 0
  if (frequency === 'weekly') {
    const weeks = Math.floor(dayDiff(series.startDate, date) / 7)
    const weekdays = series.rule.weekdays?.length ? series.rule.weekdays : [start.getDay()]
    return weeks % interval === 0 && weekdays.includes(current.getDay())
  }
  if (frequency === 'monthly') {
    const months = monthDiff(series.startDate, date)
    if (months < 0 || months % interval !== 0) return false
    const target = series.rule.monthDay ?? start.getDate()
    return current.getDate() === Math.min(target, daysInMonth(current.getFullYear(), current.getMonth()))
  }
  if (frequency === 'yearly') {
    const years = current.getFullYear() - start.getFullYear()
    if (years < 0 || years % interval !== 0 || current.getMonth() !== start.getMonth()) return false
    return current.getDate() === Math.min(start.getDate(), daysInMonth(current.getFullYear(), current.getMonth()))
  }
  return false
}

export function calendarOccurrenceDates(series: RecurringSeriesEntity, through: LocalDate): LocalDate[] {
  if (series.status !== 'active' || series.rule.frequency === 'after-completion') return []
  const dates: LocalDate[] = []
  const hardThrough = series.rule.until && series.rule.until < through ? series.rule.until : through
  let cursor = series.startDate
  let guard = 0
  const countLimit = series.rule.count ?? Number.POSITIVE_INFINITY
  while (cursor <= hardThrough && dates.length < countLimit && guard < 200_000) {
    if (calendarMatches(series, cursor)) dates.push(cursor)
    cursor = addLocalDays(cursor, 1)
    guard += 1
  }
  return dates
}

export function nextCompletionRelativeDate(series: RecurringSeriesEntity, completedAt: string): LocalDate | undefined {
  if (series.status !== 'active' || series.rule.frequency !== 'after-completion') return undefined
  const completedDate = localDateKey(new Date(completedAt))
  const next = addLocalDays(completedDate, series.rule.interval)
  if (series.rule.until && next > series.rule.until) return undefined
  return next
}

export function seriesSummary(series: RecurringSeriesEntity) {
  const rule = series.rule
  const end = rule.until ? ` until ${rule.until}` : rule.count ? ` · ${rule.count} times` : ''
  if (rule.frequency === 'after-completion') return `Every ${rule.interval} day${rule.interval === 1 ? '' : 's'} after completion${end}`
  if (rule.frequency === 'daily') return rule.interval === 1 ? `Daily${end}` : `Every ${rule.interval} days${end}`
  if (rule.frequency === 'weekly') {
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const days = (rule.weekdays ?? []).map((day) => labels[day]).join(', ')
    const every = rule.interval === 1 ? 'Weekly' : `Every ${rule.interval} weeks`
    return `${every}${days ? ` · ${days}` : ''}${end}`
  }
  if (rule.frequency === 'monthly') return rule.interval === 1 ? `Monthly${end}` : `Every ${rule.interval} months${end}`
  return rule.interval === 1 ? `Yearly${end}` : `Every ${rule.interval} years${end}`
}

export function defaultMaterializationThrough(today = localDateKey()) { return addLocalDays(today, DEFAULT_MATERIALIZATION_DAYS) }
