import type { TimeBlockEntity } from '../../domain/models'
import {
  allDayBlocksForDate, blockConflicts, blockTouchesDate, calendarRangeForMode,
  isoAtMinute, layoutTimedBlocks, openMinutesInWindow, remainingTaskMinutes,
  roundMinute, scheduledMinutesForTask,
} from './calendarLogic'

const date = '2026-08-20' as const
const nextDate = '2026-08-21' as const
const stamp = '2026-08-20T00:00:00.000Z'
const blocks: TimeBlockEntity[] = [
  { id: 'event', kind: 'event', title: 'Lecture', start: isoAtMinute(date, 9 * 60), end: isoAtMinute(date, 10 * 60 + 30), createdAt: stamp, updatedAt: stamp },
  { id: 'study-a', kind: 'task', taskId: 'study', title: 'Study', start: isoAtMinute(date, 10 * 60), end: isoAtMinute(date, 11 * 60 + 30), createdAt: stamp, updatedAt: stamp },
  { id: 'study-b', kind: 'task', taskId: 'study', title: 'Study', start: isoAtMinute(date, 14 * 60), end: isoAtMinute(date, 15 * 60), createdAt: stamp, updatedAt: stamp },
  { id: 'all-day', kind: 'event', title: 'Conference', allDay: true, start: isoAtMinute(date, 0), end: isoAtMinute(nextDate, 0), createdAt: stamp, updatedAt: stamp },
  { id: 'overnight', kind: 'event', title: 'Night shift', start: isoAtMinute(date, 23 * 60), end: isoAtMinute(nextDate, 60), createdAt: stamp, updatedAt: stamp },
]

export function validateCalendarLogicCases() {
  const failures: string[] = []

  const conflicts = blockConflicts(blocks)
  if (!conflicts.has('event') || !conflicts.has('study-a') || conflicts.has('study-b')) failures.push('overlap detection')
  if (conflicts.has('all-day')) failures.push('all-day items must not create clock conflicts')

  if (scheduledMinutesForTask(blocks, 'study') !== 150) failures.push('multi-session task total')
  if (remainingTaskMinutes(180, blocks, 'study') !== 30) failures.push('remaining estimate')
  if (openMinutesInWindow(blocks, date, 6 * 60, 22 * 60) !== 750) failures.push('working-window free time')
  if (roundMinute(607) !== 600 || roundMinute(608) !== 615) failures.push('15-minute rounding')

  const layout = layoutTimedBlocks(blocks, date)
  const eventLayout = layout.find((item) => item.block.id === 'event')
  const studyLayout = layout.find((item) => item.block.id === 'study-a')
  if (!eventLayout || !studyLayout || eventLayout.columns !== 2 || studyLayout.columns !== 2 || eventLayout.column === studyLayout.column) failures.push('side-by-side overlap layout')

  if (allDayBlocksForDate(blocks, date).map((block) => block.id).join(',') !== 'all-day') failures.push('all-day lane membership')
  if (!blockTouchesDate(blocks.find((block) => block.id === 'overnight')!, nextDate)) failures.push('cross-midnight event next-day span')

  const three = calendarRangeForMode('3day', date)
  if (three.from !== '2026-08-20' || three.through !== '2026-08-22') failures.push('3-day range')

  const week = calendarRangeForMode('week', date)
  if (week.from !== '2026-08-17' || week.through !== '2026-08-23') failures.push('week range')

  const multi = calendarRangeForMode('multiweek', date)
  if (multi.from !== '2026-08-17' || multi.through !== '2026-09-13') failures.push('4-week range')

  const month = calendarRangeForMode('month', date)
  if (month.from !== '2026-07-27' || month.through !== '2026-09-06') failures.push('month grid range')

  const year = calendarRangeForMode('year', date)
  if (year.from !== '2026-01-01' || year.through !== '2026-12-31') failures.push('year range')

  return failures
}
