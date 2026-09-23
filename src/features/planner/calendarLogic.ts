import { dateKeyInTimeZone, minuteOfDayInTimeZone } from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'

export const CALENDAR_START_MINUTE = 0
export const CALENDAR_END_MINUTE = 24 * 60
export const CALENDAR_STEP_MINUTES = 15
export const CALENDAR_PX_PER_MINUTE = 1

export function clampMinute(minute: number, durationMinutes = CALENDAR_STEP_MINUTES) {
  return Math.max(CALENDAR_START_MINUTE, Math.min(CALENDAR_END_MINUTE - durationMinutes, minute))
}

export function roundMinute(minute: number, step = CALENDAR_STEP_MINUTES) {
  return Math.round(minute / step) * step
}

export function isoAtMinute(date: LocalDate, minuteOfDay: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString()
}

export function localDateFromIso(iso: string, timeZone = 'local'): LocalDate {
  return dateKeyInTimeZone(iso, timeZone)
}

export function minuteOfDayFromIso(iso: string, timeZone = 'local'): number {
  return minuteOfDayInTimeZone(iso, timeZone)
}

export function durationMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

export function formatClockMinute(minute: number): string {
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function blockConflicts(blocks: TimeBlockEntity[]): Set<string> {
  const conflicts = new Set<string>()
  const sorted = blocks.filter((block) => !block.allDay).sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (Date.parse(sorted[j].start) >= Date.parse(sorted[i].end)) break
      if (Date.parse(sorted[j].end) > Date.parse(sorted[i].start)) {
        conflicts.add(sorted[i].id)
        conflicts.add(sorted[j].id)
      }
    }
  }
  return conflicts
}

export function scheduledMinutesForTask(blocks: TimeBlockEntity[], taskId: string): number {
  return blocks.filter((block) => block.taskId === taskId).reduce((sum, block) => sum + durationMinutes(block.start, block.end), 0)
}

export function remainingTaskMinutes(estimate: number | undefined, blocks: TimeBlockEntity[], taskId: string): number {
  if (!estimate) return 0
  return Math.max(0, estimate - scheduledMinutesForTask(blocks, taskId))
}

export function occupiedMinutesInWindow(blocks: TimeBlockEntity[], date: LocalDate, startMinute = CALENDAR_START_MINUTE, endMinute = CALENDAR_END_MINUTE, timeZone = 'local'): number {
  const intervals = blocks
    .filter((block) => !block.allDay && blockTouchesDate(block, date, timeZone))
    .map((block) => [
      Math.max(startMinute, blockStartMinuteForDate(block, date, timeZone)),
      Math.min(endMinute, blockEndMinuteForDate(block, date, timeZone)),
    ] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0])

  if (!intervals.length) return 0
  let total = 0
  let [currentStart, currentEnd] = intervals[0]
  for (const [start, end] of intervals.slice(1)) {
    if (start <= currentEnd) currentEnd = Math.max(currentEnd, end)
    else {
      total += currentEnd - currentStart
      currentStart = start
      currentEnd = end
    }
  }
  return total + currentEnd - currentStart
}

export function openMinutesInWindow(blocks: TimeBlockEntity[], date: LocalDate, startMinute = CALENDAR_START_MINUTE, endMinute = CALENDAR_END_MINUTE, timeZone = 'local'): number {
  return Math.max(0, endMinute - startMinute - occupiedMinutesInWindow(blocks, date, startMinute, endMinute, timeZone))
}


export interface CalendarBlockLayout {
  block: TimeBlockEntity
  column: number
  columns: number
}

export function layoutTimedBlocks(blocks: TimeBlockEntity[], date: LocalDate, timeZone = 'local'): CalendarBlockLayout[] {
  const timed = blocks
    .filter((block) => !block.allDay && blockTouchesDate(block, date, timeZone))
    .map((block) => ({
      block,
      start: blockStartMinuteForDate(block, date, timeZone),
      end: blockEndMinuteForDate(block, date, timeZone),
    }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.block.id.localeCompare(b.block.id))

  const result: CalendarBlockLayout[] = []
  let cluster: typeof timed = []
  let clusterEnd = -1

  function flush() {
    if (!cluster.length) return
    const active: Array<{ end: number; column: number }> = []
    const placements = cluster.map((item) => {
      for (let i = active.length - 1; i >= 0; i -= 1) if (active[i].end <= item.start) active.splice(i, 1)
      const used = new Set(active.map((entry) => entry.column))
      let column = 0
      while (used.has(column)) column += 1
      active.push({ end: item.end, column })
      return { item, column }
    })
    const columns = Math.max(1, ...placements.map((placement) => placement.column + 1))
    for (const placement of placements) result.push({ block: placement.item.block, column: placement.column, columns })
    cluster = []
    clusterEnd = -1
  }

  for (const item of timed) {
    if (cluster.length && item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return result
}

export function blockTouchesDate(block: TimeBlockEntity, date: LocalDate, timeZone = 'local'): boolean {
  const zone = block.allDay ? (block.timeZone ?? 'local') : timeZone
  const startDate = localDateFromIso(block.start, zone)
  const endInstant = new Date(Math.max(Date.parse(block.start), Date.parse(block.end) - 1)).toISOString()
  const endDate = localDateFromIso(endInstant, zone)
  return date >= startDate && date <= endDate
}

export function blockStartMinuteForDate(block: TimeBlockEntity, date: LocalDate, timeZone = 'local'): number {
  const startDate = localDateFromIso(block.start, timeZone)
  return date === startDate ? minuteOfDayFromIso(block.start, timeZone) : 0
}

export function blockEndMinuteForDate(block: TimeBlockEntity, date: LocalDate, timeZone = 'local'): number {
  const exclusiveEnd = new Date(Date.parse(block.end) - 1).toISOString()
  const endDate = localDateFromIso(exclusiveEnd, timeZone)
  return date === endDate ? Math.min(24 * 60, minuteOfDayFromIso(block.end, timeZone) || 24 * 60) : 24 * 60
}

export function allDayBlocksForDate(blocks: TimeBlockEntity[], date: LocalDate, timeZone = 'local') {
  return blocks.filter((block) => block.allDay && blockTouchesDate(block, date, timeZone))
}

export function calendarRangeForMode(mode: 'agenda'|'day'|'3day'|'week'|'multiweek'|'month'|'year', selectedDate: LocalDate) {
  if (mode === 'day') return { from: selectedDate, through: selectedDate }
  if (mode === '3day') return { from: selectedDate, through: addDateDays(selectedDate, 2) }
  if (mode === 'week') {
    const from = mondayStart(selectedDate)
    return { from, through: addDateDays(from, 6) }
  }
  if (mode === 'multiweek') {
    const from = mondayStart(selectedDate)
    return { from, through: addDateDays(from, 27) }
  }
  if (mode === 'month') {
    const first = monthGridStart(selectedDate)
    return { from: first, through: addDateDays(first, 41) }
  }
  if (mode === 'year') {
    const year = Number(selectedDate.slice(0,4))
    return { from: `${year}-01-01`, through: `${year}-12-31` }
  }
  return { from: selectedDate, through: addDateDays(selectedDate, 30) }
}

function addDateDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(year, month - 1, day + days, 12)
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
}

function mondayStart(date: LocalDate): LocalDate {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(year, month - 1, day, 12)
  const weekday = value.getDay()
  value.setDate(value.getDate() + (weekday === 0 ? -6 : 1 - weekday))
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
}

function monthGridStart(date: LocalDate): LocalDate {
  const [year, month] = date.split('-').map(Number)
  return mondayStart(`${year}-${String(month).padStart(2,'0')}-01`)
}
