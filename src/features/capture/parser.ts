import { addLocalDays, addLocalMonths, localDateKey, localDateToDate, startOfLocalWeek } from '../../domain/date'
import type {
  CompletionIntervalUnit,
  LocalDate,
  MonthlyRecurrenceMode,
  RecurrenceFrequency,
  RecurrenceOrdinal,
  TaskPriority,
} from '../../domain/models'

export interface CaptureProject {
  id: string
  name: string
}

export type CaptureTokenKind =
  | 'planned' | 'deadline' | 'duration' | 'time' | 'priority'
  | 'project' | 'tag' | 'status' | 'recurrence' | 'reminder'

export interface RecognizedCaptureToken {
  kind: CaptureTokenKind
  source: string
  label: string
}

export interface CaptureWarning {
  code:
    | 'unknown-project' | 'ambiguous-project' | 'conflicting-date'
    | 'invalid-recurrence' | 'invalid-reminder' | 'ambiguous-reminder'
    | 'inbox-ignores-planning' | 'inbox-ignores-project'
    | 'inbox-ignores-recurrence' | 'inbox-ignores-reminder'
  message: string
}

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: number[]
  monthlyMode?: MonthlyRecurrenceMode
  monthDays?: number[]
  ordinal?: RecurrenceOrdinal
  weekday?: number
  yearMonths?: number[]
  afterCompletionUnit?: CompletionIntervalUnit
  until?: LocalDate
  count?: number
}

export interface ParsedReminder {
  kind: 'task-date' | 'time-block' | 'absolute'
  taskDateField?: 'plannedDate' | 'deadline'
  dayOffset?: number
  minuteOfDay?: number
  offsetMinutes?: number
  date?: LocalDate
  persistent?: boolean
}

export interface ParsedCapture {
  raw: string
  title: string
  status: 'todo' | 'inbox'
  projectId?: string
  projectName?: string
  tags: string[]
  priority: TaskPriority
  plannedDate?: LocalDate
  deadline?: LocalDate
  estimatedMinutes: number
  startMinute?: number
  recurrence?: ParsedRecurrence
  reminders: ParsedReminder[]
  recognized: RecognizedCaptureToken[]
  warnings: CaptureWarning[]
}

export interface CaptureDefaults {
  status?: 'todo' | 'inbox'
  projectId?: string
  plannedDate?: LocalDate
  estimatedMinutes?: number
  priority?: TaskPriority
  today?: LocalDate
}

const WEEKDAYS = [
  ['sun', 'sunday'], ['mon', 'monday'], ['tue', 'tues', 'tuesday'], ['wed', 'weds', 'wednesday'],
  ['thu', 'thur', 'thurs', 'thursday'], ['fri', 'friday'], ['sat', 'saturday'],
] as const

const DATE_WORDS = new Map<string, number>()
WEEKDAYS.forEach((aliases, index) => aliases.forEach((alias) => DATE_WORDS.set(alias, index)))

const MONTHS = [
  ['jan', 'january'], ['feb', 'february'], ['mar', 'march'], ['apr', 'april'],
  ['may'], ['jun', 'june'], ['jul', 'july'], ['aug', 'august'],
  ['sep', 'sept', 'september'], ['oct', 'october'], ['nov', 'november'], ['dec', 'december'],
] as const
const MONTH_WORDS = new Map<string, number>()
MONTHS.forEach((aliases, index) => aliases.forEach((alias) => MONTH_WORDS.set(alias, index + 1)))

const WEEKDAY_PATTERN = '(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)'
const MONTH_PATTERN = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_PHRASE_PATTERN = [
  'day after tomorrow',
  'tomorrow', 'tmr', 'tmrw', 'today', 'tonight',
  'next week', 'this weekend', 'next weekend',
  'in\\s+\\d+\\s+(?:days?|weeks?|months?)',
  `(?:next|this)\\s+${WEEKDAY_PATTERN}`,
  WEEKDAY_PATTERN,
  '\\d{4}-\\d{2}-\\d{2}',
  `${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`,
  `\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}(?:\\s+\\d{4})?`,
].join('|')

function normalizeProject(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function removeSpan(text: string, start: number, end: number) {
  return text.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + text.slice(end)
}

function cleanTitle(value: string) {
  return value
    .replace(/s+/g, ' ')
    .replace(/^[-–—,:;]+s*/, '')
    .replace(/s*[-–—,:;]+$/, '')
    .trim()
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function dateFromParts(year: number, month: number, day: number): LocalDate | undefined {
  const max = new Date(year, month, 0, 12).getDate()
  if (month < 1 || month > 12 || day < 1 || day > max) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function upcomingMonthDate(month: number, day: number, today: LocalDate, explicitYear?: number): LocalDate | undefined {
  const [currentYear] = today.split('-').map(Number)
  if (explicitYear) return dateFromParts(explicitYear, month, day)
  let candidate = dateFromParts(currentYear, month, day)
  if (!candidate) return undefined
  if (candidate < today) candidate = dateFromParts(currentYear + 1, month, day)
  return candidate
}

function parseDatePhrase(input: string, today: LocalDate): LocalDate | undefined {
  const cleaned = input.trim().toLowerCase().replace(/[,.;]+$/, '').replace(/s+/g, ' ')
  if (cleaned === 'today' || cleaned === 'tonight') return today
  if (['tomorrow', 'tmr', 'tmrw'].includes(cleaned)) return addLocalDays(today, 1)
  if (cleaned === 'day after tomorrow') return addLocalDays(today, 2)
  if (/^d{4}-d{2}-d{2}$/.test(cleaned)) return cleaned as LocalDate

  let match = cleaned.match(/^ins+(d+)s+(day|days|week|weeks|month|months)$/)
  if (match) {
    const amount = Math.max(0, Number(match[1]))
    return match[2].startsWith('day') ? addLocalDays(today, amount)
      : match[2].startsWith('week') ? addLocalDays(today, amount * 7)
        : addLocalMonths(today, amount)
  }

  if (cleaned === 'next week') return addLocalDays(startOfLocalWeek(today), 7)
  if (cleaned === 'this weekend' || cleaned === 'next weekend') {
    const base = cleaned === 'next weekend' ? addLocalDays(startOfLocalWeek(today), 7) : today
    const weekday = localDateToDate(base).getDay()
    const delta = (6 - weekday + 7) % 7
    return addLocalDays(base, delta)
  }

  match = cleaned.match(new RegExp(`^(next|this)\\s+(${WEEKDAY_PATTERN})$`, 'i'))
  if (match) {
    const target = DATE_WORDS.get(match[2].slice(0, 3).toLowerCase())
    if (target === undefined) return undefined
    const current = localDateToDate(today).getDay()
    let delta = (target - current + 7) % 7
    if (match[1].toLowerCase() === 'next') {
      if (delta === 0) delta = 7
      else if (delta < 7) delta += 7
    }
    return addLocalDays(today, delta)
  }

  const weekday = DATE_WORDS.get(cleaned.slice(0, 3))
  if (weekday !== undefined && new RegExp(`^${WEEKDAY_PATTERN}$`, 'i').test(cleaned)) {
    const current = localDateToDate(today).getDay()
    const delta = (weekday - current + 7) % 7
    return addLocalDays(today, delta === 0 ? 7 : delta)
  }

  match = cleaned.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?$`, 'i'))
  if (match) {
    const month = MONTH_WORDS.get(match[1].slice(0, 3).toLowerCase())
    return month ? upcomingMonthDate(month, Number(match[2]), today, match[3] ? Number(match[3]) : undefined) : undefined
  }
  match = cleaned.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?$`, 'i'))
  if (match) {
    const month = MONTH_WORDS.get(match[2].slice(0, 3).toLowerCase())
    return month ? upcomingMonthDate(month, Number(match[1]), today, match[3] ? Number(match[3]) : undefined) : undefined
  }

  return undefined
}

function findDatePhrases(text: string, today: LocalDate) {
  const regex = new RegExp(`\\b(${DATE_PHRASE_PATTERN})\\b`, 'gi')
  return [...text.matchAll(regex)].flatMap((match) => {
    const date = parseDatePhrase(match[1], today)
    return date && match.index !== undefined ? [{ match, date }] : []
  })
}

function dateLabel(date: LocalDate, today: LocalDate) {
  if (date === today) return 'Today'
  if (date === addLocalDays(today, 1)) return 'Tomorrow'
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day, 12))
}

function durationFromText(value: string): number | undefined {
  const cleaned = value.toLowerCase().trim()
  let match = cleaned.match(/^(d+(?:.d+)?)s*(?:hours?|hrs?|h)$/)
  if (match) return Math.round(Number(match[1]) * 60)
  match = cleaned.match(/^(d+)s*(?:minutes?|mins?|m)$/)
  if (match) return Number(match[1])
  match = cleaned.replace(/s+/g, '').match(/^(d+)h(?:(d+)m)?$/)
  if (match) return Number(match[1]) * 60 + Number(match[2] ?? 0)
  return undefined
}

function parseTimeText(value: string): number | undefined {
  const cleaned = value.trim().toLowerCase().replace(/./g, '')
  if (cleaned === 'noon') return 12 * 60
  if (cleaned === 'midnight') return 0
  let match = cleaned.match(/^(d{1,2})(?::(d{2}))?s*(am|pm)$/)
  if (match) {
    let hour = Number(match[1]) % 12
    if (match[3] === 'pm') hour += 12
    const minute = Number(match[2] ?? 0)
    return minute <= 59 ? hour * 60 + minute : undefined
  }
  match = cleaned.match(/^([01]?d|2[0-3]):([0-5]d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined
}

function timeLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function resolveProject(query: string, projects: CaptureProject[]) {
  const normalized = normalizeProject(query)
  if (!normalized) return { kind: 'none' as const }
  const exact = projects.filter((project) => normalizeProject(project.name) === normalized)
  if (exact.length === 1) return { kind: 'match' as const, project: exact[0] }
  const starts = projects.filter((project) => normalizeProject(project.name).startsWith(normalized))
  if (starts.length === 1) return { kind: 'match' as const, project: starts[0] }
  const contains = projects.filter((project) => normalizeProject(project.name).includes(normalized))
  if (contains.length === 1) return { kind: 'match' as const, project: contains[0] }
  const candidates = starts.length ? starts : contains
  if (candidates.length > 1) return { kind: 'ambiguous' as const, candidates }
  return { kind: 'none' as const }
}

function weekdayList(value: string) {
  return unique(value.split(/[s,/&+]+/).flatMap((token) => {
    const day = DATE_WORDS.get(token.trim().toLowerCase().slice(0, 3))
    return day === undefined ? [] : [day]
  }))
}

function ordinalValue(value: string): RecurrenceOrdinal | undefined {
  const lower = value.toLowerCase()
  if (lower === 'last') return -1
  const number = Number(lower.replace(/(?:st|nd|rd|th)$/, ''))
  return [1,2,3,4,5].includes(number) ? number as RecurrenceOrdinal : undefined
}

function recurrenceLabel(value: ParsedRecurrence) {
  if (value.frequency === 'after-completion') {
    const unit = value.afterCompletionUnit ?? 'day'
    return `Every ${value.interval} ${unit}${value.interval === 1 ? '' : 's'} after completion`
  }
  if (value.frequency === 'daily') return value.interval === 1 ? 'Daily' : `Every ${value.interval} days`
  if (value.frequency === 'weekly') {
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const every = value.interval === 1 ? 'Weekly' : `Every ${value.interval} weeks`
    return value.weekdays?.length ? `${every} · ${value.weekdays.map((day) => labels[day]).join(', ')}` : every
  }
  if (value.frequency === 'monthly') {
    const every = value.interval === 1 ? 'Monthly' : `Every ${value.interval} months`
    if (value.monthlyMode === 'last-day') return `${every} · last day`
    if (value.monthlyMode === 'ordinal-weekday') {
      const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return `${every} · ${value.ordinal === -1 ? 'last' : value.ordinal} ${labels[value.weekday ?? 1]}`
    }
    return value.monthDays?.length ? `${every} · day ${value.monthDays.join(', ')}` : every
  }
  return value.interval === 1 ? 'Yearly' : `Every ${value.interval} years`
}

function parseRecurrence(working: string, today: LocalDate): { working: string; recurrence?: ParsedRecurrence; recognized: RecognizedCaptureToken[]; warnings: CaptureWarning[] } {
  let text = working
  let recurrence: ParsedRecurrence | undefined
  const recognized: RecognizedCaptureToken[] = []
  const warnings: CaptureWarning[] = []
  let span: RegExpMatchArray | null = null

  const afterLegacy = text.match(/(?:^|s)after:(d+)(d|w|m|y)(?=s|$)/i)
  const afterNatural = text.match(/(?:^|s)(?:everys+)?(d+)s*(day|days|week|weeks|month|months|year|years)s+afters+completion(?=s|$)/i)
    ?? text.match(/(?:^|s)afters+completions+(?:everys+)?(d+)s*(day|days|week|weeks|month|months|year|years)(?=s|$)/i)

  const monthlyOrdinal = text.match(new RegExp(`(?:^|\\s)(?:every|each)\\s+(?:(\\d+)\\s+)?months?\\s+(?:on\\s+)?(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\\s+(${WEEKDAY_PATTERN})(?=\\s|$)`, 'i'))
  const monthlyLastDay = text.match(/(?:^|s)(?:every|each)s+(?:(d+)s+)?months?s+(?:ons+)?(?:thes+)?lasts+day(?=s|$)/i)
  const monthlyDates = text.match(/(?:^|s)(?:every|each)s+(?:(d+)s+)?months?s+(?:ons+)?(?:days+)?((?:d{1,2}(?:st|nd|rd|th)?)(?:s*[,/&+]s*d{1,2}(?:st|nd|rd|th)?)*)(?=s|$)/i)
  const yearlyDate = text.match(new RegExp(`(?:^|\\s)(?:every|each)\\s+(?:(\\d+)\\s+)?years?\\s+(?:on\\s+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s|$)`, 'i'))
  const weeklyOn = text.match(new RegExp(`(?:^|\\s)(?:every|each)\\s+(?:(\\d+)\\s+)?weeks?\\s+(?:on\\s+)?((?:${WEEKDAY_PATTERN})(?:\\s*[,/&+]\\s*${WEEKDAY_PATTERN})*)(?=\\s|$)`, 'i'))
  const weekdays = text.match(/(?:^|s)(?:every|each)s+weekdays?(?=s|$)/i)
  const weeklyList = text.match(new RegExp(`(?:^|\\s)(?:every|each)\\s+((?:${WEEKDAY_PATTERN})(?:\\s*[,/&+]\\s*${WEEKDAY_PATTERN})+)(?=\\s|$)`, 'i'))
  const weeklySingle = text.match(new RegExp(`(?:^|\\s)(?:every|each)\\s+(${WEEKDAY_PATTERN})(?=\\s|$)`, 'i'))
  const generic = text.match(/(?:^|s)(?:every|each)s+(?:(d+)s*)?(day|days|week|weeks|month|months|year|years)(?=s|$)/i)
  const star = text.match(/(?:^|s)*(?=s|$)/)

  if (afterLegacy) {
    const units: Record<string, CompletionIntervalUnit> = { d:'day', w:'week', m:'month', y:'year' }
    recurrence = { frequency: 'after-completion', interval: Math.max(1, Number(afterLegacy[1])), afterCompletionUnit: units[afterLegacy[2].toLowerCase()] }
    span = afterLegacy
  } else if (afterNatural) {
    const unit = afterNatural[2].toLowerCase()
    recurrence = { frequency: 'after-completion', interval: Math.max(1, Number(afterNatural[1])), afterCompletionUnit: unit.startsWith('day') ? 'day' : unit.startsWith('week') ? 'week' : unit.startsWith('month') ? 'month' : 'year' }
    span = afterNatural
  } else if (monthlyOrdinal) {
    const wordMap: Record<string, RecurrenceOrdinal> = { first:1, second:2, third:3, fourth:4, fifth:5, last:-1 }
    const ordinal = wordMap[monthlyOrdinal[2].toLowerCase()] ?? ordinalValue(monthlyOrdinal[2])
    const weekday = DATE_WORDS.get(monthlyOrdinal[3].slice(0,3).toLowerCase())
    recurrence = { frequency: 'monthly', interval: Math.max(1, Number(monthlyOrdinal[1] ?? 1)), monthlyMode: 'ordinal-weekday', ordinal, weekday }
    span = monthlyOrdinal
  } else if (monthlyLastDay) {
    recurrence = { frequency: 'monthly', interval: Math.max(1, Number(monthlyLastDay[1] ?? 1)), monthlyMode: 'last-day' }
    span = monthlyLastDay
  } else if (monthlyDates) {
    const monthDays = unique(monthlyDates[2].split(/[,/&+]/).map((value) => Number(value.trim().replace(/(?:st|nd|rd|th)$/i, ''))).filter((day) => day >= 1 && day <= 31)).sort((a,b)=>a-b)
    recurrence = { frequency: 'monthly', interval: Math.max(1, Number(monthlyDates[1] ?? 1)), monthlyMode: 'days', monthDays }
    span = monthlyDates
  } else if (yearlyDate) {
    const month = MONTH_WORDS.get(yearlyDate[2].slice(0,3).toLowerCase())
    recurrence = { frequency: 'yearly', interval: Math.max(1, Number(yearlyDate[1] ?? 1)), monthDays: [Number(yearlyDate[3])], yearMonths: month ? [month] : undefined }
    span = yearlyDate
  } else if (weeklyOn) {
    recurrence = { frequency: 'weekly', interval: Math.max(1, Number(weeklyOn[1] ?? 1)), weekdays: weekdayList(weeklyOn[2]) }
    span = weeklyOn
  } else if (weekdays) {
    recurrence = { frequency: 'weekly', interval: 1, weekdays: [1,2,3,4,5] }
    span = weekdays
  } else if (weeklyList) {
    recurrence = { frequency: 'weekly', interval: 1, weekdays: weekdayList(weeklyList[1]) }
    span = weeklyList
  } else if (weeklySingle) {
    recurrence = { frequency: 'weekly', interval: 1, weekdays: weekdayList(weeklySingle[1]) }
    span = weeklySingle
  } else if (generic) {
    const interval = Math.max(1, Number(generic[1] ?? 1))
    const unit = generic[2].toLowerCase()
    recurrence = { frequency: unit.startsWith('day') ? 'daily' : unit.startsWith('week') ? 'weekly' : unit.startsWith('month') ? 'monthly' : 'yearly', interval }
    span = generic
  } else if (star) {
    recurrence = { frequency: 'daily', interval: 1 }
    span = star
  }

  if (span && recurrence && span.index !== undefined) {
    recognized.push({ kind: 'recurrence', source: span[0].trim(), label: recurrenceLabel(recurrence) })
    text = removeSpan(text, span.index, span.index + span[0].length)

    const untilRegex = new RegExp(`(?:^|\\s)until(?::|\\s+)(${DATE_PHRASE_PATTERN})(?=\\s|$)`, 'i')
    const until = text.match(untilRegex)
    if (until && until.index !== undefined) {
      const parsed = parseDatePhrase(until[1], today)
      if (parsed) {
        recurrence.until = parsed
        recognized.push({ kind: 'recurrence', source: until[0].trim(), label: `Until ${dateLabel(parsed, today)}` })
        text = removeSpan(text, until.index, until.index + until[0].length)
      } else warnings.push({ code: 'invalid-recurrence', message: `${until[0].trim()} is not a valid recurrence end date.` })
    }

    const count = text.match(/(?:^|s)(?:x|fors+)(d+)(?:s+times?)?(?=s|$)/i)
    if (count && count.index !== undefined) {
      recurrence.count = Math.max(1, Number(count[1]))
      recognized.push({ kind: 'recurrence', source: count[0].trim(), label: `${recurrence.count} times` })
      text = removeSpan(text, count.index, count.index + count[0].length)
    }

    if (recurrence.until && recurrence.count) warnings.push({ code: 'invalid-recurrence', message: 'Use either an end date or an occurrence count for a recurring task, not both.' })
  }

  return { working: text, recurrence, recognized, warnings }
}

function parseReminders(working: string, today: LocalDate): { working: string; reminders: ParsedReminder[]; recognized: RecognizedCaptureToken[]; warnings: CaptureWarning[] } {
  let text = working
  const reminders: ParsedReminder[] = []
  const recognized: RecognizedCaptureToken[] = []
  const warnings: CaptureWarning[] = []

  // Explicit exact-date reminder: "remind tomorrow at 09:00".
  const exactRegex = new RegExp(`(?:^|\\s)remind(?:\\s+me)?\\s+(${DATE_PHRASE_PATTERN})\\s+(?:at\\s+)?(noon|midnight|(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))|(?:[01]?\\d|2[0-3]):[0-5]\\d)(?=\\s|$)`, 'gi')
  const exactMatches = [...text.matchAll(exactRegex)]
  for (const match of exactMatches.reverse()) {
    const date = parseDatePhrase(match[1], today)
    const minute = parseTimeText(match[2])
    if (date && minute !== undefined && match.index !== undefined) {
      reminders.unshift({ kind: 'absolute', date, minuteOfDay: minute })
      recognized.unshift({ kind: 'reminder', source: match[0].trim(), label: `Remind ${dateLabel(date, today)} ${timeLabel(minute)}` })
      text = removeSpan(text, match.index, match.index + match[0].length)
    }
  }

  // Deadline-relative: "remind 1 day before deadline at 09:00".
  const deadlineRegex = /(?:^|s)remind(?:s+me)?s+(d+)s*(day|days|d)s+befores+(?:due|deadline)(?:s+ats+(noon|midnight|d{1,2}(?::d{2})?s*(?:am|pm)|(?:[01]?d|2[0-3]):[0-5]d))?(?=s|$)/gi
  const deadlineMatches = [...text.matchAll(deadlineRegex)]
  for (const match of deadlineMatches.reverse()) {
    const minute = match[3] ? parseTimeText(match[3]) : 9 * 60
    if (minute !== undefined && match.index !== undefined) {
      reminders.unshift({ kind: 'task-date', taskDateField: 'deadline', dayOffset: -Number(match[1]), minuteOfDay: minute })
      recognized.unshift({ kind: 'reminder', source: match[0].trim(), label: `Remind ${match[1]}d before deadline · ${timeLabel(minute)}` })
      text = removeSpan(text, match.index, match.index + match[0].length)
    }
  }

  // Block-relative: "remind 30m before" / "remind 2h before start".
  const beforeRegex = /(?:^|s)(?:remind(?:s+me)?s+|reminder:)(d+)s*(m|min|minutes?|h|hours?)s+before(?:s+(?:start|block))?(?=s|$)/gi
  const beforeMatches = [...text.matchAll(beforeRegex)]
  for (const match of beforeMatches.reverse()) {
    const unit = match[2].toLowerCase()
    const minutes = Number(match[1]) * (unit.startsWith('h') ? 60 : 1)
    if (match.index !== undefined) {
      reminders.unshift({ kind: 'time-block', offsetMinutes: -minutes })
      recognized.unshift({ kind: 'reminder', source: match[0].trim(), label: `Remind ${minutes}m before start` })
      text = removeSpan(text, match.index, match.index + match[0].length)
    }
  }

  // Planned-day clock reminder: "remind at 09:00".
  const atRegex = /(?:^|s)remind(?:s+me)?s+ats+(noon|midnight|d{1,2}(?::d{2})?s*(?:am|pm)|(?:[01]?d|2[0-3]):[0-5]d)(?=s|$)/gi
  const atMatches = [...text.matchAll(atRegex)]
  for (const match of atMatches.reverse()) {
    const minute = parseTimeText(match[1])
    if (minute !== undefined && match.index !== undefined) {
      reminders.unshift({ kind: 'task-date', taskDateField: 'plannedDate', dayOffset: 0, minuteOfDay: minute })
      recognized.unshift({ kind: 'reminder', source: match[0].trim(), label: `Remind on planned day · ${timeLabel(minute)}` })
      text = removeSpan(text, match.index, match.index + match[0].length)
    }
  }

  return { working: text, reminders, recognized, warnings }
}

export function parseQuickCapture(raw: string, projects: CaptureProject[], defaults: CaptureDefaults = {}): ParsedCapture {
  const today = defaults.today ?? localDateKey()
  let working = raw
  let status: 'todo' | 'inbox' = defaults.status ?? 'todo'
  let projectId = defaults.projectId || undefined
  let projectName = projectId ? projects.find((project) => project.id === projectId)?.name : undefined
  let priority: TaskPriority = defaults.priority ?? 'normal'
  let plannedDate: LocalDate | undefined = status === 'inbox' ? undefined : (defaults.plannedDate ?? today)
  let deadline: LocalDate | undefined
  let estimatedMinutes = defaults.estimatedMinutes ?? 30
  let startMinute: number | undefined
  let recurrence: ParsedRecurrence | undefined
  let reminders: ParsedReminder[] = []
  const tags: string[] = []
  const recognized: RecognizedCaptureToken[] = []
  const warnings: CaptureWarning[] = []

  // Explicit project selectors: ~Analysis, project:Analysis, project:"Analysis III".
  const explicitProjects = [...working.matchAll(/(?:^|s)(?:~|project:|list:)(?:"([^"]+)"|'([^']+)'|([^s#~]+))/gi)]
  let projectApplied = false
  for (const match of explicitProjects.reverse()) {
    const query = match[1] ?? match[2] ?? match[3] ?? ''
    const resolved = resolveProject(query, projects)
    if (resolved.kind === 'match') {
      if (!projectApplied) {
        projectId = resolved.project.id
        projectName = resolved.project.name
        recognized.unshift({ kind: 'project', source: match[0].trim(), label: resolved.project.name })
        projectApplied = true
      }
      working = removeSpan(working, match.index!, match.index! + match[0].length)
    } else if (resolved.kind === 'ambiguous') {
      warnings.push({ code: 'ambiguous-project', message: `${match[0].trim()} matches multiple projects: ${resolved.candidates.map((project) => project.name).join(', ')}.` })
    } else warnings.push({ code: 'unknown-project', message: `${match[0].trim()} does not match an active project.` })
  }

  // Legacy #Project remains supported. An unmatched #token becomes a task tag.
  const hashes = [...working.matchAll(/#(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9][A-Za-z0-9_-]*))/g)]
  for (const match of hashes.reverse()) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    const resolved = resolveProject(value, projects)
    if (!projectApplied && resolved.kind === 'match') {
      projectId = resolved.project.id
      projectName = resolved.project.name
      projectApplied = true
      recognized.unshift({ kind: 'project', source: match[0], label: resolved.project.name })
    } else if (!projectApplied && resolved.kind === 'ambiguous') {
      warnings.push({ code: 'ambiguous-project', message: `${match[0]} matches multiple projects; use ~"Exact project" for project selection. It will be kept as a tag.` })
      tags.unshift(value)
      recognized.unshift({ kind: 'tag', source: match[0], label: `#${value}` })
    } else {
      tags.unshift(value)
      recognized.unshift({ kind: 'tag', source: match[0], label: `#${value}` })
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Explicit Inbox / To-do intent.
  const statusMatches = [...working.matchAll(/(?:^|s)(@(inbox|todo)|inbox:)(?=s|$)/gi)]
  for (const [index, match] of statusMatches.reverse().entries()) {
    if (index === 0) {
      status = (match[2] ?? 'inbox').toLowerCase() === 'todo' ? 'todo' : 'inbox'
      recognized.unshift({ kind: 'status', source: match[1], label: status === 'inbox' ? 'Inbox' : 'To-do' })
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Recurrence and reminders are removed before generic date/time parsing.
  const recurrenceResult = parseRecurrence(working, today)
  working = recurrenceResult.working
  recurrence = recurrenceResult.recurrence
  recognized.push(...recurrenceResult.recognized)
  warnings.push(...recurrenceResult.warnings)

  const reminderResult = parseReminders(working, today)
  working = reminderResult.working
  reminders = reminderResult.reminders
  recognized.push(...reminderResult.recognized)
  warnings.push(...reminderResult.warnings)

  // Hard deadline: due Friday / by next Monday / deadline Sep 30 / due:fri.
  const deadlineRegex = new RegExp(`(?:^|\\s)(?:due(?::|\\s+)|by\\s+|deadline(?::|\\s+)(?:on\\s+)?)(${DATE_PHRASE_PATTERN})(?=\\s|$)`, 'gi')
  const deadlineMatches = [...working.matchAll(deadlineRegex)]
  if (deadlineMatches.length) {
    const selected = deadlineMatches[deadlineMatches.length - 1]
    const parsed = parseDatePhrase(selected[1], today)
    if (parsed) {
      deadline = parsed
      recognized.push({ kind: 'deadline', source: selected[0].trim(), label: `Due ${dateLabel(parsed, today)}` })
    }
    for (const match of deadlineMatches.reverse()) if (match.index !== undefined) working = removeSpan(working, match.index, match.index + match[0].length)
  }

  // Priority: legacy markers plus p1/p2/p3 and "priority high".
  const priorityMatches = [...working.matchAll(/(?:^|s)(!(?:critical|high|normal|1|2|3)|p[123]|priority(?::|s+)(?:critical|high|normal))(?=s|$)/gi)]
  for (const [index, match] of priorityMatches.reverse().entries()) {
    const marker = match[1].toLowerCase()
    if (index === 0) {
      priority = /(?:!critical|!1|p1|critical)/.test(marker) ? 'critical' : /(?:!high|!2|p2|high)/.test(marker) ? 'high' : 'normal'
      recognized.unshift({ kind: 'priority', source: match[1], label: priority === 'critical' ? 'Critical' : priority === 'high' ? 'High' : 'Normal' })
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Duration: 45m, 1h30m, "for 90 minutes", "for 1.5 hours".
  const durationMatches = [...working.matchAll(/(?:^|s)(?:fors+)?(d+h(?:s*d+m)?|d+(?:.d+)?s*(?:hours?|hrs?|h)|d+s*(?:minutes?|mins?|m))(?=s|$)/gi)]
  for (const [index, match] of durationMatches.reverse().entries()) {
    const parsed = durationFromText(match[1])
    if (parsed && parsed >= 1 && parsed <= 24 * 60 && index === 0) {
      estimatedMinutes = parsed
      recognized.unshift({ kind: 'duration', source: match[0].trim(), label: parsed < 60 ? `${parsed}m` : `${Math.floor(parsed / 60)}h${parsed % 60 ? ` ${parsed % 60}m` : ''}` })
    }
    if (parsed) working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Time ranges infer both exact start and estimate: "2pm-3:30pm".
  const rangeRegex = /(?:^|s)(noon|midnight|d{1,2}(?::d{2})?s*(?:am|pm)|(?:[01]?d|2[0-3]):[0-5]d)s*[-–]s*(noon|midnight|d{1,2}(?::d{2})?s*(?:am|pm)|(?:[01]?d|2[0-3]):[0-5]d)(?=s|$)/gi
  const ranges = [...working.matchAll(rangeRegex)]
  if (ranges.length) {
    const selected = ranges[ranges.length - 1]
    const start = parseTimeText(selected[1])
    let end = parseTimeText(selected[2])
    if (start !== undefined && end !== undefined) {
      if (end <= start) end += 24 * 60
      startMinute = start
      estimatedMinutes = Math.min(24 * 60, end - start)
      recognized.push({ kind: 'time', source: selected[0].trim(), label: `${timeLabel(start)} · ${estimatedMinutes}m` })
    }
    for (const match of ranges.reverse()) if (match.index !== undefined) working = removeSpan(working, match.index, match.index + match[0].length)
  }

  // Exact time: at 2pm, 2:30 pm, noon, 14:00.
  const timeRegex = /(?:^|s)(?:at:|ats+)?(noon|midnight|d{1,2}(?::d{2})?s*(?:am|pm)|(?:[01]?d|2[0-3]):[0-5]d)(?=s|$)/gi
  const timeMatches = [...working.matchAll(timeRegex)]
  for (const [index, match] of timeMatches.reverse().entries()) {
    const minute = parseTimeText(match[1])
    if (minute !== undefined && index === 0 && startMinute === undefined) {
      startMinute = minute
      recognized.unshift({ kind: 'time', source: match[0].trim(), label: timeLabel(minute) })
    }
    if (minute !== undefined) working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Remaining natural date phrases are candidate planned dates. Last wins.
  const parsedDates = findDatePhrases(working, today)
  if (parsedDates.length) {
    const selected = parsedDates[parsedDates.length - 1]
    plannedDate = selected.date
    recognized.push({ kind: 'planned', source: selected.match[0], label: dateLabel(selected.date, today) })
    working = removeSpan(working, selected.match.index!, selected.match.index! + selected.match[0].length)
    if (parsedDates.length > 1) warnings.push({ code: 'conflicting-date', message: `Multiple planned-date phrases were found. ${dateLabel(selected.date, today)} will be used.` })
  }

  // Validate reminder anchors after the task dates/time are known.
  for (const reminder of reminders) {
    if (reminder.kind === 'time-block' && startMinute === undefined) warnings.push({ code: 'invalid-reminder', message: 'A “before start” reminder needs an exact start time or calendar block.' })
    if (reminder.kind === 'task-date' && reminder.taskDateField === 'deadline' && !deadline) warnings.push({ code: 'invalid-reminder', message: 'A deadline reminder needs a deadline.' })
    if (reminder.kind === 'task-date' && reminder.taskDateField === 'plannedDate' && !plannedDate) warnings.push({ code: 'invalid-reminder', message: 'A planned-day reminder needs a planned date.' })
  }

  if (recurrence && reminders.some((reminder) => reminder.kind === 'absolute')) {
    warnings.push({ code: 'ambiguous-reminder', message: 'Exact-date reminders apply only to the first captured occurrence. Use a planned/deadline/start-relative reminder to repeat with the series.' })
  }

  if (status === 'inbox') {
    if ((plannedDate && recognized.some((token) => token.kind === 'planned')) || startMinute !== undefined) warnings.push({ code: 'inbox-ignores-planning', message: 'Inbox captures stay unplanned and unscheduled. Use @todo if date/time phrases should apply.' })
    if (recurrence) warnings.push({ code: 'inbox-ignores-recurrence', message: 'Inbox captures cannot repeat until processed. Use @todo to create a recurring task.' })
    if (projectId && recognized.some((token) => token.kind === 'project')) warnings.push({ code: 'inbox-ignores-project', message: 'Inbox captures stay unassigned. Use @todo if the project selector should apply.' })
    if (reminders.length) warnings.push({ code: 'inbox-ignores-reminder', message: 'Inbox captures do not schedule reminders until they are processed.' })
    plannedDate = undefined
    startMinute = undefined
    projectId = undefined
    projectName = undefined
    recurrence = undefined
    reminders = []
  }

  return {
    raw,
    title: cleanTitle(working),
    status,
    projectId: status === 'inbox' ? undefined : projectId,
    projectName: status === 'inbox' ? undefined : projectName,
    tags: unique(tags.map((tag) => tag.trim()).filter(Boolean)).slice(0, 50),
    priority,
    plannedDate,
    deadline,
    estimatedMinutes,
    startMinute,
    recurrence,
    reminders,
    recognized,
    warnings,
  }
}

export function parseQuickCaptureBatch(raw: string, projects: CaptureProject[], defaults: CaptureDefaults = {}) {
  return raw.split(/?
/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => parseQuickCapture(line, projects, defaults))
}

export const CAPTURE_SYNTAX_EXAMPLES = [
  { syntax: 'tomorrow / next fri / in 3 days', meaning: 'planned day' },
  { syntax: 'due Friday / deadline Sep 30', meaning: 'hard deadline' },
  { syntax: '2pm / 14:00 / 2pm-3:30pm', meaning: 'time / inferred duration' },
  { syntax: '45m / for 1.5 hours', meaning: 'estimate' },
  { syntax: '!high / p1 / priority critical', meaning: 'priority' },
  { syntax: '~Analysis / project:"Analysis III"', meaning: 'project' },
  { syntax: '#exam #deep-work', meaning: 'tags' },
  { syntax: 'every 2 weeks on mon,wed', meaning: 'weekly repeat' },
  { syntax: 'every month on 1,15 / last Friday', meaning: 'monthly repeat' },
  { syntax: '30 days after completion', meaning: 'completion repeat' },
  { syntax: 'remind 30m before', meaning: 'before calendar start' },
  { syntax: 'remind 1 day before deadline at 09:00', meaning: 'deadline reminder' },
  { syntax: 'remind at 18:00', meaning: 'planned-day reminder' },
  { syntax: 'Shift+Enter / paste lines', meaning: 'multi-task capture' },
  { syntax: '@inbox', meaning: 'capture only' },
] as const
