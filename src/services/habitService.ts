import { addLocalDays } from '../domain/date'
import { habitPausedForDate } from '../domain/habit'
import { habitRepository, type HabitCreateInput, type HabitUpdateInput } from '../repositories/habitRepository'
import type { HabitEntryEntity, HabitPausePeriod, LocalDate } from '../domain/models'
import type { UndoableMutation } from './undo'

function now() { return new Date().toISOString() }

async function mutateEntry(habitId: string, date: LocalDate, transform: (habitTarget: number, previous?: HabitEntryEntity) => HabitEntryEntity | undefined, message: string): Promise<UndoableMutation> {
  const habit = await habitRepository.get(habitId)
  if (!habit || habit.archived) throw new Error('Habit not found.')
  if (habitPausedForDate(habit, date)) throw new Error('This habit is paused on that date. Resume it before logging progress.')
  const previous = await habitRepository.getEntry(habitId, date)
  const next = transform(habit.target, previous)
  if (next) await habitRepository.putEntry(next)
  else await habitRepository.removeEntry(habitId, date)
  return {
    message,
    undo: async () => { if (previous) await habitRepository.putEntry(previous); else await habitRepository.removeEntry(habitId, date) },
  }
}

export const habitService = {
  async create(input: HabitCreateInput): Promise<{ habitId: string; undo: UndoableMutation }> {
    const habit = await habitRepository.create(input)
    return {
      habitId: habit.id,
      undo: { message: 'Habit created', undo: async () => { await habitRepository.remove(habit.id) } },
    }
  },

  async update(habitId: string, input: HabitUpdateInput): Promise<UndoableMutation> {
    const previous = await habitRepository.get(habitId)
    if (!previous) throw new Error('Habit not found.')
    await habitRepository.update(habitId, input)
    return { message: 'Habit updated', undo: async () => { await habitRepository.replace(previous) } }
  },

  async pause(habitId: string, startDate: LocalDate, through?: LocalDate): Promise<UndoableMutation> {
    const previous = await habitRepository.get(habitId)
    if (!previous || previous.archived) throw new Error('Habit not found.')
    if (through && through < startDate) throw new Error('Pause end date cannot be before its start date.')
    const pauses = [...(previous.pauses ?? [])]
    const activeIndex = pauses.findIndex((period) => startDate >= period.startDate && (!period.endDate || startDate <= period.endDate))
    if (activeIndex >= 0) pauses[activeIndex] = { ...pauses[activeIndex], endDate: through }
    else {
      const period: HabitPausePeriod = { id: crypto.randomUUID(), startDate, endDate: through, createdAt: now() }
      pauses.push(period)
    }
    await habitRepository.replace({ ...previous, pauses, updatedAt: now() })
    return { message: through ? 'Habit paused through selected date' : 'Habit paused', undo: async () => { await habitRepository.replace(previous) } }
  },

  async resume(habitId: string, date: LocalDate): Promise<UndoableMutation> {
    const previous = await habitRepository.get(habitId)
    if (!previous || previous.archived) throw new Error('Habit not found.')
    const pauses = [...(previous.pauses ?? [])]
    const index = pauses.findIndex((period) => date >= period.startDate && (!period.endDate || date <= period.endDate))
    if (index < 0) throw new Error('This habit is not paused today.')
    if (pauses[index].startDate >= date) pauses.splice(index, 1)
    else pauses[index] = { ...pauses[index], endDate: addLocalDays(date, -1) }
    await habitRepository.replace({ ...previous, pauses, updatedAt: now() })
    return { message: 'Habit resumed', undo: async () => { await habitRepository.replace(previous) } }
  },

  async archive(habitId: string): Promise<UndoableMutation> {
    const previous = await habitRepository.get(habitId)
    if (!previous) throw new Error('Habit not found.')
    await habitRepository.update(habitId, { archived: true })
    return { message: 'Habit archived', undo: async () => { await habitRepository.replace(previous) } }
  },

  async restore(habitId: string): Promise<UndoableMutation> {
    const previous = await habitRepository.get(habitId)
    if (!previous) throw new Error('Habit not found.')
    await habitRepository.update(habitId, { archived: false })
    return { message: 'Habit restored', undo: async () => { await habitRepository.replace(previous) } }
  },

  async setValue(habitId: string, date: LocalDate, value: number): Promise<UndoableMutation> {
    return mutateEntry(habitId, date, (target, previous) => {
      const safe = Math.max(0, Math.min(target, Math.round(value)))
      if (safe === 0 && !previous) return undefined
      const timestamp = now()
      return {
        id: `${habitId}:${date}`, habitId, date, value: safe,
        status: safe >= target ? 'completed' : 'open',
        completedAt: safe >= target ? (previous?.completedAt ?? timestamp) : undefined,
        skippedAt: undefined,
        updatedAt: timestamp,
      }
    }, 'Habit progress updated')
  },

  async increment(habitId: string, date: LocalDate, delta: number): Promise<UndoableMutation> {
    const previous = await habitRepository.getEntry(habitId, date)
    return this.setValue(habitId, date, (previous?.status === 'skipped' ? 0 : previous?.value ?? 0) + delta)
  },

  async toggleComplete(habitId: string, date: LocalDate): Promise<UndoableMutation> {
    const habit = await habitRepository.get(habitId)
    if (!habit) throw new Error('Habit not found.')
    const previous = await habitRepository.getEntry(habitId, date)
    return this.setValue(habitId, date, previous?.status === 'completed' ? 0 : habit.target)
  },

  async skip(habitId: string, date: LocalDate): Promise<UndoableMutation> {
    return mutateEntry(habitId, date, (_target, previous) => {
      const timestamp = now()
      return { id: `${habitId}:${date}`, habitId, date, value: 0, status: 'skipped', skippedAt: timestamp, updatedAt: timestamp }
    }, 'Habit skipped for today')
  },

  async unskip(habitId: string, date: LocalDate): Promise<UndoableMutation> {
    return mutateEntry(habitId, date, (_target, previous) => {
      if (!previous) return undefined
      if (previous.status !== 'skipped') return previous
      return { ...previous, value: 0, status: 'open', skippedAt: undefined, completedAt: undefined, updatedAt: now() }
    }, 'Habit restored for today')
  },
}
