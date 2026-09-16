import { db } from './database'
import { addLocalDays, atLocalTime, localDateKey } from '../domain/date'
import type { DailyPlanEntity, DailyPlanItemEntity, HabitEntity, ProjectEntity, TaskEntity, TimeBlockEntity } from '../domain/models'

const SEED_VERSION = 3
const SEED_SETTING = 'system.seedVersion'

export async function seedDatabaseIfNeeded() {
  const seeded = await db.settings.get(SEED_SETTING)
  if (seeded) return

  const now = new Date().toISOString()
  await db.settings.bulkPut([
    { key: 'planner.dailyCapacityMinutes', value: 300, updatedAt: now },
    { key: SEED_SETTING, value: SEED_VERSION, updatedAt: now },
  ])
}

export async function installDemoWorkspace() {
  const entityCounts = await Promise.all([
    db.tasks.count(), db.projects.count(), db.habits.count(), db.habitEntries.count(), db.timeBlocks.count(),
    db.dailyPlans.count(), db.dailyPlanItems.count(), db.focusSessions.count(), db.recurringSeries.count(),
  ])
  if (entityCounts.some(Boolean)) {
    throw new Error('Demo workspace can only be loaded into an empty workspace.')
  }

  const now = new Date().toISOString()
  const today = localDateKey()
  const tomorrow = addLocalDays(today, 1)
  const later = addLocalDays(today, 4)

  const projects: ProjectEntity[] = [
    { id: 'project-analysis', name: 'Analysis III', description: 'Coursework, assignments and exam preparation.', color: '#4169FF', icon: '∑', type: 'academic', archived: false, favorite: true, examDate: addLocalDays(today, 176), weeklyTargetMinutes: 300, createdAt: now, updatedAt: now },
    { id: 'project-french', name: 'French', description: 'Language study and recurring review.', color: '#D8A54A', icon: 'FR', type: 'academic', archived: false, favorite: false, weeklyTargetMinutes: 210, createdAt: now, updatedAt: now },
    { id: 'project-website', name: 'Website', description: 'Personal web projects and development.', color: '#7657FF', icon: '<>', type: 'standard', archived: false, favorite: true, createdAt: now, updatedAt: now },
    { id: 'project-personal', name: 'Personal', description: 'Personal administration and daily-life tasks.', color: '#3AB58A', icon: '•', type: 'standard', archived: false, favorite: false, createdAt: now, updatedAt: now },
  ]

  const task = (partial: Partial<TaskEntity> & Pick<TaskEntity, 'id' | 'title'>): TaskEntity => ({
    description: '', priority: 'normal', status: 'todo', blockedByTaskIds: [], sortOrder: Date.now(), rescheduleCount: 0, createdAt: now, updatedAt: now, ...partial,
  })

  const tasks: TaskEntity[] = [
    task({ id: 'task-analysis-sheet', title: 'Analysis Sheet 6', projectId: 'project-analysis', priority: 'high', plannedDate: today, deadline: tomorrow, estimatedMinutes: 90, sortOrder: 10 }),
    task({ id: 'task-registration', title: 'Submit registration', projectId: 'project-personal', priority: 'critical', plannedDate: today, deadline: today, estimatedMinutes: 10, sortOrder: 20 }),
    task({ id: 'task-french-review', title: 'French review', projectId: 'project-french', plannedDate: today, estimatedMinutes: 30, sortOrder: 30 }),
    task({ id: 'task-website', title: 'Website iteration', projectId: 'project-website', plannedDate: today, estimatedMinutes: 45, sortOrder: 40 }),
    task({ id: 'task-gym', title: 'Gym', projectId: 'project-personal', plannedDate: today, estimatedMinutes: 90, sortOrder: 50 }),
    task({ id: 'task-lecture-notes', title: 'Read lecture notes', projectId: 'project-analysis', plannedDate: tomorrow, deadline: addLocalDays(today, 3), estimatedMinutes: 60, sortOrder: 60 }),
    task({ id: 'task-french-assignment', title: 'French assignment', projectId: 'project-french', plannedDate: later, estimatedMinutes: 45, sortOrder: 70 }),
    task({ id: 'task-groceries', title: 'Buy groceries', status: 'inbox', estimatedMinutes: 20, sortOrder: 80 }),
    task({ id: 'task-appointment', title: 'Book appointment', status: 'inbox', estimatedMinutes: 10, sortOrder: 90 }),
    task({ id: 'task-saved-idea', title: 'Review saved website idea', status: 'inbox', estimatedMinutes: 15, sortOrder: 100 }),
  ]

  const habits: HabitEntity[] = [
    { id: 'habit-bible', title: 'Bible reading', description: 'Daily reading rhythm.', kind: 'check', target: 1, schedule: { type: 'daily' }, countsTowardCapacity: false, archived: false, sortOrder: 10, createdAt: now, updatedAt: now },
    { id: 'habit-french', title: 'French habit', description: 'Keep daily exposure small and consistent.', kind: 'duration', target: 20, schedule: { type: 'daily' }, countsTowardCapacity: true, archived: false, sortOrder: 20, createdAt: now, updatedAt: now },
    { id: 'habit-workout', title: 'Workout', description: 'Strength training days.', kind: 'check', target: 1, schedule: { type: 'selected-days', weekdays: [1, 3, 5] }, countsTowardCapacity: false, archived: false, sortOrder: 30, createdAt: now, updatedAt: now },
  ]

  const timeBlocks: TimeBlockEntity[] = [
    { id: 'block-lecture', title: 'Lecture', kind: 'event', start: atLocalTime(today, 9), end: atLocalTime(today, 10, 30), createdAt: now, updatedAt: now },
    { id: 'block-lunch', title: 'Lunch', kind: 'event', start: atLocalTime(today, 12), end: atLocalTime(today, 12, 45), createdAt: now, updatedAt: now },
    { id: 'block-analysis', taskId: 'task-analysis-sheet', title: 'Analysis Sheet 6', kind: 'task', start: atLocalTime(today, 14), end: atLocalTime(today, 15, 30), createdAt: now, updatedAt: now },
    { id: 'block-gym', taskId: 'task-gym', title: 'Gym', kind: 'task', start: atLocalTime(today, 18), end: atLocalTime(today, 19, 30), createdAt: now, updatedAt: now },
  ]

  const dailyPlans: DailyPlanEntity[] = [
    { date: today, status: 'draft', createdAt: now, updatedAt: now },
    { date: tomorrow, status: 'draft', createdAt: now, updatedAt: now },
  ]
  const dailyPlanItems: DailyPlanItemEntity[] = tasks.filter((item) => item.plannedDate).map((item) => ({
    id: `${item.plannedDate}:${item.id}`,
    date: item.plannedDate!,
    taskId: item.id,
    bucket: item.priority === 'critical' || item.priority === 'high' ? 'must' : 'planned',
    sortOrder: item.sortOrder,
    createdAt: now,
    updatedAt: now,
  }))

  await db.transaction('rw', db.tasks, db.projects, db.habits, db.habitEntries, db.timeBlocks, db.dailyPlans, db.dailyPlanItems, db.settings, async () => {
    await db.projects.bulkPut(projects)
    await db.tasks.bulkPut(tasks)
    await db.habits.bulkPut(habits)
    await db.habitEntries.put({ id: `habit-bible:${today}`, habitId: 'habit-bible', date: today, value: 1, status: 'completed', completedAt: now, updatedAt: now })
    await db.timeBlocks.bulkPut(timeBlocks)
    await db.dailyPlans.bulkPut(dailyPlans)
    await db.dailyPlanItems.bulkPut(dailyPlanItems)
    await db.settings.bulkPut([
      { key: 'planner.dailyCapacityMinutes', value: 300, updatedAt: now },
      { key: SEED_SETTING, value: SEED_VERSION, updatedAt: now },
    ])
  })
}
