import type { HabitPreview } from '../../types/ui'
import { outstandingHabitMinutes } from '../today/planningLogic'

export function validateHabitPlanningCases() {
  const failures: string[] = []
  const base: HabitPreview = { id: 'h', title: 'French', kind: 'duration', completed: false, target: 30, currentValue: 10, countsTowardCapacity: true }
  if (outstandingHabitMinutes([base]) !== 20) failures.push('remaining duration should count toward capacity')
  if (outstandingHabitMinutes([{ ...base, skipped: true }]) !== 0) failures.push('rest day should not count toward capacity')
  if (outstandingHabitMinutes([{ ...base, countsTowardCapacity: false, flexible: true }]) !== 0) failures.push('uncommitted flexible habit should not count toward capacity')
  if (outstandingHabitMinutes([{ ...base, completed: true, currentValue: 30 }]) !== 0) failures.push('completed habit should not count toward capacity')
  return failures
}
