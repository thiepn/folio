import {
  addLocalDays,
  addLocalMonths,
  dateKeyInTimeZone,
  localDateKey,
  localDateToDate,
  startOfLocalWeek,
} from '../../domain/date'
import type { LocalDate, RecurringSeriesEntity } from '../../domain/models'

export const DEFAULT_MATERIALIZATION_DAYS = 120

function dayDiff(from: LocalDate, to: LocalDate) {
  return Math.round((localDateToDate(to).getTime() - localDateToDate(from).getTime()) / 86_400_000)
}

function weekDiff(from: LocalDate, to: LocalDate) {
  return Math.round(dayDiff(startOfLocalWeek(from), startOfLocalWeek(to)) / 7)
}

function monthDiff(from: LocalDate, to: LocalDate) {
  const a = localDateToDate(from)
  const b = localDateToDate(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0, 12).getDate()
}

function uniqueNumbers(values: number[] | undefined) {
  return [...new Set(values ?? [])].sort((a, b) => a - b)
}

function configuredMonthDays(series: RecurringSeriesEntity) {
  const values = uniqueNumbers(series.rule.monthDays)
  if (values.length) return values
  if (series.rule.monthDay) return [series.rule.monthDay]
  return [localDateToDate(series.startDate).getDate()]
}

function clampedMonthDays(series: RecurringSeriesEntity, year: number, monthIndex: number) {
  const lastDay = daysInMonth(year, monthIndex)
  return new Set(configuredMonthDays(series).map((day) => Math.min(day, lastDay)))
}

function ordinalWeekdayDay(year: number, monthIndex: number, weekday: number, ordinal: number) {
  const lastDay = daysInMonth(year, monthIndex)
  if (ordinal === -1) {
    const lastWeekday = new Date(year, monthIndex, lastDay, 12).getDay()
    const distance = (lastWeekday - weekday + 7) % 7
    return lastDay - distance
  }
  const firstWeekday = new Date(year, monthIndex, 1, 12).getDay()
  const firstMatch = 1 + ((weekday - firstWeekday + 7) % 7)
  const day = firstMatch + (ordinal - 1) * 7
  return day <= lastDay ? day : undefined
}

function monthlyMatches(series: RecurringSeriesEntity, current: Date) {
  const mode = series.rule.monthlyMode ?? 'days'
  if (mode === 'last-day') return current.getDate() === daysInMonth(current.getFullYear(), current.getMonth())
  if (mode === 'ordinal-weekday') {
    const start = localDateToDate(series.startDate)
    const weekday = series.rule.weekday ?? start.getDay()
    const ordinal = series.rule.ordinal ?? 1
    return current.getDate() === ordinalWeekdayDay(current.getFullYear(), current.getMonth(), weekday, ordinal)
  }
  return clampedMonthDays(series, current.getFullYear(), current.getMonth()).has(current.getDate())
}

function yearlyMatches(series: RecurringSeriesEntity, current: Date) {
  const start = localDateToDate(series.startDate)
  const months = uniqueNumbers(series.rule.yearMonths)
  const configuredMonths = months.length ? months : [start.getMonth() + 1]
  if (!configuredMonths.includes(current.getMonth() + 1)) return false
  return clampedMonthDays(series, current.getFullYear(), current.getMonth()).has(current.getDate())
}

function calendarMatches(series: RecurringSeriesEntity, date: LocalDate) {
  const { frequency, interval } = series.rule
  if (date < series.startDate) return false
  if (series.rule.until && date > series.rule.until) return false
  const start = localDateToDate(series.startDate)
  const current = localDateToDate(date)

  if (frequency === 'daily') return dayDiff(series.startDate, date) % interval === 0

  if (frequency === 'weekly') {
    const weeks = weekDiff(series.startDate, date)
    const weekdays = series.rule.weekdays?.length ? series.rule.weekdays : [start.getDay()]
    return weeks >= 0 && weeks % interval === 0 && weekdays.includes(current.getDay())
  }

  if (frequency === 'monthly') {
    const months = monthDiff(series.startDate, date)
    return months >= 0 && months % interval === 0 && monthlyMatches(series, current)
  }

  if (frequency === 'yearly') {
    const years = current.getFullYear() - start.getFullYear()
    return years >= 0 && years % interval === 0 && yearlyMatches(series, current)
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

  while (cursor <= hardThrough && dates.length < countLimit && guard < 250_000) {
    if (calendarMatches(series, cursor)) dates.push(cursor)
    cursor = addLocalDays(cursor, 1)
    guard += 1
  }
  return dates
}

export function previewOccurrenceDates(series: RecurringSeriesEntity, limit = 6): LocalDate[] {
  if (series.rule.frequency === 'after-completion') return [series.startDate]
  const horizon = addLocalDays(series.startDate, 366 * 30)
  return calendarOccurrenceDates(series, horizon).slice(0, limit)
}

export function nextCompletionRelativeDate(series: RecurringSeriesEntity, completedAt: string): LocalDate | undefined {
  if (series.status !== 'active' || series.rule.frequency !== 'after-completion') return undefined
  const completedDate = dateKeyInTimeZone(completedAt, series.timezone)
  const unit = series.rule.afterCompletionUnit ?? 'day'
  let next: LocalDate

  if (unit === 'week') next = addLocalDays(completedDate, series.rule.interval * 7)
  else if (unit === 'month') next = addLocalMonths(completedDate, series.rule.interval)
  else if (unit === 'year') next = addLocalMonths(completedDate, series.rule.interval * 12)
  else next = addLocalDays(completedDate, series.rule.interval)

  if (series.rule.until && next > series.rule.until) return undefined
  return next
}

function ordinalLabel(value: number) {
  if (value === -1) return 'last'
  if (value === 1) return '1st'
  if (value === 2) return '2nd'
  if (value === 3) return '3rd'
  return `${value}th`
}

export function seriesSummary(series: RecurringSeriesEntity) {
  const rule = series.rule
  const end = rule.until ? ` until ${rule.until}` : rule.count ? ` · ${rule.count} times` : ''
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (rule.frequency === 'after-completion') {
    const unit = rule.afterCompletionUnit ?? 'day'
    return `Every ${rule.interval} ${unit}${rule.interval === 1 ? '' : 's'} after completion${end}`
  }

  if (rule.frequency === 'daily') return rule.interval === 1 ? `Daily${end}` : `Every ${rule.interval} days${end}`

  if (rule.frequency === 'weekly') {
    const days = (rule.weekdays ?? []).map((day) => weekdayLabels[day]).join(', ')
    const every = rule.interval === 1 ? 'Weekly' : `Every ${rule.interval} weeks`
    return `${every}${days ? ` · ${days}` : ''}${end}`
  }

  if (rule.frequency === 'monthly') {
    const every = rule.interval === 1 ? 'Monthly' : `Every ${rule.interval} months`
    const mode = rule.monthlyMode ?? 'days'
    if (mode === 'last-day') return `${every} · last day${end}`
    if (mode === 'ordinal-weekday') {
      const weekday = weekdayLabels[rule.weekday ?? localDateToDate(series.startDate).getDay()]
      return `${every} · ${ordinalLabel(rule.ordinal ?? 1)} ${weekday}${end}`
    }
    const days = configuredMonthDays(series).join(', ')
    return `${every} · day ${days}${end}`
  }

  const every = rule.interval === 1 ? 'Yearly' : `Every ${rule.interval} years`
  const months = uniqueNumbers(rule.yearMonths)
  if (!months.length) return `${every}${end}`
  const monthLabels = months.map((month) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2026, month - 1, 1, 12))).join(', ')
  return `${every} · ${monthLabels} · day ${configuredMonthDays(series).join(', ')}${end}`
}

export function defaultMaterializationThrough(today = localDateKey()) {
  return addLocalDays(today, DEFAULT_MATERIALIZATION_DAYS)
}
