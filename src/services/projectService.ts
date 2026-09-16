import { db } from '../db/database'
import type { ProjectCreateInput, ProjectUpdateInput } from '../repositories/projectRepository'
import { projectRepository } from '../repositories/projectRepository'
import type { UndoableMutation } from './undo'

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
