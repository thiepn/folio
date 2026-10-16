/** Calendar C1: bounded, same-origin adapter over canonical Folio services.
 * This does not expose a hosted API or authorize other origins/THIEPN Hub.
 * Snapshot freshness is observational, not an optimistic locking revision.
 */
import type { LocalDate } from '../domain/models'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { habitRepository } from '../repositories/habitRepository'
import { timeBlockService } from './timeBlockService'
import { habitService } from './habitService'

export interface FolioCalendarDaySnapshotV1 {
  schemaVersion: 1
  owner: 'folio'
  privacy: 'private'
  coverage: 'device-local'
  observedAt: string
  date: LocalDate
  timeZone: string
  tasks: Array<{ id: string; title: string; status: string; plannedDate?: LocalDate; deadline?: LocalDate; estimatedMinutes?: number }>
  timeBlocks: Array<{ id: string; taskId?: string; title: string; start: string; end: string; kind: 'event' | 'task'; allDay: boolean; source: 'folio' | 'ics' }>
  habits: Array<{ id: string; title: string; kind: 'check' | 'quantity' | 'duration'; target: number; loggedValue: number; entryStatus: 'open' | 'completed' | 'skipped' }>
}

export interface FolioCalendarPortV1 {
  getDaySnapshot(date: LocalDate, timeZone?: string): Promise<FolioCalendarDaySnapshotV1>
  createTaskBlock: typeof timeBlockService.createTaskBlock
  createEvent: typeof timeBlockService.createEvent
  updateTiming: typeof timeBlockService.updateTiming
  updateEvent: typeof timeBlockService.updateEvent
  resize: typeof timeBlockService.resize
  duplicate: typeof timeBlockService.duplicate
  remove: typeof timeBlockService.remove
  toggleHabit: typeof habitService.toggleComplete
  incrementHabit: typeof habitService.increment
  toggleHabitRest: (id: string, date: LocalDate) => ReturnType<typeof habitService.skip>
}

export const folioCalendarPort: FolioCalendarPortV1 = {
  async getDaySnapshot(date, timeZone = 'local') {
    const [tasks, blocks, habits, entries] = await Promise.all([
      taskRepository.listAll(), timeBlockRepository.listBetween(date, date, timeZone),
      habitRepository.listActive(), habitRepository.listAllEntries(),
    ])
    const entryMap = new Map(entries.filter((item) => item.date === date).map((item) => [item.habitId, item]))
    return {
      schemaVersion: 1, owner: 'folio', privacy: 'private', coverage: 'device-local',
      observedAt: new Date().toISOString(), date, timeZone,
      tasks: tasks.filter((item) => !item.deletedAt && item.status !== 'cancelled').map((item) => ({
        id: item.id, title: item.title, status: item.status, plannedDate: item.plannedDate,
        deadline: item.deadline, estimatedMinutes: item.estimatedMinutes,
      })),
      timeBlocks: blocks.map((item) => ({
        id: item.id, taskId: item.taskId, title: item.title, start: item.start, end: item.end,
        kind: item.kind, allDay: Boolean(item.allDay), source: item.source ?? 'folio',
      })),
      habits: habits.map((item) => {
        const entry = entryMap.get(item.id)
        return { id: item.id, title: item.title, kind: item.kind, target: item.target,
          loggedValue: entry?.value ?? 0, entryStatus: entry?.status ?? 'open' }
      }),
    }
  },
  createTaskBlock: (...args) => timeBlockService.createTaskBlock(...args),
  createEvent: (...args) => timeBlockService.createEvent(...args),
  updateTiming: (...args) => timeBlockService.updateTiming(...args),
  updateEvent: (...args) => timeBlockService.updateEvent(...args),
  resize: (...args) => timeBlockService.resize(...args),
  duplicate: (...args) => timeBlockService.duplicate(...args),
  remove: (...args) => timeBlockService.remove(...args),
  toggleHabit: (id, date) => habitService.toggleComplete(id, date),
  incrementHabit: (id, date, amount) => habitService.increment(id, date, amount),
  toggleHabitRest: async (id, date) => {
    const entry = await habitRepository.getEntry(id, date)
    return entry?.status === 'skipped' ? habitService.unskip(id, date) : habitService.skip(id, date)
  },
}
