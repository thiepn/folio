import type { LocalDate, TimeBlockEntity } from '../domain/models'
import { addLocalDays, atTimeInZone, dateKeyInTimeZone, minuteOfDayInTimeZone } from '../domain/date'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import type { UndoableMutation } from './undo'
import { clampMinute } from '../features/planner/calendarLogic'

function normalizedDuration(minutes: number) {
  if (!Number.isFinite(minutes)) throw new Error('Invalid block duration.')
  return Math.max(15, Math.min(16 * 60, Math.round(minutes / 15) * 15))
}

function timing(date: LocalDate, startMinute: number, duration: number, timeZone = 'local') {
  const safeDuration = normalizedDuration(duration)
  const safeStart = clampMinute(Math.round(startMinute / 15) * 15, safeDuration)
  const start = atTimeInZone(date, safeStart, timeZone)
  return {
    start,
    end: new Date(Date.parse(start) + safeDuration * 60_000).toISOString(),
  }
}

function allDayTiming(date: LocalDate, endDateExclusive: LocalDate, timeZone = 'local') {
  if (endDateExclusive <= date) throw new Error('All-day event end date must be after start date.')
  return {
    start: atTimeInZone(date, 0, timeZone),
    end: atTimeInZone(endDateExclusive, 0, timeZone),
  }
}

export const timeBlockService = {
  async createTaskBlock(taskId: string, date: LocalDate, startMinute: number, durationMinutes: number, timeZone = 'local'): Promise<{ block: TimeBlockEntity; undo: UndoableMutation }> {
    const task = await taskRepository.get(taskId)
    if (!task || task.deletedAt) throw new Error('Task not found.')
    const when = timing(date, startMinute, durationMinutes, timeZone)
    const block = await timeBlockRepository.create({ taskId, title: task.title, kind: 'task', timeZone, ...when })
    return {
      block,
      undo: { message: 'Time block added', undo: () => timeBlockRepository.remove(block.id) },
    }
  },

  async createEvent(title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string; allDay?: boolean; endDateExclusive?: LocalDate; timeZone?: string }): Promise<{ block: TimeBlockEntity; undo: UndoableMutation }> {
    const timeZone = details?.timeZone || 'local'
    const when = details?.allDay
      ? allDayTiming(date, details.endDateExclusive ?? addLocalDays(date, 1), timeZone)
      : timing(date, startMinute, durationMinutes, timeZone)
    const block = await timeBlockRepository.create({ title, description: details?.description?.trim() || undefined, location: details?.location?.trim() || undefined, kind: 'event', allDay: Boolean(details?.allDay), timeZone, ...when })
    return {
      block,
      undo: { message: 'Event added', undo: () => timeBlockRepository.remove(block.id) },
    }
  },

  async updateTiming(id: string, date: LocalDate, startMinute: number, durationMinutes: number, timeZone?: string): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    const zone = timeZone ?? before.timeZone ?? 'local'
    await timeBlockRepository.update(id, { ...timing(date, startMinute, durationMinutes, zone), timeZone: zone, allDay: false })
    return { message: 'Time block moved', undo: () => timeBlockRepository.replace(before) }
  },

  async updateEvent(id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string; allDay?: boolean; endDateExclusive?: LocalDate; timeZone?: string }): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    const timeZone = details?.timeZone ?? before.timeZone ?? 'local'
    const when = details?.allDay
      ? allDayTiming(date, details.endDateExclusive ?? addLocalDays(date, 1), timeZone)
      : timing(date, startMinute, durationMinutes, timeZone)
    await timeBlockRepository.update(id, { title, description: details?.description?.trim() || undefined, location: details?.location?.trim() || undefined, allDay: Boolean(details?.allDay), timeZone, ...when })
    return { message: 'Event updated', undo: () => timeBlockRepository.replace(before) }
  },

  async resize(id: string, durationMinutes: number): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    if (before.allDay) throw new Error('Resize an all-day event by editing its dates.')
    const zone = before.timeZone ?? 'local'
    const localDate = dateKeyInTimeZone(before.start, zone)
    const startMinute = minuteOfDayInTimeZone(before.start, zone)
    const safeDuration = Math.min(normalizedDuration(durationMinutes), Math.max(15, 24 * 60 - startMinute))
    const start = atTimeInZone(localDate, startMinute, zone)
    await timeBlockRepository.update(id, { start, end: new Date(Date.parse(start) + safeDuration * 60_000).toISOString() })
    return { message: 'Time block resized', undo: () => timeBlockRepository.replace(before) }
  },

  async duplicate(id: string, date?: LocalDate, startMinute?: number, timeZone?: string): Promise<{ block: TimeBlockEntity; undo: UndoableMutation }> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    const zone = timeZone ?? before.timeZone ?? 'local'
    let start = before.start
    let end = before.end
    if (date) {
      if (before.allDay) {
        const startDate = dateKeyInTimeZone(before.start, zone)
        const endDate = dateKeyInTimeZone(new Date(Date.parse(before.end) - 1).toISOString(), zone)
        const days = Math.max(1, Math.round((Date.parse(endDate + 'T12:00:00') - Date.parse(startDate + 'T12:00:00')) / 86_400_000) + 1)
        const when = allDayTiming(date, addLocalDays(date, days), zone)
        start = when.start; end = when.end
      } else {
        const duration = Math.max(15, Math.round((Date.parse(before.end) - Date.parse(before.start)) / 60_000))
        const minute = startMinute ?? minuteOfDayInTimeZone(before.start, zone)
        const when = timing(date, minute, duration, zone)
        start = when.start; end = when.end
      }
    }
    const block = await timeBlockRepository.create({
      taskId: before.taskId,
      title: before.title,
      description: before.description,
      location: before.location,
      kind: before.kind,
      allDay: before.allDay,
      timeZone: zone,
      source: 'folio',
      start,
      end,
    })
    return { block, undo: { message: 'Calendar item duplicated', undo: () => timeBlockRepository.remove(block.id) } }
  },

  async remove(id: string): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    await timeBlockRepository.remove(id)
    return { message: 'Time block removed', undo: () => timeBlockRepository.replace(before) }
  },
}
