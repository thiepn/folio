import { db } from '../db/database'
import { noteCreateSchema, noteUpdateSchema } from '../domain/schemas'
import type { z } from 'zod'
import type { NoteEntity } from '../domain/models'
import { contentSearchService } from '../services/contentSearchService'

export type NoteCreateInput = z.input<typeof noteCreateSchema>
export type NoteUpdateInput = z.input<typeof noteUpdateSchema>

export const noteRepository = {
  async listAll(includeArchived = false) {
    const notes = await db.notes.toArray()
    return notes.filter((note) => includeArchived || !note.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id: string) { return db.notes.get(id) },

  async create(input: NoteCreateInput): Promise<NoteEntity> {
    const parsed = noteCreateSchema.parse(input)
    const now = new Date().toISOString()
    const note: NoteEntity = { id: crypto.randomUUID(), title: parsed.title, body: parsed.body, sourceTaskId: parsed.sourceTaskId, archived: false, createdAt: now, updatedAt: now }
    await db.notes.add(note)
    await contentSearchService.indexNote(note)
    return note
  },

  async update(id: string, input: NoteUpdateInput): Promise<NoteEntity> {
    const parsed = noteUpdateSchema.parse(input)
    const current = await db.notes.get(id)
    if (!current) throw new Error('Note not found.')
    const normalized = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === null ? undefined : value])) as Partial<NoteEntity>
    const now = new Date().toISOString()
    const next: NoteEntity = {
      ...current, ...normalized,
      archivedAt: parsed.archived === true ? now : parsed.archived === false ? undefined : current.archivedAt,
      updatedAt: now,
    }
    await db.notes.put(next)
    await contentSearchService.indexNote(next)
    return next
  },

  async removePermanently(id: string) {
    await db.transaction('rw', db.notes, db.attachments, db.searchDocuments, async () => {
      await db.notes.delete(id)
      const attachments = await db.attachments.where('[ownerType+ownerId]').equals(['note', id]).primaryKeys()
      if (attachments.length) await db.attachments.bulkDelete(attachments as string[])
      await db.searchDocuments.delete(`note:${id}`)
    })
  },
}
