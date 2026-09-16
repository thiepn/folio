import { db } from '../db/database'
import { projectCreateSchema, projectUpdateSchema } from '../domain/schemas'
import type { ProjectEntity } from '../domain/models'
import type { z } from 'zod'

export type ProjectCreateInput = z.input<typeof projectCreateSchema>
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>

export interface ProjectSummary extends ProjectEntity {
  openTaskCount: number
  completedTaskCount: number
  nextDeadline?: string
}

function byName(a: ProjectEntity, b: ProjectEntity) {
  return a.name.localeCompare(b.name)
}

export function buildProjectSummaries(projects: ProjectEntity[], tasks: import('../domain/models').TaskEntity[], includeArchived = false): ProjectSummary[] {
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
    .filter((project) => includeArchived || !project.archived)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || byName(a, b))
    .map((project) => {
      const summary = stats.get(project.id) ?? { open: 0, completed: 0, nextDeadline: undefined }
      return { ...project, openTaskCount: summary.open, completedTaskCount: summary.completed, nextDeadline: summary.nextDeadline }
    })
}

export const projectRepository = {
  async listAll(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).sort(byName)
  },

  async listActive(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).filter((project) => !project.archived).sort(byName)
  },

  async listArchived(): Promise<ProjectEntity[]> {
    return (await db.projects.toArray()).filter((project) => project.archived).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '') || byName(a, b))
  },

  async listSummaries(includeArchived = false): Promise<ProjectSummary[]> {
    const [projects, tasks] = await Promise.all([db.projects.toArray(), db.tasks.toArray()])
    return buildProjectSummaries(projects, tasks, includeArchived)
  },

  async get(id: string): Promise<ProjectEntity | undefined> {
    return db.projects.get(id)
  },

  async create(input: ProjectCreateInput): Promise<ProjectEntity> {
    const parsed = projectCreateSchema.parse(input)
    const now = new Date().toISOString()
    const project: ProjectEntity = {
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      color: parsed.color,
      icon: parsed.icon,
      type: parsed.type,
      archived: false,
      favorite: parsed.favorite,
      examDate: parsed.type === 'academic' ? parsed.examDate : undefined,
      weeklyTargetMinutes: parsed.type === 'academic' ? parsed.weeklyTargetMinutes : undefined,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(project)
    return project
  },

  async update(id: string, input: ProjectUpdateInput): Promise<ProjectEntity> {
    const parsed = projectUpdateSchema.parse(input)
    const current = await db.projects.get(id)
    if (!current) throw new Error('Project not found.')
    const nextType = parsed.type ?? current.type
    const examProvided = Object.prototype.hasOwnProperty.call(parsed, 'examDate')
    const targetProvided = Object.prototype.hasOwnProperty.call(parsed, 'weeklyTargetMinutes')
    const next: ProjectEntity = {
      ...current,
      ...parsed,
      examDate: nextType === 'academic' ? (examProvided ? (parsed.examDate ?? undefined) : current.examDate) : undefined,
      weeklyTargetMinutes: nextType === 'academic' ? (targetProvided ? (parsed.weeklyTargetMinutes ?? undefined) : current.weeklyTargetMinutes) : undefined,
      archivedAt: parsed.archived === true ? (current.archivedAt ?? new Date().toISOString()) : parsed.archived === false ? undefined : current.archivedAt,
      updatedAt: new Date().toISOString(),
    }
    await db.projects.put(next)
    return next
  },

  async replace(project: ProjectEntity): Promise<void> {
    await db.projects.put(project)
  },

  async getMap(): Promise<Map<string, ProjectEntity>> {
    return new Map((await db.projects.toArray()).map((project) => [project.id, project]))
  },
}
