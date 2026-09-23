import { db } from '../db/database'
import { noteRepository, type NoteCreateInput, type NoteUpdateInput } from '../repositories/noteRepository'
import { taskRepository } from '../repositories/taskRepository'
import { attachmentService } from './attachmentService'

export const noteService = {
  create(input: NoteCreateInput) { return noteRepository.create(input) },
  update(id: string, input: NoteUpdateInput) { return noteRepository.update(id, input) },
  archive(id: string, archived = true) { return noteRepository.update(id, { archived }) },

  async createFromTask(taskId: string) {
    const task = await taskRepository.get(taskId)
    if (!task) throw new Error('Task not found.')
    const note = await noteRepository.create({ title: task.title, body: task.description, sourceTaskId: task.id })
    await attachmentService.cloneOwner('task', task.id, 'note', note.id)
    return note
  },

  async createTaskFromNote(noteId: string) {
    const note = await noteRepository.get(noteId)
    if (!note) throw new Error('Note not found.')
    const task = await taskRepository.create({ title: note.title, description: note.body, status: 'inbox', tags: [], tagIds: [] })
    await attachmentService.cloneOwner('note', note.id, 'task', task.id)
    if (!note.sourceTaskId) await noteRepository.update(note.id, { sourceTaskId: task.id })
    return task
  },

  async deletePermanently(id: string) { await noteRepository.removePermanently(id) },

  async restoreSourceTask(noteId: string) {
    const note = await noteRepository.get(noteId)
    if (!note?.sourceTaskId) return undefined
    return db.tasks.get(note.sourceTaskId)
  },
}
