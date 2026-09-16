import type { ProjectEntity, TaskEntity } from '../../domain/models'
import { buildRecommendations, projectPaceStatus, staleTaskIssues, postponedTaskIssues, weekElapsedDays } from './reviewLogic'

const baseTask = (partial: Partial<TaskEntity>): TaskEntity => ({
  id: crypto.randomUUID(), title: 'Task', description: '', priority: 'normal', status: 'todo', sortOrder: 1,
  rescheduleCount: 0, blockedByTaskIds: [], createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z', ...partial,
})

export function validateReviewLogicCases() {
  const failures: string[] = []
  if (weekElapsedDays('2026-08-20') !== 4) failures.push('Thursday should be day 4 of Monday-first week')
  if (projectPaceStatus(60 * 60, 5 * 60, '2026-08-20') !== 'behind') failures.push('1h of 5h target by Thursday should be behind pace')
  if (projectPaceStatus(3 * 60 * 60, 5 * 60, '2026-08-20') === 'behind') failures.push('3h of 5h target by Thursday should not be behind pace')

  const project: ProjectEntity = { id: 'p1', name: 'Analysis', description: '', type: 'academic', archived: false, favorite: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
  const projects = new Map([[project.id, project]])
  const stale = staleTaskIssues([baseTask({ id: 'old', projectId: 'p1' }), baseTask({ id: 'series', seriesId: 's1' })], projects, '2026-08-20')
  if (stale.length !== 1 || stale[0].id !== 'old') failures.push('Stale review must ignore generated recurring occurrences')
  const postponed = postponedTaskIssues([baseTask({ id: 'p', rescheduleCount: 4 }), baseTask({ id: 'q', rescheduleCount: 1 })], projects, '2026-08-20')
  if (postponed.length !== 1 || postponed[0].id !== 'p') failures.push('Postponement threshold regression')

  const recommendations = buildRecommendations({ completionRate: 90, overloadedDays: 0, staleCount: 0, postponedCount: 0, scheduledMinutes: 120, actualFocusMinutes: 100, behindAcademicProjects: 0, overdueDeadlines: 0 })
  if (!recommendations.some((item) => item.id === 'realistic')) failures.push('Healthy week should produce realistic-planning feedback')
  return failures
}
