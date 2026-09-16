import { useLiveQuery } from 'dexie-react-hooks'
import { buildHistoryEvents } from '../features/review/historyLogic'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { habitRepository } from '../repositories/habitRepository'
import { projectRepository } from '../repositories/projectRepository'
import { reviewRecordRepository } from '../repositories/reviewRecordRepository'
import { taskRepository } from '../repositories/taskRepository'

export function useHistoryData() {
  return useLiveQuery(async () => {
    const [tasks, projects, activeHabits, archivedHabits, habitEntries, focusSessions, reviewRecords] = await Promise.all([
      taskRepository.listSnapshot(),
      projectRepository.listAll(),
      habitRepository.listActive(),
      habitRepository.listArchived(),
      habitRepository.listAllEntries(),
      focusSessionRepository.listAll(),
      reviewRecordRepository.listAll(),
    ])
    const habits = [...activeHabits, ...archivedHabits]
    const events = buildHistoryEvents({ tasks, projects, habits, habitEntries, focusSessions, reviewRecords })
    return { events, reviewRecords }
  }, [])
}
