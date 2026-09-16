import type { IsoDateTime } from '../../domain/models'

export interface ParsedIcsEvent {
  uid?: string
  recurrenceId?: string
  sourceKey?: string
  summary: string
  description?: string
  location?: string
  start: IsoDateTime
  end: IsoDateTime
  timezone?: string
  fingerprint: string
}

export interface IcsParseResult {
  calendarName?: string
  events: ParsedIcsEvent[]
  warnings: string[]
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) lines[lines.length - 1] += line.slice(1)
    else lines.push(line)
  }
  return lines
}

function unescapeText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function parseProperty(line: string) {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = left.split(';')
  const name = parts.shift()!.toUpperCase()
  const params: Record<string, string> = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

interface CompactParts { year: number; month: number; day: number; hour: number; minute: number; second: number; utc: boolean }

function parseCompact(value: string): CompactParts | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value)
  if (!match) return null
  return { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5], second: +(match[6] ?? 0), utc: Boolean(match[7]) }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return { year: +map.year, month: +map.month, day: +map.day, hour: +map.hour, minute: +map.minute, second: +map.second }
}

function zonedToIso(parts: CompactParts, timeZone: string): string {
  const wanted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let guess = wanted
  for (let i = 0; i < 3; i++) {
    const seen = zonedParts(new Date(guess), timeZone)
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
    guess += wanted - seenUtc
  }
  const roundTrip = zonedParts(new Date(guess), timeZone)
  if (roundTrip.year !== parts.year || roundTrip.month !== parts.month || roundTrip.day !== parts.day || roundTrip.hour !== parts.hour || roundTrip.minute !== parts.minute) {
    throw new Error(`The local calendar time ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${String(parts.minute).padStart(2,'0')} does not exist cleanly in ${timeZone} (DST transition)`)
  }
  return new Date(guess).toISOString()
}

export function parseIcsDate(value: string, params: Record<string, string>): string {
  if (params.VALUE?.toUpperCase() === 'DATE' || /^\d{8}$/.test(value)) throw new Error('all-day events are not supported by the exact-time TimeBlock model')
  const parts = parseCompact(value)
  if (!parts) throw new Error(`unsupported iCalendar date-time ${value}`)
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour > 23 || parts.minute > 59 || parts.second > 59) throw new Error(`invalid iCalendar date-time ${value}`)
  if (parts.utc) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
    if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day || date.getUTCHours() !== parts.hour || date.getUTCMinutes() !== parts.minute || date.getUTCSeconds() !== parts.second) throw new Error(`invalid iCalendar calendar date ${value}`)
    return date.toISOString()
  }
  if (params.TZID) return zonedToIso(parts, params.TZID)
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  if (date.getFullYear() !== parts.year || date.getMonth() + 1 !== parts.month || date.getDate() !== parts.day || date.getHours() !== parts.hour || date.getMinutes() !== parts.minute || date.getSeconds() !== parts.second) throw new Error(`invalid local iCalendar calendar date ${value}`)
  return date.toISOString()
}

function durationMilliseconds(value: string) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value)
  if (!match) return null
  return (+(match[1] ?? 0) * 86400 + +(match[2] ?? 0) * 3600 + +(match[3] ?? 0) * 60 + +(match[4] ?? 0)) * 1000
}

export function calendarFingerprint(uid: string | undefined, summary: string, start: string, end: string) {
  const raw = `${uid ?? ''}|${summary.trim().toLowerCase()}|${start}|${end}`
  let hash = 2166136261
  for (let i = 0; i < raw.length; i++) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return `ics-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function parseIcs(text: string): IcsParseResult {
  const lines = unfold(text)
  if (!lines.some((line) => line.trim().toUpperCase() === 'BEGIN:VCALENDAR')) throw new Error('Not a VCALENDAR file.')
  const warnings: string[] = []
  const events: ParsedIcsEvent[] = []
  let calendarName: string | undefined
  let current: NonNullable<ReturnType<typeof parseProperty>>[] | null = null

  for (const line of lines) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') { current = []; continue }
    if (upper === 'END:VEVENT') {
      if (!current) continue
      const props = current
      const get = (name: string) => props.find((p) => p.name === name)
      const uid = get('UID')?.value
      const recurrenceId = get('RECURRENCE-ID')?.value
      const sourceKey = uid ? (recurrenceId ? `${uid}#${recurrenceId}` : uid) : undefined
      const summary = unescapeText(get('SUMMARY')?.value ?? 'Untitled event').trim() || 'Untitled event'
      const description = get('DESCRIPTION') ? unescapeText(get('DESCRIPTION')!.value) : undefined
      const location = get('LOCATION') ? unescapeText(get('LOCATION')!.value) : undefined
      try {
        if (summary.length > 300) throw new Error('summary exceeds the 300-character Event title limit')
        if (description && description.length > 4000) throw new Error('description exceeds the 4000-character Event notes limit')
        if (location && location.length > 500) throw new Error('location exceeds the 500-character Event location limit')
        if (get('RRULE')) { warnings.push(`${summary}: recurring RRULE event skipped. Import materialized/non-recurring events instead.`); current = null; continue }
        if (get('STATUS')?.value.toUpperCase() === 'CANCELLED') { current = null; continue }
        const startProp = get('DTSTART')
        if (!startProp) throw new Error('missing DTSTART')
        const start = parseIcsDate(startProp.value, startProp.params)
        const endProp = get('DTEND')
        const durProp = get('DURATION')
        let end: string
        if (endProp) end = parseIcsDate(endProp.value, endProp.params)
        else if (durProp) {
          const ms = durationMilliseconds(durProp.value)
          if (!ms || ms <= 0) throw new Error('invalid DURATION')
          end = new Date(new Date(start).getTime() + ms).toISOString()
        } else throw new Error('missing DTEND or DURATION')
        if (new Date(end).getTime() <= new Date(start).getTime()) throw new Error('end must be after start')
        const startLocal = new Date(start); const endLocal = new Date(end)
        if (startLocal.getFullYear() !== endLocal.getFullYear() || startLocal.getMonth() !== endLocal.getMonth() || startLocal.getDate() !== endLocal.getDate()) throw new Error('cross-midnight events are not supported by the current TimeBlock model')
        events.push({ uid, recurrenceId, sourceKey, summary, description, location, start, end, timezone: startProp.params.TZID, fingerprint: calendarFingerprint(uid, summary, start, end) })
      } catch (error) {
        warnings.push(`${summary}: ${error instanceof Error ? error.message : String(error)}; skipped.`)
      }
      current = null
      continue
    }
    const prop = parseProperty(line)
    if (current) { if (prop) current.push(prop); continue }
    if (prop?.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value)
  }
  return { calendarName, events, warnings }
}

export function escapeIcsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function utcIcsDate(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 73) return line
  const folded: string[] = []
  let current = ''
  for (const char of line) {
    const candidate = current + char
    if (current && encoder.encode(candidate).length > 73) {
      folded.push(current)
      current = ` ${char}`
    } else current = candidate
  }
  if (current) folded.push(current)
  return folded.join('\r\n')
}
