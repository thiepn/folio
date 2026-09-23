import type { HabitEntity, ProjectEntity, TaskEntity } from '../../domain/models'
import { buildDeadlinePressure, buildForecast, taskIsBlocked } from './advancedPlanning'
import { wouldCreateDependencyCycle } from './dependencyLogic'

const now = '2026-08-21T08:00:00.000Z'
const task = (id: string, partial: Partial<TaskEntity> = {}): TaskEntity => ({ id, title: id, description: '', priority: 'normal', status: 'todo', tags: [], tagIds: [], checklist: [], progressMode: 'auto', progressPercent: 0, timelineMilestone: false, pinned: false, comments: [], activity: [], blockedByTaskIds: [], sortOrder: 1, rescheduleCount: 0, createdAt: now, updatedAt: now, ...partial })

export function validateAdvancedPlanningCases() {
  const failures: string[] = []
  const a = task('a', { blockedByTaskIds: ['b'] })
  const b = task('b', { blockedByTaskIds: ['c'] })
  const c = task('c')
  const map = new Map([[a.id, a], [b.id, b], [c.id, c]])
  if (!wouldCreateDependencyCycle('c', ['a'], map)) failures.push('Dependency cycle C→A→B→C must be rejected')
  if (wouldCreateDependencyCycle('c', ['b'], new Map([[a.id, a], [b.id, task('b')], [c.id, c]]))) failures.push('Acyclic dependency should be allowed')

  const blocked = task('blocked', { blockedByTaskIds: ['prereq'], deadline: '2026-08-24', estimatedMinutes: 60 })
  const prereq = task('prereq')
  const pressure = buildDeadlinePressure([blocked, prereq], '2026-08-21')
  if (pressure[0]?.pressure !== 'critical' || !pressure[0].blocked) failures.push('Blocked near deadline should be critical pressure')

  const inboxPrereq = task('inbox-prereq', { status: 'inbox' })
  if (taskIsBlocked(task('depends-on-inbox', { blockedByTaskIds: [inboxPrereq.id] }), new Map([[inboxPrereq.id, inboxPrereq]]))) failures.push('Inbox captures must never become active blockers')

  const habit: HabitEntity = { id: 'h', title: 'Study', description: '', kind: 'duration', target: 30, schedule: { type: 'daily' }, countsTowardCapacity: true, pauses: [], archived: false, sortOrder: 1, createdAt: now, updatedAt: now }
  const forecast = buildForecast({ tasks: [task('planned', { plannedDate: '2026-08-21', estimatedMinutes: 90 })], habits: [habit], capacities: new Map(), today: '2026-08-21', defaultCapacity: 100, days: 7 })
  if (forecast.days[0].totalMinutes !== 120 || forecast.days[0].remainingMinutes !== -20) failures.push('Forecast must include duration-habit capacity')
  if (forecast.weeks[0].overloadedDays < 1) failures.push('Forecast overloaded-day regression')

  const project: ProjectEntity = { id: 'p', name: 'Course', description: '', notes: '', type: 'academic', status: 'active', milestones: [], activity: [], archived: false, favorite: false, examDate: '2026-09-18', weeklyTargetMinutes: 300, createdAt: now, updatedAt: now }
  void project
  return failures
}
