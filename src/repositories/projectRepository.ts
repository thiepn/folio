import { db } from '../db/database'
import { projectCreateSchema, projectUpdateSchema } from '../domain/schemas'
import type { ProjectActivityEntry, ProjectEntity, ProjectMilestone, TaskEntity } from '../domain/models'
import type { z } from 'zod'

export type ProjectCreateInput = z.input<typeof projectCreateSchema>
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>

export interface ProjectSummary extends ProjectEntity {
  openTaskCount: number
  completedTaskCount: number
  nextDeadline?: string
  progressPercent: number
  nextActionTitle?: string
  milestoneCompleteCount: number
  milestoneTotal: number
}

function byName(a: ProjectEntity, b: ProjectEntity) {
  return a.name.localeCompare(b.name)
}

function normalizeProject(project: ProjectEntity): ProjectEntity {
  return {
    ...project,
    status: project.status ?? 'active',
    notes: project.notes ?? '',
    milestones: project.milestones ?? [],
    activity: project.activity ?? [],
  }
}

function activity(label: string, kind: ProjectActivityEntry['kind'] = 'project'): ProjectActivityEntry {
  return { id: crypto.randomUUID(), kind, label, at: new Date().toISOString() }
}

function appendActivity(entries: ProjectActivityEntry[], entry: ProjectActivityEntry) {
  return [...entries, entry].slice(-120)
}

function taskReady(task: TaskEntity, taskMap: Map<string, TaskEntity>) {
  return (task.blockedByTaskIds ?? []).every((id) => taskMap.get(id)?.status === 'completed')
}

function nextTaskForProject(project: ProjectEntity, tasks: TaskEntity[]) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const eligible = tasks.filter((task) => task.projectId === project.id && !task.parentTaskId && !task.deletedAt && task.status === 'todo')
  const explicit = project.nextActionTaskId ? eligible.find((task) => task.id === project.nextActionTaskId) : undefined
  if (explicit) return explicit
  return eligible
    .filter((task) => taskReady(task, taskMap))
    .sort((a, b) => {
      const planned = (a.plannedDate ?? '9999-99-99').localeCompare(b.plannedDate ?? '9999-99-99')
      if (planned) return planned
      const deadline = (a.deadline ?? '9999-99-99').localeCompare(b.deadline ?? '9999-99-99')
      if (deadline) return deadline
      const priority = { critical: 0, high: 1, normal: 2 }
      return priority[a.priority] - priority[b.priority] || a.sortOrder - b.sortOrder
    })[0]
}

export function buildProjectSummaries(projects: ProjectEntity[], tasks: TaskEntity[], includeArchived = false): ProjectSummary[] {
  const stats = new Map<string, { open: number; completed: number; nextDeadline?: string }>()
  for (const task of tasks) {
    if (!task.projectId || task.parentTaskId || task.deletedAt) continue
    const current = stats.get(task.projectId) ?? { open: 0, completed: 0, nextDeadline: undefined }
    if (task.status === 'todo' || task.status === 'inbox') current.open += 1
    else if (task.status === 'completed') current.completed += 1
    if (task.status !== 'completed' && task.status !== 'cancelled' && task.deadline && (!current.nextDeadline || task.deadline < current.nextDeadline)) current.nextDeadline = task.deadline
    stats.set(task.projectId, current)
  }

  return projects
    .map(normalizeProject)
    .filter((project) => includeArchived || !project.archived)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || byName(a, b))
    .map((project) => {
      const summary = stats.get(project.id) ?? { open: 0, completed: 0, nextDeadline: undefined }
      const total = summary.open + summary.completed
      const nextAction = nextTaskForProject(project, tasks)
      const milestoneCompleteCount = project.milestones.filter((milestone) => Boolean(milestone.completedAt)).length
      return {
        ...project,
        openTaskCount: summary.open,
        completedTaskCount: summary.completed,
        nextDeadline: summary.nextDeadline,
        progressPercent: total ? Math.round((summary.completed / total) * 100) : 0,
        nextActionTitle: nextAction?.title,
        nextActionTaskId: nextAction?.id ?? project.nextActionTaskId,
        milestoneCompleteCount,
        milestoneTotal: project.milestones.length,
      }
    })
}

export const projectRepository = {
  async listAll(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).map(normalizeProject).sort(byName)
  },

  async listActive(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).map(normalizeProject).filter((project) => !project.archived).sort(byName)
  },

  async listArchived(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).map(normalizeProject).filter((project) => project.archived).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '') || byName(a, b))
  },

  async listSummaries(includeArchived = false): Promise<ProjectSummary[]> {
    const [projects, tasks] = await Promise.all([db.projects.toArray(), db.tasks.toArray()])
    return buildProjectSummaries(projects, tasks, includeArchived)
  },

  async get(id: string): Promise<ProjectEntity | undefined> {
    const project = await db.projects.get(id)
    return project ? normalizeProject(project) : undefined
  },

  async create(input: ProjectCreateInput): Promise<ProjectEntity> {
    const parsed = projectCreateSchema.parse(input)
    const now = new Date().toISOString()
    const project: ProjectEntity = {
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      notes: parsed.notes,
      color: parsed.color,
      icon: parsed.icon,
      type: parsed.type,
      status: parsed.status,
      deadline: parsed.deadline,
      archived: false,
      favorite: parsed.favorite,
      examDate: parsed.type === 'academic' ? parsed.examDate : undefined,
      weeklyTargetMinutes: parsed.type === 'academic' ? parsed.weeklyTargetMinutes : undefined,
      milestones: [],
      activity: [{ id: crypto.randomUUID(), kind: 'project', label: 'Project created', at: now }],
      completedAt: parsed.status === 'completed' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(project)
    return project
  },

  async update(id: string, input: ProjectUpdateInput): Promise<ProjectEntity> {
    const parsed = projectUpdateSchema.parse(input)
    const currentRaw = await db.projects.get(id)
    if (!currentRaw) throw new Error('Project not found.')
    const current = normalizeProject(currentRaw)
    const nextType = parsed.type ?? current.type
    const examProvided = Object.prototype.hasOwnProperty.call(parsed, 'examDate')
    const targetProvided = Object.prototype.hasOwnProperty.call(parsed, 'weeklyTargetMinutes')
    const deadlineProvided = Object.prototype.hasOwnProperty.call(parsed, 'deadline')
    const nextActionProvided = Object.prototype.hasOwnProperty.call(parsed, 'nextActionTaskId')
    const nextStatus = parsed.status ?? current.status
    let nextActivity = current.activity

    if (parsed.status && parsed.status !== current.status) nextActivity = appendActivity(nextActivity, activity(`Status changed to ${parsed.status.replace('-', ' ')}`))
    if (deadlineProvided && (parsed.deadline ?? undefined) !== current.deadline) nextActivity = appendActivity(nextActivity, activity(parsed.deadline ? `Project deadline set to ${parsed.deadline}` : 'Project deadline cleared'))
    if (nextActionProvided && (parsed.nextActionTaskId ?? undefined) !== current.nextActionTaskId) nextActivity = appendActivity(nextActivity, activity(parsed.nextActionTaskId ? 'Next action changed' : 'Next action cleared'))

    const now = new Date().toISOString()
    const next: ProjectEntity = {
      ...current,
      ...parsed,
      notes: parsed.notes ?? current.notes,
      deadline: deadlineProvided ? (parsed.deadline ?? undefined) : current.deadline,
      nextActionTaskId: nextActionProvided ? (parsed.nextActionTaskId ?? undefined) : current.nextActionTaskId,
      examDate: nextType === 'academic' ? (examProvided ? (parsed.examDate ?? undefined) : current.examDate) : undefined,
      weeklyTargetMinutes: nextType === 'academic' ? (targetProvided ? (parsed.weeklyTargetMinutes ?? undefined) : current.weeklyTargetMinutes) : undefined,
      archivedAt: parsed.archived === true ? (current.archivedAt ?? now) : parsed.archived === false ? undefined : current.archivedAt,
      completedAt: nextStatus === 'completed' ? (current.completedAt ?? now) : undefined,
      activity: nextActivity,
      updatedAt: now,
    }
    await db.projects.put(next)
    return next
  },

  async replace(project: ProjectEntity): Promise<void> {
    await db.projects.put(normalizeProject(project))
  },

  async replaceWithMilestones(id: string, milestones: ProjectMilestone[], entry: ProjectActivityEntry): Promise<ProjectEntity> {
    const current = await this.get(id)
    if (!current) throw new Error('Project not found.')
    const next = { ...current, milestones, activity: appendActivity(current.activity, entry), updatedAt: new Date().toISOString() }
    await db.projects.put(next)
    return next
  },

  async getMap(): Promise<Map<string, ProjectEntity>> {
    return new Map((await db.projects.toArray()).map(normalizeProject).map((project) => [project.id, project]))
  },
}
