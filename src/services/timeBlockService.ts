import type { LocalDate, TimeBlockEntity } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import type { UndoableMutation } from './undo'
import { clampMinute, isoAtMinute } from '../features/planner/calendarLogic'

function normalizedDuration(minutes: number) {
  if (!Number.isFinite(minutes)) throw new Error('Invalid block duration.')
  return Math.max(15, Math.min(16 * 60, Math.round(minutes / 15) * 15))
}

function timing(date: LocalDate, startMinute: number, duration: number) {
  const safeDuration = normalizedDuration(duration)
  const safeStart = clampMinute(Math.round(startMinute / 15) * 15, safeDuration)
  return {
    start: isoAtMinute(date, safeStart),
    end: isoAtMinute(date, safeStart + safeDuration),
  }
}

export const timeBlockService = {
  async createTaskBlock(taskId: string, date: LocalDate, startMinute: number, durationMinutes: number): Promise<{ block: TimeBlockEntity; undo: UndoableMutation }> {
    const task = await taskRepository.get(taskId)
    if (!task || task.deletedAt) throw new Error('Task not found.')
    const when = timing(date, startMinute, durationMinutes)
    const block = await timeBlockRepository.create({ taskId, title: task.title, kind: 'task', ...when })
    return {
      block,
      undo: { message: 'Time block added', undo: () => timeBlockRepository.remove(block.id) },
    }
  },

  async createEvent(title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }): Promise<{ block: TimeBlockEntity; undo: UndoableMutation }> {
    const when = timing(date, startMinute, durationMinutes)
    const block = await timeBlockRepository.create({ title, description: details?.description?.trim() || undefined, location: details?.location?.trim() || undefined, kind: 'event', ...when })
    return {
      block,
      undo: { message: 'Event added', undo: () => timeBlockRepository.remove(block.id) },
    }
  },

  async updateTiming(id: string, date: LocalDate, startMinute: number, durationMinutes: number): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    await timeBlockRepository.update(id, timing(date, startMinute, durationMinutes))
    return { message: 'Time block moved', undo: () => timeBlockRepository.replace(before) }
  },

  async updateEvent(id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    const when = timing(date, startMinute, durationMinutes)
    await timeBlockRepository.update(id, { title, description: details?.description?.trim() || undefined, location: details?.location?.trim() || undefined, ...when })
    return { message: 'Event updated', undo: () => timeBlockRepository.replace(before) }
  },

  async resize(id: string, durationMinutes: number): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    const date = new Date(before.start)
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const startMinute = date.getHours() * 60 + date.getMinutes()
    const safeDuration = Math.min(normalizedDuration(durationMinutes), Math.max(15, 22 * 60 - startMinute))
    await timeBlockRepository.update(id, { start: before.start, end: isoAtMinute(localDate, startMinute + safeDuration) })
    return { message: 'Time block resized', undo: () => timeBlockRepository.replace(before) }
  },

  async remove(id: string): Promise<UndoableMutation> {
    const before = await timeBlockRepository.get(id)
    if (!before) throw new Error('Time block not found.')
    await timeBlockRepository.remove(id)
    return { message: 'Time block removed', undo: () => timeBlockRepository.replace(before) }
  },
}
