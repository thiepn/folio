import { db } from '../db/database'
import type { ProjectActivityEntry, ProjectMilestone } from '../domain/models'
import type { ProjectCreateInput, ProjectUpdateInput } from '../repositories/projectRepository'
import { projectRepository } from '../repositories/projectRepository'
import type { UndoableMutation } from './undo'

function activity(label: string, kind: ProjectActivityEntry['kind'] = 'project'): ProjectActivityEntry {
  return { id: crypto.randomUUID(), kind, label, at: new Date().toISOString() }
}

export const projectService = {
  create(input: ProjectCreateInput) {
    return projectRepository.create(input)
  },

  async update(id: string, input: ProjectUpdateInput): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    await projectRepository.update(id, input)
    return { message: 'Project updated', undo: async () => projectRepository.replace(previous) }
  },

  async setNextAction(id: string, taskId?: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    if (taskId) {
      const task = await db.tasks.get(taskId)
      if (!task || task.deletedAt || task.projectId !== id || task.parentTaskId || task.status !== 'todo') throw new Error('Next action must be an open root task in this project.')
    }
    await projectRepository.update(id, { nextActionTaskId: taskId ?? null })
    return { message: taskId ? 'Project next action set' : 'Project next action cleared', undo: async () => projectRepository.replace(previous) }
  },

  async addMilestone(id: string, title: string, dueDate?: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    const cleanTitle = title.trim()
    if (!cleanTitle) throw new Error('Milestone title is required.')
    const now = new Date().toISOString()
    const milestone: ProjectMilestone = {
      id: crypto.randomUUID(),
      title: cleanTitle.slice(0, 180),
      dueDate: dueDate || undefined,
      sortOrder: previous.milestones.length ? Math.max(...previous.milestones.map((item) => item.sortOrder)) + 1 : 0,
      createdAt: now,
      updatedAt: now,
    }
    await projectRepository.replaceWithMilestones(id, [...previous.milestones, milestone], activity(`Milestone added · ${milestone.title}`, 'milestone'))
    return { message: 'Milestone added', undo: async () => projectRepository.replace(previous) }
  },

  async toggleMilestone(id: string, milestoneId: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    const current = previous.milestones.find((item) => item.id === milestoneId)
    if (!current) throw new Error('Milestone not found.')
    const now = new Date().toISOString()
    const completing = !current.completedAt
    const milestones = previous.milestones.map((item) => item.id === milestoneId ? { ...item, completedAt: completing ? now : undefined, updatedAt: now } : item)
    await projectRepository.replaceWithMilestones(id, milestones, activity(`${completing ? 'Milestone completed' : 'Milestone reopened'} · ${current.title}`, 'milestone'))
    return { message: completing ? 'Milestone completed' : 'Milestone reopened', undo: async () => projectRepository.replace(previous) }
  },

  async removeMilestone(id: string, milestoneId: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    const current = previous.milestones.find((item) => item.id === milestoneId)
    if (!current) throw new Error('Milestone not found.')
    await projectRepository.replaceWithMilestones(id, previous.milestones.filter((item) => item.id !== milestoneId), activity(`Milestone removed · ${current.title}`, 'milestone'))
    return { message: 'Milestone removed', undo: async () => projectRepository.replace(previous) }
  },

  async toggleFavorite(id: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    await projectRepository.update(id, { favorite: !previous.favorite })
    return { message: previous.favorite ? 'Removed from favorites' : 'Added to favorites', undo: async () => projectRepository.replace(previous) }
  },

  async archive(id: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    await projectRepository.update(id, { archived: true, favorite: false })
    return { message: 'Project archived', undo: async () => projectRepository.replace(previous) }
  },

  async restore(id: string): Promise<UndoableMutation> {
    const previous = await projectRepository.get(id)
    if (!previous) throw new Error('Project not found.')
    await projectRepository.update(id, { archived: false })
    return { message: 'Project restored', undo: async () => projectRepository.replace(previous) }
  },

  async moveTasks(sourceProjectId: string, targetProjectId?: string): Promise<UndoableMutation> {
    const tasks = (await db.tasks.where('projectId').equals(sourceProjectId).toArray()).filter((task) => !task.deletedAt)
    const previous = tasks.map((task) => ({ ...task }))
    const now = new Date().toISOString()
    await db.transaction('rw', db.tasks, async () => {
      await Promise.all(tasks.map((task) => db.tasks.update(task.id, { projectId: targetProjectId, updatedAt: now })))
    })
    return {
      message: `${tasks.filter((task) => !task.parentTaskId).length} tasks moved`,
      undo: async () => { if (previous.length) await db.tasks.bulkPut(previous) },
    }
  },
}
