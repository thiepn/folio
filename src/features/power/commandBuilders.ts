import type { HabitPreview, TaskPreview } from '../../types/ui'
import type { PowerCommand } from './CommandPalette'

export interface ProjectCommandPreview {
  id: string
  name: string
  description?: string
  type?: string
  openTaskCount?: number
  completedTaskCount?: number
  deadline?: string
}

type CommandRun<T> = (item: T) => void | Promise<void>

export function buildTaskCommandChildren(prefix: string, tasks: TaskPreview[], run: CommandRun<TaskPreview>): PowerCommand[] {
  return tasks.map((task) => ({
    id: `${prefix}-${task.id}`,
    group: 'Task',
    label: task.title,
    note: [task.project ?? 'No project', task.plannedDate ? `Planned ${task.plannedDate}` : '', task.deadline ? `Due ${task.deadline}` : ''].filter(Boolean).join(' · '),
    keywords: `${task.description ?? ''} ${task.project ?? ''} ${task.priority} ${task.status} ${task.planningBucket ?? ''} ${task.deadline ?? ''} ${task.plannedDate ?? ''}`,
    run: () => run(task),
  }))
}

export function buildProjectCommandChildren(prefix: string, projects: ProjectCommandPreview[], run: CommandRun<ProjectCommandPreview>): PowerCommand[] {
  return projects.map((project) => ({
    id: `${prefix}-${project.id}`,
    group: 'Project',
    label: project.name,
    note: [typeof project.openTaskCount === 'number' ? `${project.openTaskCount} open` : '', project.deadline ? `Due ${project.deadline}` : ''].filter(Boolean).join(' · '),
    keywords: `${project.description ?? ''} ${project.type ?? ''} ${project.deadline ?? ''}`,
    run: () => run(project),
  }))
}

export function buildHabitCommandChildren(prefix: string, habits: HabitPreview[], run: CommandRun<HabitPreview>): PowerCommand[] {
  return habits.map((habit) => ({
    id: `${prefix}-${habit.id}`,
    group: 'Habit',
    label: habit.title,
    note: [habit.scheduleLabel ?? '', habit.pauseLabel ?? '', habit.progress ?? '', `${habit.streak ?? 0} streak`].filter(Boolean).join(' · '),
    keywords: `${habit.description ?? ''} ${habit.scheduleLabel ?? ''} ${habit.paused ? 'paused' : ''}`,
    run: () => run(habit),
  }))
}
