import { db } from '../db/database'
import type { ContentOwnerType, NoteEntity, SearchDocumentEntity, TaskEntity } from '../domain/models'

export interface ContentSearchHit {
  ownerType: ContentOwnerType
  ownerId: string
  title: string
  snippet: string
  updatedAt: string
}

export function markdownToSearchText(value: string) {
  return value
    .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, (block) => block.replace(/\x60/g, ' '))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
    .replace(/[*_~#>\x60]/g, ' ')
    .replace(/\[(?: |x|X)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalized(value: string) { return value.toLocaleLowerCase().normalize('NFKC') }

async function attachmentText(ownerType: ContentOwnerType, ownerId: string) {
  const attachments = await db.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()
  return attachments.map((item) => [item.name, item.mimeType ?? '', item.url ?? ''].join(' ')).join(' ')
}

async function taskDocument(task: TaskEntity): Promise<SearchDocumentEntity> {
  const attachments = await attachmentText('task', task.id)
  return {
    id: 'task:' + task.id, ownerType: 'task', ownerId: task.id,
    text: markdownToSearchText([task.title, task.description, task.location ?? '', task.sourceUrl ?? '', ...(task.tags ?? []), ...(task.comments ?? []).map((comment) => comment.body), attachments].join(' ')),
    updatedAt: task.updatedAt,
  }
}

async function noteDocument(note: NoteEntity): Promise<SearchDocumentEntity> {
  const attachments = await attachmentText('note', note.id)
  return {
    id: 'note:' + note.id, ownerType: 'note', ownerId: note.id,
    text: markdownToSearchText([note.title, note.body, attachments].join(' ')),
    updatedAt: note.updatedAt,
  }
}

export const contentSearchService = {
  async indexTask(task: TaskEntity) {
    if (task.deletedAt || task.status === 'cancelled') { await db.searchDocuments.delete('task:' + task.id); return }
    await db.searchDocuments.put(await taskDocument(task))
  },

  async indexNote(note: NoteEntity) {
    if (note.archived) { await db.searchDocuments.delete('note:' + note.id); return }
    await db.searchDocuments.put(await noteDocument(note))
  },

  async remove(ownerType: ContentOwnerType, ownerId: string) {
    await db.searchDocuments.delete(ownerType + ':' + ownerId)
  },

  async rebuildOwner(ownerType: ContentOwnerType, ownerId: string) {
    if (ownerType === 'task') {
      const task = await db.tasks.get(ownerId)
      if (task) return this.indexTask(task)
    } else {
      const note = await db.notes.get(ownerId)
      if (note) return this.indexNote(note)
    }
    await this.remove(ownerType, ownerId)
  },

  async rebuildAll() {
    const [tasks, notes] = await Promise.all([db.tasks.toArray(), db.notes.toArray()])
    await db.searchDocuments.clear()
    for (const task of tasks) await this.indexTask(task)
    for (const note of notes) await this.indexNote(note)
  },

  async search(query: string, limit = 80): Promise<ContentSearchHit[]> {
    const tokens = normalized(query).split(/\s+/).filter(Boolean)
    if (!tokens.length) return []
    const documents = await db.searchDocuments.toArray()
    const matches = documents
      .map((document) => ({ document, haystack: normalized(document.text) }))
      .filter(({ haystack }) => tokens.every((token) => haystack.includes(token)))
      .sort((a, b) => b.document.updatedAt.localeCompare(a.document.updatedAt))
      .slice(0, limit)
    const hits: ContentSearchHit[] = []
    for (const { document } of matches) {
      if (document.ownerType === 'task') {
        const task = await db.tasks.get(document.ownerId)
        if (!task || task.deletedAt || task.status === 'cancelled') continue
        hits.push({ ownerType: 'task', ownerId: task.id, title: task.title, snippet: markdownToSearchText(task.description).slice(0, 180), updatedAt: task.updatedAt })
      } else {
        const note = await db.notes.get(document.ownerId)
        if (!note || note.archived) continue
        hits.push({ ownerType: 'note', ownerId: note.id, title: note.title, snippet: markdownToSearchText(note.body).slice(0, 180), updatedAt: note.updatedAt })
      }
    }
    return hits
  },
}
