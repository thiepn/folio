import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, localDateRange, startOfLocalWeek } from '../domain/date'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { taskRepository } from '../repositories/taskRepository'
import { projectRepository } from '../repositories/projectRepository'
import { effectiveBreakSeconds, effectiveFocusSeconds } from '../features/focus/focusLogic'
import { focusSettingsService } from '../services/focusSettingsService'
import type { FocusSessionPreview } from '../types/ui'

export function useFocusData() {
  const today = localDateKey()
  return useLiveQuery(async () => {
    const [sessions, tasks, projectMap, goals, templates] = await Promise.all([
      focusSessionRepository.listAll(), taskRepository.listAll(), projectRepository.getMap(),
      focusSettingsService.getGoals(), focusSettingsService.listTemplates(),
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

    const weekSessions = finished.filter((session) => { const date=localDateKey(new Date(session.startedAt)); return date>=weekStart&&date<=today })
    const todaySessions = finished.filter((session) => localDateKey(new Date(session.startedAt)) === today)
    const weekSeconds = weekSessions.reduce((sum, session) => sum + session.durationSeconds, 0)
    const todaySeconds = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0)

    const estimateSnapshotByTask: Record<string, number> = {}
    for (const session of [...sessions].reverse()) if (session.taskId && session.taskEstimateMinutesSnapshot) estimateSnapshotByTask[session.taskId] ??= session.taskEstimateMinutesSnapshot
    const completedWithEstimates = tasks.filter((task) => task.status === 'completed' && (estimateSnapshotByTask[task.id] ?? task.estimatedMinutes) && (taskTotals[task.id] ?? 0) > 0)
    const estimatedSeconds = completedWithEstimates.reduce((sum, task) => sum + (estimateSnapshotByTask[task.id] ?? task.estimatedMinutes ?? 0) * 60, 0)
    const actualSeconds = completedWithEstimates.reduce((sum, task) => sum + (taskTotals[task.id] ?? 0), 0)
    const estimateVariancePercent = estimatedSeconds ? Math.round((actualSeconds / estimatedSeconds - 1) * 100) : null

    const preview = (session: (typeof sessions)[number]): FocusSessionPreview => {
      const task = session.taskId ? taskMap.get(session.taskId) : undefined
      const project = session.projectIdSnapshot ? projectMap.get(session.projectIdSnapshot) : task?.projectId ? projectMap.get(task.projectId) : undefined
      return {
        id: session.id, taskId: session.taskId, taskTitle: session.taskTitleSnapshot ?? task?.title ?? (session.source==='manual'?'Manual focus':'Focus session'),
        projectId: session.projectIdSnapshot ?? task?.projectId, projectName: session.projectNameSnapshot ?? project?.name,
        mode: session.mode, source:session.source, targetSeconds:session.targetSeconds, plannedSeconds:session.plannedSeconds,
        intention:session.intention, note:session.note, context:session.context, tags:session.tags, interruptionCount:session.interruptionCount,
        breakSeconds: session.status==='finished'?session.breakSeconds:effectiveBreakSeconds(session), phase:session.phase, cycleIndex:session.cycleIndex,
        durationSeconds: session.status === 'running' || session.status === 'paused' ? effectiveFocusSeconds(session) : session.durationSeconds,
        startedAt:session.startedAt, endedAt:session.endedAt, status:session.status,
      }
    }

    const days=localDateRange(addLocalDays(today,-13),14)
    const dailyTrend=days.map((date)=>({date,seconds:finished.filter((session)=>localDateKey(new Date(session.startedAt))===date).reduce((sum,row)=>sum+row.durationSeconds,0)}))
    const projectBreakdown=Object.entries(projectWeekSeconds).map(([id,seconds])=>({id,name:id==='__unassigned__'?'No project':projectMap.get(id)?.name??'Archived project',seconds})).sort((a,b)=>b.seconds-a.seconds)
    const taskWeek=new Map<string,number>()
    for(const session of weekSessions) if(session.taskId) taskWeek.set(session.taskId,(taskWeek.get(session.taskId)??0)+session.durationSeconds)
    const taskBreakdown=[...taskWeek.entries()].map(([id,seconds])=>({id,name:taskMap.get(id)?.title??finished.find((row)=>row.taskId===id)?.taskTitleSnapshot??'Archived task',seconds,estimateMinutes:taskMap.get(id)?.estimatedMinutes})).sort((a,b)=>b.seconds-a.seconds)
    const interruptionCount=weekSessions.reduce((sum,row)=>sum+(row.interruptionCount??0),0)
    const manualWeekSeconds=weekSessions.filter((row)=>row.source==='manual').reduce((sum,row)=>sum+row.durationSeconds,0)

    return {
      activeSession:active,
      recentSessions:finished.slice(0,20).map(preview),
      sessions:finished.map(preview),
      taskTotals, projectWeekSeconds, weekSeconds, todaySeconds, weekSessionCount:weekSessions.length, estimateVariancePercent,
      goals, templates, dailyTrend, projectBreakdown, taskBreakdown, interruptionCount, manualWeekSeconds,
      dailyGoalPercent:goals.dailyMinutes?Math.min(999,Math.round((todaySeconds/60/goals.dailyMinutes)*100)):0,
      weeklyGoalPercent:goals.weeklyMinutes?Math.min(999,Math.round((weekSeconds/60/goals.weeklyMinutes)*100)):0,
    }
  }, [today])
}
