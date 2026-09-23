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

export function addLocalMonths(dateKey: LocalDate, months: number): LocalDate {
  const date = localDateToDate(dateKey)
  const originalDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate()
  date.setDate(Math.min(originalDay, lastDay))
  return localDateKey(date)
}

export function startOfLocalMonth(dateKey: LocalDate): LocalDate {
  const date = localDateToDate(dateKey)
  date.setDate(1)
  return localDateKey(date)
}

export function endOfLocalMonth(dateKey: LocalDate): LocalDate {
  const date = localDateToDate(dateKey)
  date.setMonth(date.getMonth() + 1, 0)
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

export function localMonthGrid(dateKey: LocalDate): LocalDate[] {
  return localDateRange(startOfLocalWeek(startOfLocalMonth(dateKey)), 42)
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


export function dateKeyInTimeZone(value: Date | string, timeZone: string): LocalDate {
  const date = typeof value === 'string' ? new Date(value) : value
  if (!timeZone || timeZone === 'local') return localDateKey(date)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

/**
 * Convert a wall-clock minute in an IANA time zone into an ISO instant.
 * DST overlaps choose the earlier matching instant. DST gaps move forward
 * to the first representable minute on the requested local date.
 */
export function atTimeInZone(dateKey: LocalDate, minuteOfDay: number, timeZone: string): string {
  const minute = Math.max(0, Math.min(1439, Math.round(minuteOfDay)))
  if (!timeZone || timeZone === 'local') return atLocalTime(dateKey, Math.floor(minute / 60), minute % 60)

  const [year, month, day] = dateKey.split('-').map(Number)
  const hour = Math.floor(minute / 60)
  const minutePart = minute % 60
  const desiredNaive = Date.UTC(year, month - 1, day, hour, minutePart, 0, 0)
  let guess = desiredNaive

  // Bring the instant close to the desired wall-clock representation.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const rendered = zonedParts(new Date(guess), timeZone)
    const renderedNaive = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, 0, 0)
    const delta = desiredNaive - renderedNaive
    if (delta === 0) break
    guess += delta
  }

  // Resolve DST overlap deterministically by choosing the earlier matching instant.
  const searchStart = guess - 3 * 60 * 60 * 1000
  const searchEnd = guess + 3 * 60 * 60 * 1000
  let firstForward: number | undefined
  for (let instant = searchStart; instant <= searchEnd; instant += 60_000) {
    const rendered = zonedParts(new Date(instant), timeZone)
    if (rendered.year !== year || rendered.month !== month || rendered.day !== day) continue
    const renderedMinute = rendered.hour * 60 + rendered.minute
    if (renderedMinute === minutePart + hour * 60) return new Date(instant).toISOString()
    if (renderedMinute > minute && firstForward === undefined) firstForward = instant
  }

  // Non-existent local times during a spring-forward gap advance to the
  // first valid wall-clock minute later that same local day.
  if (firstForward !== undefined) return new Date(firstForward).toISOString()
  throw new Error(`Could not resolve ${dateKey} ${String(hour).padStart(2, '0')}:${String(minutePart).padStart(2, '0')} in ${timeZone}.`)
}


export function minuteOfDayInTimeZone(value: Date | string, timeZone: string): number {
  const date = typeof value === 'string' ? new Date(value) : value
  if (!timeZone || timeZone === 'local') return date.getHours() * 60 + date.getMinutes()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(values.hour) * 60 + Number(values.minute)
}

export function formatTimeInZone(value: Date | string, timeZone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(undefined, {
    timeZone: !timeZone || timeZone === 'local' ? undefined : timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
