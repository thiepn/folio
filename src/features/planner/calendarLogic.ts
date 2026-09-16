import { localDateKey } from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'

export const CALENDAR_START_MINUTE = 6 * 60
export const CALENDAR_END_MINUTE = 22 * 60
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

export function localDateFromIso(iso: string): LocalDate {
  return localDateKey(new Date(iso))
}

export function minuteOfDayFromIso(iso: string): number {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
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
  const byDate = new Map<LocalDate, TimeBlockEntity[]>()
  for (const block of blocks) {
    const date = localDateFromIso(block.start)
    const list = byDate.get(date) ?? []
    list.push(block)
    byDate.set(date, list)
  }
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (new Date(sorted[j].start).getTime() >= new Date(sorted[i].end).getTime()) break
        if (new Date(sorted[j].end).getTime() > new Date(sorted[i].start).getTime()) {
          conflicts.add(sorted[i].id)
          conflicts.add(sorted[j].id)
        }
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

export function occupiedMinutesInWindow(blocks: TimeBlockEntity[], date: LocalDate, startMinute = CALENDAR_START_MINUTE, endMinute = CALENDAR_END_MINUTE): number {
  const intervals = blocks
    .filter((block) => localDateFromIso(block.start) === date)
    .map((block) => [
      Math.max(startMinute, minuteOfDayFromIso(block.start)),
      Math.min(endMinute, minuteOfDayFromIso(block.end)),
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

export function openMinutesInWindow(blocks: TimeBlockEntity[], date: LocalDate, startMinute = CALENDAR_START_MINUTE, endMinute = CALENDAR_END_MINUTE): number {
  return Math.max(0, endMinute - startMinute - occupiedMinutesInWindow(blocks, date, startMinute, endMinute))
}
