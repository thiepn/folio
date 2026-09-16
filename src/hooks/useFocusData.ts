import { useLiveQuery } from 'dexie-react-hooks'
import { localDateKey, startOfLocalWeek } from '../domain/date'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { effectiveFocusSeconds } from '../features/focus/focusLogic'
import type { FocusSessionPreview } from '../types/ui'

export function useFocusData() {
  const today = localDateKey()
  return useLiveQuery(async () => {
    const [sessions, tasks, projectMap] = await Promise.all([
      focusSessionRepository.listAll(),
      taskRepository.listAll(),
      projectRepository.getMap(),
    ])
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const active = sessions.find((session) => session.status === 'running' || session.status === 'paused')
    const finished = sessions.filter((session) => session.status === 'finished')
    const weekStart = startOfLocalWeek(today)
    const taskTotals: Record<string, number> = {}
    const projectWeekSeconds: Record<string, number> = {}

    for (const session of sessions) {
      if (session.status === 'cancelled') continue
      const seconds = session.status === 'finished' ? session.durationSeconds : effectiveFocusSeconds(session)
      if (session.taskId) taskTotals[session.taskId] = (taskTotals[session.taskId] ?? 0) + seconds
      const date = localDateKey(new Date(session.startedAt))
      if (date >= weekStart && date <= today) {
        const projectKey = session.projectIdSnapshot ?? (session.taskId ? taskMap.get(session.taskId)?.projectId : undefined) ?? '__unassigned__'
        projectWeekSeconds[projectKey] = (projectWeekSeconds[projectKey] ?? 0) + seconds
      }
    }

    const weekSessions = finished.filter((session) => {
      const date = localDateKey(new Date(session.startedAt))
      return date >= weekStart && date <= today
    })
    const todaySessions = finished.filter((session) => localDateKey(new Date(session.startedAt)) === today)
    const weekSeconds = weekSessions.reduce((sum, session) => sum + session.durationSeconds, 0)
    const todaySeconds = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0)

    const estimateSnapshotByTask: Record<string, number> = {}
    for (const session of [...sessions].reverse()) {
      if (session.taskId && session.taskEstimateMinutesSnapshot) estimateSnapshotByTask[session.taskId] ??= session.taskEstimateMinutesSnapshot
    }
    const completedWithEstimates = tasks.filter((task) => task.status === 'completed' && (estimateSnapshotByTask[task.id] ?? task.estimatedMinutes) && (taskTotals[task.id] ?? 0) > 0)
    const estimatedSeconds = completedWithEstimates.reduce((sum, task) => sum + (estimateSnapshotByTask[task.id] ?? task.estimatedMinutes ?? 0) * 60, 0)
    const actualSeconds = completedWithEstimates.reduce((sum, task) => sum + (taskTotals[task.id] ?? 0), 0)
    const estimateVariancePercent = estimatedSeconds ? Math.round((actualSeconds / estimatedSeconds - 1) * 100) : null

    const preview = (session: (typeof sessions)[number]): FocusSessionPreview => {
      const task = session.taskId ? taskMap.get(session.taskId) : undefined
      const project = session.projectIdSnapshot ? projectMap.get(session.projectIdSnapshot) : task?.projectId ? projectMap.get(task.projectId) : undefined
      return {
        id: session.id,
        taskId: session.taskId,
        taskTitle: session.taskTitleSnapshot ?? task?.title ?? 'Focus session',
        projectId: session.projectIdSnapshot ?? task?.projectId,
        projectName: session.projectNameSnapshot ?? project?.name,
        mode: session.mode,
        targetSeconds: session.targetSeconds,
        plannedSeconds: session.plannedSeconds,
        intention: session.intention,
        note: session.note,
        durationSeconds: session.status === 'running' || session.status === 'paused' ? effectiveFocusSeconds(session) : session.durationSeconds,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
      }
    }

    return {
      activeSession: active,
      recentSessions: finished.slice(0, 20).map(preview),
      taskTotals,
      projectWeekSeconds,
      weekSeconds,
      todaySeconds,
      weekSessionCount: weekSessions.length,
      estimateVariancePercent,
    }
  }, [today])
}
