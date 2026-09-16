import type { TimeBlockEntity } from '../../domain/models'
import { blockConflicts, isoAtMinute, openMinutesInWindow, remainingTaskMinutes, roundMinute, scheduledMinutesForTask } from './calendarLogic'

const date = '2026-08-20' as const
const stamp = '2026-08-20T00:00:00.000Z'
const blocks: TimeBlockEntity[] = [
  { id: 'event', kind: 'event', title: 'Lecture', start: isoAtMinute(date, 9 * 60), end: isoAtMinute(date, 10 * 60 + 30), createdAt: stamp, updatedAt: stamp },
  { id: 'study-a', kind: 'task', taskId: 'study', title: 'Study', start: isoAtMinute(date, 10 * 60), end: isoAtMinute(date, 11 * 60 + 30), createdAt: stamp, updatedAt: stamp },
  { id: 'study-b', kind: 'task', taskId: 'study', title: 'Study', start: isoAtMinute(date, 14 * 60), end: isoAtMinute(date, 15 * 60), createdAt: stamp, updatedAt: stamp },
]

export function validateCalendarLogicCases() {
  const failures: string[] = []
  const conflicts = blockConflicts(blocks)
  if (!conflicts.has('event') || !conflicts.has('study-a') || conflicts.has('study-b')) failures.push('overlap detection')
  if (scheduledMinutesForTask(blocks, 'study') !== 150) failures.push('multi-session task total')
  if (remainingTaskMinutes(180, blocks, 'study') !== 30) failures.push('remaining estimate')
  if (openMinutesInWindow(blocks, date) !== 750) failures.push('visible window free time')
  if (roundMinute(607) !== 600 || roundMinute(608) !== 615) failures.push('15-minute rounding')
  return failures
}
