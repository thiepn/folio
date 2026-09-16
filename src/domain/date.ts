import type { LocalDate } from './models'

export function localDateKey(date = new Date()): LocalDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localDateToDate(dateKey: LocalDate): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function addLocalDays(dateKey: LocalDate, days: number): LocalDate {
  const date = localDateToDate(dateKey)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

/** Monday-first week, matching the product's European planning model. */
export function startOfLocalWeek(dateKey: LocalDate): LocalDate {
  const date = localDateToDate(dateKey)
  const weekday = date.getDay() // Sun=0
  const offset = weekday === 0 ? -6 : 1 - weekday
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

export function endOfLocalWeek(dateKey: LocalDate): LocalDate {
  return addLocalDays(startOfLocalWeek(dateKey), 6)
}

export function localDateRange(start: LocalDate, days: number): LocalDate[] {
  return Array.from({ length: days }, (_, index) => addLocalDays(start, index))
}

export function atLocalTime(dateKey: LocalDate, hours: number, minutes = 0): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString()
}

export function relativeDateLabel(dateKey?: LocalDate, today = localDateKey()): string | undefined {
  if (!dateKey) return undefined
  if (dateKey === today) return 'Due today'
  if (dateKey === addLocalDays(today, 1)) return 'Due tomorrow'
  return `Due ${formatLocalDate(dateKey, { month: 'short', day: 'numeric' })}`
}

export function formatLocalDate(dateKey: LocalDate, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(undefined, options).format(localDateToDate(dateKey))
}

export function weekdayShort(dateKey: LocalDate): string {
  return formatLocalDate(dateKey, { weekday: 'short' })
}

export function dateTimeForDisplay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
