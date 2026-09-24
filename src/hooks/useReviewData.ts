import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays, localDateKey, localDateRange } from '../domain/date'
import { habitScheduledForDate } from '../domain/habit'
import type { HabitEntryEntity, LocalDate } from '../domain/models'
import { dailyPlanRepository } from '../repositories/dailyPlanRepository'
import { focusSessionRepository } from '../repositories/focusSessionRepository'
import { habitRepository } from '../repositories/habitRepository'
import { projectRepository } from '../repositories/projectRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { focusSettingsService } from '../services/focusSettingsService'
import { taskRepository } from '../repositories/taskRepository'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import {
  buildRecommendations,
  durationMinutes,
  postponedTaskIssues,
  projectPaceStatus,
  reviewWeekBounds,
  staleTaskIssues,
  type ReviewDayMetric,
  type ReviewProjectMetric,
  type ReviewSnapshot,
} from '../features/review/reviewLogic'

function entryMap(entries: HabitEntryEntity[]) {
  return new Map(entries.map((entry) => [`${entry.habitId}:${entry.date}`, entry]))
}

export function useReviewData(today: LocalDate = localDateKey(), habitAdherence = 100) {
  return useLiveQuery(async (): Promise<ReviewSnapshot> => {
    const { weekStart, weekEnd, nextWeekStart, nextWeekEnd } = reviewWeekBounds(today)
    const pastWeekDates = localDateRange(weekStart, Math.max(1, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / 86_400_000) + 1))
    const [
      tasks, projects, timeBlocks, focusSessions, plans, habits, habitEntries, defaultCapacity, focusGoals,
    ] = await Promise.all([
      taskRepository.listRootTasks(),
      projectRepository.listActive(),
      timeBlockRepository.listAll(),
      focusSessionRepository.listAll(),
      dailyPlanRepository.listRange(weekStart, weekEnd),
      habitRepository.listActive(),
      habitRepository.listAllEntries(),
      settingsRepository.getDailyCapacityMinutes(),
      focusSettingsService.getGoals(),
    ])

    const projectMap = new Map(projects.map((project) => [project.id, project]))
    const planMap = new Map(plans.map((plan) => [plan.date, plan]))
    const habitsByEntry = entryMap(habitEntries)
    const plannedThroughToday = tasks.filter((task) => task.plannedDate && task.plannedDate >= weekStart && task.plannedDate <= today && (task.status === 'todo' || task.status === 'completed'))
    const completedPlanned = plannedThroughToday.filter((task) => task.status === 'completed')
    const completionRate = plannedThroughToday.length ? Math.round((completedPlanned.length / plannedThroughToday.length) * 100) : null

    const finishedSessions = focusSessions.filter((session) => session.status === 'finished')
    const weekSessions = finishedSessions.filter((session) => {
      const date = localDateKey(new Date(session.startedAt))
      return date >= weekStart && date <= today
    })
    const focusWeekSeconds = weekSessions.reduce((sum, session) => sum + session.durationSeconds, 0)
    const focusInterruptionCount = weekSessions.reduce((sum, session) => sum + (session.interruptionCount ?? 0), 0)
    const manualFocusSeconds = weekSessions.filter((session) => session.source === 'manual').reduce((sum, session) => sum + session.durationSeconds, 0)
    const focusGoalPercent = focusGoals.weeklyMinutes ? Math.round((focusWeekSeconds / 60 / focusGoals.weeklyMinutes) * 100) : null

    const dayMetrics: ReviewDayMetric[] = pastWeekDates.map((date) => {
      const dayTasks = tasks.filter((task) => task.plannedDate === date && (task.status === 'todo' || task.status === 'completed'))
      const taskMinutes = dayTasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)
      const habitMinutes = habits.reduce((sum, habit) => {
        if (!habit.countsTowardCapacity || habit.kind !== 'duration') return sum
        const entry = habitsByEntry.get(`${habit.id}:${date}`)
        if (entry?.status === 'skipped') return sum
        const committed = habit.schedule.type === 'times-per-week' || habit.schedule.type === 'times-per-month' ? Boolean(entry) : habitScheduledForDate(habit, date)
        return committed ? sum + habit.target : sum
      }, 0)
      const scheduledTaskMinutes = timeBlocks.filter((block) => block.kind === 'task' && localDateKey(new Date(block.start)) === date).reduce((sum, block) => sum + durationMinutes(block.start, block.end), 0)
      const focusSeconds = weekSessions.filter((session) => localDateKey(new Date(session.startedAt)) === date).reduce((sum, session) => sum + session.durationSeconds, 0)
      const capacityMinutes = planMap.get(date)?.capacityMinutes ?? defaultCapacity
      const plannedMinutes = taskMinutes + habitMinutes
      return {
        date,
        capacityMinutes,
        plannedMinutes,
        plannedTasks: dayTasks.length,
        completedTasks: dayTasks.filter((task) => task.status === 'completed').length,
        scheduledTaskMinutes,
        focusSeconds,
        overloadedByMinutes: Math.max(0, plannedMinutes - capacityMinutes),
        planStatus: planMap.get(date)?.status ?? 'draft',
      }
    })

    const scheduledWeekMinutes = dayMetrics.reduce((sum, day) => sum + day.scheduledTaskMinutes, 0)
    const actualFocusMinutes = Math.round(focusWeekSeconds / 60)
    const staleTasks = staleTaskIssues(tasks, projectMap, today)
    const postponedTasks = postponedTaskIssues(tasks, projectMap, today)
    const taskReference = (task: (typeof tasks)[number]) => ({ id: task.id, title: task.title, projectName: task.projectId ? projectMap.get(task.projectId)?.name : undefined, plannedDate: task.plannedDate, deadline: task.deadline, estimatedMinutes: task.estimatedMinutes })
    const carryoverTasks = tasks.filter((task) => task.status === 'todo' && task.plannedDate && task.plannedDate < today).sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '')).map(taskReference)
    const overdueDeadlines = tasks.filter((task) => task.status === 'todo' && task.deadline && task.deadline < today).sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '')).map(taskReference)
    const nextWeekDeadlines = tasks.filter((task) => task.status === 'todo' && task.deadline && task.deadline >= nextWeekStart && task.deadline <= nextWeekEnd).sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '')).map(taskReference)

    const focusByProject = new Map<string, number>()
    for (const session of weekSessions) {
      const key = session.projectIdSnapshot ?? '__unassigned__'
      focusByProject.set(key, (focusByProject.get(key) ?? 0) + session.durationSeconds)
    }
    const completedByProject = new Map<string, number>()
    for (const task of tasks) {
      if (task.status !== 'completed' || !task.completedAt) continue
      const date = localDateKey(new Date(task.completedAt))
      if (date < weekStart || date > today) continue
      const key = task.projectId ?? '__unassigned__'
      completedByProject.set(key, (completedByProject.get(key) ?? 0) + 1)
    }

    const projectMetrics: ReviewProjectMetric[] = projects.map((project) => {
      const focusSeconds = focusByProject.get(project.id) ?? 0
      const openTasks = tasks.filter((task) => task.projectId === project.id && (task.status === 'todo' || task.status === 'inbox')).length
      const weeklyTargetMinutes = project.type === 'academic' ? project.weeklyTargetMinutes : undefined
      const paceStatus = weeklyTargetMinutes ? projectPaceStatus(focusSeconds, weeklyTargetMinutes, today) : undefined
      return {
        projectId: project.id,
        name: project.name,
        type: project.type,
        openTasks,
        completedThisWeek: completedByProject.get(project.id) ?? 0,
        focusSeconds,
        weeklyTargetMinutes,
        targetPercent: weeklyTargetMinutes ? Math.min(999, Math.round((focusSeconds / 60 / weeklyTargetMinutes) * 100)) : undefined,
        paceStatus,
      }
    }).sort((a, b) => b.focusSeconds - a.focusSeconds || b.openTasks - a.openTasks)

    const neglectedProjects = projectMetrics.filter((project) => project.openTasks > 0 && project.focusSeconds === 0 && project.completedThisWeek === 0)
    const behindAcademicProjects = projectMetrics.filter((project) => project.type === 'academic' && project.paceStatus === 'behind')
    const overloadedDays = dayMetrics.filter((day) => day.overloadedByMinutes > 0).length

    const taskFocusTotals = new Map<string, number>()
    const estimateSnapshots = new Map<string, number>()
    for (const session of focusSessions) {
      if (session.status === 'cancelled' || !session.taskId) continue
      if (session.status === 'finished') taskFocusTotals.set(session.taskId, (taskFocusTotals.get(session.taskId) ?? 0) + session.durationSeconds)
      if (session.taskEstimateMinutesSnapshot) estimateSnapshots.set(session.taskId, session.taskEstimateMinutesSnapshot)
    }
    const calibratedTasks = tasks.filter((task) => task.status === 'completed' && (taskFocusTotals.get(task.id) ?? 0) > 0 && (estimateSnapshots.get(task.id) ?? task.estimatedMinutes))
    const estimatedSeconds = calibratedTasks.reduce((sum, task) => sum + (estimateSnapshots.get(task.id) ?? task.estimatedMinutes ?? 0) * 60, 0)
    const actualCalibratedSeconds = calibratedTasks.reduce((sum, task) => sum + (taskFocusTotals.get(task.id) ?? 0), 0)
    const estimateVariancePercent = estimatedSeconds ? Math.round((actualCalibratedSeconds / estimatedSeconds - 1) * 100) : null

    const recommendations = buildRecommendations({
      completionRate,
      overloadedDays,
      staleCount: staleTasks.length,
      postponedCount: postponedTasks.length,
      scheduledMinutes: scheduledWeekMinutes,
      actualFocusMinutes,
      behindAcademicProjects: behindAcademicProjects.length,
      overdueDeadlines: overdueDeadlines.length,
    })

    return {
      today,
      weekStart,
      weekEnd,
      nextWeekStart,
      nextWeekEnd,
      completionRate,
      plannedThroughTodayCount: plannedThroughToday.length,
      completedPlannedCount: completedPlanned.length,
      focusWeekSeconds,
      focusSessionCount: weekSessions.length,
      focusInterruptionCount,
      manualFocusSeconds,
      focusGoalPercent,
      scheduledWeekMinutes,
      scheduleExecutionPercent: scheduledWeekMinutes ? Math.round((actualFocusMinutes / scheduledWeekMinutes) * 100) : null,
      estimateVariancePercent,
      habitAdherence,
      overloadedDays,
      committedDays: dayMetrics.filter((day) => day.planStatus === 'committed').length,
      dayMetrics,
      staleTasks,
      postponedTasks,
      carryoverTasks,
      overdueDeadlines,
      nextWeekDeadlines,
      projectMetrics,
      neglectedProjects,
      behindAcademicProjects,
      recommendations,
    }
  }, [today, habitAdherence])
}
