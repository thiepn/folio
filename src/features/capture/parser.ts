import { addLocalDays, localDateKey } from '../../domain/date'
import type { LocalDate, RecurrenceFrequency, TaskPriority } from '../../domain/models'

export interface CaptureProject {
  id: string
  name: string
}

export type CaptureTokenKind = 'planned' | 'deadline' | 'duration' | 'time' | 'priority' | 'project' | 'status' | 'recurrence'

export interface RecognizedCaptureToken {
  kind: CaptureTokenKind
  source: string
  label: string
}

export interface CaptureWarning {
  code: 'unknown-project' | 'ambiguous-project' | 'conflicting-date' | 'invalid-recurrence' | 'inbox-ignores-planning' | 'inbox-ignores-project' | 'inbox-ignores-recurrence'
  message: string
}

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: number[]
  until?: LocalDate
  count?: number
}

export interface ParsedCapture {
  raw: string
  title: string
  status: 'todo' | 'inbox'
  projectId?: string
  projectName?: string
  priority: TaskPriority
  plannedDate?: LocalDate
  deadline?: LocalDate
  estimatedMinutes: number
  startMinute?: number
  recurrence?: ParsedRecurrence
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

function normalizeProject(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseDateToken(token: string, today: LocalDate): LocalDate | undefined {
  const cleaned = token.trim().toLowerCase().replace(/[.,]$/, '')
  if (cleaned === 'today') return today
  if (cleaned === 'tomorrow' || cleaned === 'tmr' || cleaned === 'tmrw') return addLocalDays(today, 1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned as LocalDate
  const weekday = DATE_WORDS.get(cleaned)
  if (weekday === undefined) return undefined
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  const delta = (weekday - date.getDay() + 7) % 7
  return addLocalDays(today, delta === 0 ? 7 : delta)
}

function dateLabel(date: LocalDate, today: LocalDate) {
  if (date === today) return 'Today'
  if (date === addLocalDays(today, 1)) return 'Tomorrow'
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day, 12))
}

function durationFromToken(token: string): number | undefined {
  const compact = token.toLowerCase().replace(/minutes?|mins?/g, 'm').replace(/hours?|hrs?/g, 'h').replace(/\s+/g, '')
  let match = compact.match(/^(\d+)h(?:(\d+)m)?$/)
  if (match) return Number(match[1]) * 60 + Number(match[2] ?? 0)
  match = compact.match(/^(\d+)m$/)
  if (match) return Number(match[1])
  return undefined
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

function recurrenceLabel(value: ParsedRecurrence) {
  if (value.frequency === 'after-completion') return `Every ${value.interval}d after completion`
  if (value.frequency === 'daily') return value.interval === 1 ? 'Daily' : `Every ${value.interval} days`
  if (value.frequency === 'weekly') {
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return value.weekdays?.length ? `Weekly · ${value.weekdays.map((day) => labels[day]).join(', ')}` : (value.interval === 1 ? 'Weekly' : `Every ${value.interval} weeks`)
  }
  if (value.frequency === 'monthly') return value.interval === 1 ? 'Monthly' : `Every ${value.interval} months`
  return value.interval === 1 ? 'Yearly' : `Every ${value.interval} years`
}

function removeSpan(text: string, start: number, end: number) {
  return text.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + text.slice(end)
}

function cleanTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[-–—,:;]+\s*/, '')
    .replace(/\s*[-–—,:;]+$/, '')
    .trim()
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
  const recognized: RecognizedCaptureToken[] = []
  const warnings: CaptureWarning[] = []

  // Quoted and single-token project selectors: #"Analysis III" or #Analysis.
  const projectMatches = [...working.matchAll(/#(?:"([^"]+)"|'([^']+)'|([^\s#]+))/g)]
  let projectApplied = false
  for (const match of projectMatches.reverse()) {
    const query = match[1] ?? match[2] ?? match[3] ?? ''
    const resolved = resolveProject(query, projects)
    if (resolved.kind === 'match') {
      if (!projectApplied) {
        projectId = resolved.project.id
        projectName = resolved.project.name
        recognized.unshift({ kind: 'project', source: match[0], label: resolved.project.name })
        projectApplied = true
      }
      working = removeSpan(working, match.index!, match.index! + match[0].length)
    } else if (resolved.kind === 'ambiguous') {
      warnings.push({ code: 'ambiguous-project', message: `${match[0]} matches multiple projects: ${resolved.candidates.map((project) => project.name).join(', ')}.` })
    } else {
      warnings.push({ code: 'unknown-project', message: `${match[0]} does not match an active project.` })
    }
  }

  // Explicit Inbox / To-do intent.
  const statusMatches = [...working.matchAll(/(?:^|\s)(@(inbox|todo)|inbox:)(?=\s|$)/gi)]
  let statusApplied = false
  for (const match of statusMatches.reverse()) {
    const value = (match[2] ?? 'inbox').toLowerCase()
    if (!statusApplied) {
      status = value === 'todo' ? 'todo' : 'inbox'
      recognized.unshift({ kind: 'status', source: match[1], label: status === 'inbox' ? 'Inbox' : 'To-do' })
      statusApplied = true
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Hard deadline syntax is deliberately explicit so "Friday" can remain the planned day.
  const deadlineMatches = [...working.matchAll(/(?:^|\s)(?:due|by):([^\s]+)(?=\s|$)/gi)]
  let deadlineApplied = false
  for (const match of deadlineMatches.reverse()) {
    const parsed = parseDateToken(match[1], today)
    if (parsed) {
      if (!deadlineApplied) {
        deadline = parsed
        recognized.unshift({ kind: 'deadline', source: match[0].trim(), label: `Due ${dateLabel(parsed, today)}` })
        deadlineApplied = true
      }
      working = removeSpan(working, match.index!, match.index! + match[0].length)
    }
  }

  // Priority markers.
  const priorityMatches = [...working.matchAll(/(?:^|\s)(!(?:critical|high|normal|1|2|3))(?=\s|$)/gi)]
  let priorityApplied = false
  for (const match of priorityMatches.reverse()) {
    const marker = match[1].toLowerCase()
    if (!priorityApplied) {
      priority = marker === '!critical' || marker === '!1' ? 'critical' : marker === '!high' || marker === '!2' ? 'high' : 'normal'
      recognized.unshift({ kind: 'priority', source: marker, label: priority === 'critical' ? 'Critical' : priority === 'high' ? 'High' : 'Normal' })
      priorityApplied = true
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  // Duration markers, intentionally strict to avoid turning normal numbers into estimates.
  const durationMatches = [...working.matchAll(/(?:^|\s)(\d+h(?:\d+m)?|\d+m)(?=\s|$)/gi)]
  let durationApplied = false
  for (const match of durationMatches.reverse()) {
    const parsed = durationFromToken(match[1])
    if (parsed && parsed >= 1 && parsed <= 24 * 60) {
      if (!durationApplied) {
        estimatedMinutes = parsed
        recognized.unshift({ kind: 'duration', source: match[1], label: parsed < 60 ? `${parsed}m` : `${Math.floor(parsed / 60)}h${parsed % 60 ? ` ${parsed % 60}m` : ''}` })
        durationApplied = true
      }
      working = removeSpan(working, match.index!, match.index! + match[0].length)
    }
  }

  // Recurrence uses a deliberately small explicit grammar. Remove it before planned-day parsing so "every monday" does not become a one-off Monday task.
  const afterMatch = working.match(/(?:^|\s)after:(\d+)d(?=\s|$)/i)
  const everyListMatch = working.match(/(?:^|\s)every\s+((?:sun|mon|tue|wed|thu|fri|sat)(?:\s*,\s*(?:sun|mon|tue|wed|thu|fri|sat))+)(?=\s|$)/i)
  const everySingleDayMatch = working.match(/(?:^|\s)every\s+(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)(?=\s|$)/i)
  const everyIntervalMatch = working.match(/(?:^|\s)every\s+(?:(\d+)\s*)?(day|days|week|weeks|month|months|year|years)(?=\s|$)/i)
  const weekdayMatch = working.match(/(?:^|\s)every\s+weekdays?(?=\s|$)/i)
  const starMatch = working.match(/(?:^|\s)\*(?=\s|$)/)
  let recurrenceSpan: RegExpMatchArray | null = null
  if (afterMatch) {
    recurrence = { frequency: 'after-completion', interval: Math.max(1, Number(afterMatch[1])) }
    recurrenceSpan = afterMatch
  } else if (weekdayMatch) {
    recurrence = { frequency: 'weekly', interval: 1, weekdays: [1,2,3,4,5] }
    recurrenceSpan = weekdayMatch
  } else if (everyListMatch) {
    const map: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 }
    recurrence = { frequency: 'weekly', interval: 1, weekdays: everyListMatch[1].split(',').map((day) => map[day.trim().slice(0,3).toLowerCase()]) }
    recurrenceSpan = everyListMatch
  } else if (everySingleDayMatch) {
    const day = DATE_WORDS.get(everySingleDayMatch[1].toLowerCase().slice(0,3))
    recurrence = { frequency: 'weekly', interval: 1, weekdays: day === undefined ? undefined : [day] }
    recurrenceSpan = everySingleDayMatch
  } else if (everyIntervalMatch) {
    const interval = Math.max(1, Number(everyIntervalMatch[1] ?? 1))
    const unit = everyIntervalMatch[2].toLowerCase()
    const frequency: RecurrenceFrequency = unit.startsWith('day') ? 'daily' : unit.startsWith('week') ? 'weekly' : unit.startsWith('month') ? 'monthly' : 'yearly'
    recurrence = { frequency, interval }
    recurrenceSpan = everyIntervalMatch
  } else if (starMatch) {
    recurrence = { frequency: 'daily', interval: 1 }
    recurrenceSpan = starMatch
  }
  if (recurrenceSpan && recurrence && recurrenceSpan.index !== undefined) {
    recognized.push({ kind: 'recurrence', source: recurrenceSpan[0].trim(), label: recurrenceLabel(recurrence) })
    working = removeSpan(working, recurrenceSpan.index, recurrenceSpan.index + recurrenceSpan[0].length)
    const untilMatch = working.match(/(?:^|\s)until:([^\s]+)(?=\s|$)/i)
    if (untilMatch && untilMatch.index !== undefined) {
      const until = parseDateToken(untilMatch[1], today)
      if (until) {
        recurrence.until = until
        recognized.push({ kind: 'recurrence', source: untilMatch[0].trim(), label: `Until ${dateLabel(until, today)}` })
        working = removeSpan(working, untilMatch.index, untilMatch.index + untilMatch[0].length)
      } else warnings.push({ code: 'invalid-recurrence', message: `${untilMatch[0].trim()} is not a valid recurrence end date.` })
    }
    const countMatch = working.match(/(?:^|\s)x(\d+)(?=\s|$)/i)
    if (countMatch && countMatch.index !== undefined) {
      recurrence.count = Math.max(1, Number(countMatch[1]))
      recognized.push({ kind: 'recurrence', source: countMatch[0].trim(), label: `${recurrence.count} times` })
      working = removeSpan(working, countMatch.index, countMatch.index + countMatch[0].length)
    }
    if (recurrence.until && recurrence.count) warnings.push({ code: 'invalid-recurrence', message: 'Use either until:DATE or xCOUNT for a recurring task, not both.' })
  }

  // Planned date: one natural-language token. If multiple are present, the last one wins and a warning is shown.
  const words = [...working.matchAll(/\b(today|tomorrow|tmr|tmrw|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})\b/gi)]
  const parsedDates = words.flatMap((match) => {
    const date = parseDateToken(match[1], today)
    return date ? [{ match, date }] : []
  })
  if (parsedDates.length) {
    const selected = parsedDates[parsedDates.length - 1]
    plannedDate = selected.date
    recognized.push({ kind: 'planned', source: selected.match[0], label: dateLabel(selected.date, today) })
    working = removeSpan(working, selected.match.index!, selected.match.index! + selected.match[0].length)
    if (parsedDates.length > 1) warnings.push({ code: 'conflicting-date', message: `Multiple planned-day words were found. ${dateLabel(selected.date, today)} will be used.` })
  }

  // Exact time is now first-class in Phase 8. The last valid clock token wins.
  const timeMatches = [...working.matchAll(/(?:^|\s)(?:at:)?((?:[01]?\d|2[0-3]):[0-5]\d)(?=\s|$)/gi)]
  let timeApplied = false
  for (const match of timeMatches.reverse()) {
    const [hours, minutes] = match[1].split(':').map(Number)
    if (!timeApplied) {
      startMinute = hours * 60 + minutes
      recognized.unshift({ kind: 'time', source: match[0].trim(), label: match[1].padStart(5, '0') })
      timeApplied = true
    }
    working = removeSpan(working, match.index!, match.index! + match[0].length)
  }

  if (status === 'inbox') {
    if ((plannedDate && recognized.some((token) => token.kind === 'planned')) || startMinute !== undefined) {
      warnings.push({ code: 'inbox-ignores-planning', message: 'Inbox captures stay unplanned and unscheduled. Use @todo if you want date/time tokens to apply.' })
    }
    if (recurrence) {
      warnings.push({ code: 'inbox-ignores-recurrence', message: 'Inbox captures cannot repeat until they are processed. Use @todo to create a recurring task.' })
    }
    if (projectId && recognized.some((token) => token.kind === 'project')) {
      warnings.push({ code: 'inbox-ignores-project', message: 'Inbox captures stay unassigned. Use @todo if you want the project selector to apply.' })
    }
    plannedDate = undefined
    startMinute = undefined
    projectId = undefined
    projectName = undefined
    recurrence = undefined
  }

  return {
    raw,
    title: cleanTitle(working),
    status,
    projectId: status === 'inbox' ? undefined : projectId,
    projectName: status === 'inbox' ? undefined : projectName,
    priority,
    plannedDate,
    deadline,
    estimatedMinutes,
    startMinute,
    recurrence,
    recognized,
    warnings,
  }
}

export const CAPTURE_SYNTAX_EXAMPLES = [
  { syntax: 'tomorrow / fri', meaning: 'planned day' },
  { syntax: 'due:fri', meaning: 'hard deadline' },
  { syntax: '45m / 1h30m', meaning: 'estimate' },
  { syntax: '14:00 / at:09:30', meaning: 'exact start time' },
  { syntax: '!high / !1', meaning: 'priority' },
  { syntax: '#Analysis', meaning: 'project' },
  { syntax: '* / every weekday', meaning: 'repeat' },
  { syntax: 'every mon,wed,fri', meaning: 'selected repeat days' },
  { syntax: 'after:7d', meaning: 'repeat after completion' },
  { syntax: 'until:2026-12-31 / x10', meaning: 'repeat end' },
  { syntax: '@inbox', meaning: 'capture only' },
] as const
