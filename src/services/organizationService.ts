import { db } from '../db/database'
import type { FolderEntity, ListEntity, SectionEntity, TagEntity } from '../domain/models'
import {
  organizationRepository,
  type FolderCreateInput, type FolderUpdateInput,
  type ListCreateInput, type ListUpdateInput,
  type SectionCreateInput, type SectionUpdateInput,
  type TagCreateInput, type TagUpdateInput,
} from '../repositories/organizationRepository'
import { taskRepository } from '../repositories/taskRepository'
import type { UndoableMutation } from './undo'

function now() { return new Date().toISOString() }

async function assertTagParent(id: string, parentTagId?: string) {
  if (!parentTagId) return
  if (parentTagId === id) throw new Error('A tag cannot be its own parent.')
  const all = await organizationRepository.listTags(true)
  const parentMap = new Map(all.map((tag) => [tag.id, tag.parentTagId]))
  let cursor: string | undefined = parentTagId
  const seen = new Set<string>([id])
  while (cursor) {
    if (seen.has(cursor)) throw new Error('Tag nesting cannot contain a cycle.')
    seen.add(cursor)
    cursor = parentMap.get(cursor)
  }
}

export const organizationService = {
  async createFolder(input: FolderCreateInput): Promise<{ folder: FolderEntity; undo: UndoableMutation }> {
    const folder = await organizationRepository.createFolder(input)
    return { folder, undo: { message: 'Folder created', undo: async () => { await db.folders.delete(folder.id) } } }
  },

  async updateFolder(id: string, input: FolderUpdateInput): Promise<UndoableMutation> {
    const before = await organizationRepository.getFolder(id)
    if (!before) throw new Error('Folder not found.')
    const childLists = input.archived === true && !before.archived
      ? (await db.lists.where('folderId').equals(id).toArray()).map((list) => ({ ...list }))
      : []
    await db.transaction('rw', db.folders, db.lists, async () => {
      await organizationRepository.updateFolder(id, input)
      if (input.archived === true && !before.archived) {
        for (const list of childLists) await db.lists.update(list.id, { folderId: undefined, updatedAt: now() })
      }
    })
    return {
      message: input.archived === true ? 'Folder archived' : input.archived === false ? 'Folder restored' : 'Folder updated',
      undo: async () => {
        await db.folders.put(before)
        if (childLists.length) await db.lists.bulkPut(childLists)
      },
    }
  },

  async createList(input: ListCreateInput): Promise<{ list: ListEntity; undo: UndoableMutation }> {
    const list = await organizationRepository.createList(input)
    return { list, undo: { message: 'List created', undo: async () => { await db.lists.delete(list.id) } } }
  },

  async updateList(id: string, input: ListUpdateInput): Promise<UndoableMutation> {
    const before = await organizationRepository.getList(id)
    if (!before) throw new Error('List not found.')
    await organizationRepository.updateList(id, input)
    return { message: 'List updated', undo: async () => { await db.lists.put(before) } }
  },

  async archiveList(id: string, archived = true): Promise<UndoableMutation> {
    return this.updateList(id, { archived })
  },

  async createSection(input: SectionCreateInput): Promise<{ section: SectionEntity; undo: UndoableMutation }> {
    const section = await organizationRepository.createSection(input)
    return { section, undo: { message: 'Section created', undo: async () => { await db.sections.delete(section.id) } } }
  },

  async updateSection(id: string, input: SectionUpdateInput): Promise<UndoableMutation> {
    const before = await organizationRepository.getSection(id)
    if (!before) throw new Error('Section not found.')
    await organizationRepository.updateSection(id, input)
    return { message: 'Section updated', undo: async () => { await db.sections.put(before) } }
  },

  async archiveSection(id: string, archived = true): Promise<UndoableMutation> {
    const section = await organizationRepository.getSection(id)
    if (!section) throw new Error('Section not found.')
    const affected = (await db.tasks.where('sectionId').equals(id).toArray()).filter((task) => !task.deletedAt)
    const beforeTasks = affected.map((task) => ({ ...task }))
    const beforeSection = { ...section }
    const seriesSnapshots = (await db.recurringSeries.toArray()).filter((series) =>
      series.taskTemplate.sectionId === id || Object.values(series.exceptions ?? {}).some((exception) => exception.sectionId === id)
    ).map((series) => structuredClone(series))
    await db.transaction('rw', db.sections, db.tasks, db.recurringSeries, async () => {
      await db.sections.update(id, { archived, updatedAt: now() })
      if (archived) {
        for (const task of affected) await db.tasks.update(task.id, { sectionId: undefined, updatedAt: now() })
        for (const series of seriesSnapshots) {
          if (series.taskTemplate.sectionId === id) series.taskTemplate.sectionId = undefined
          for (const [date, exception] of Object.entries(series.exceptions ?? {})) {
            if (exception.sectionId === id) series.exceptions[date] = { ...exception, sectionId: null }
          }
          series.updatedAt = now()
          await db.recurringSeries.put(series)
        }
      }
    })
    return {
      message: archived ? 'Section archived' : 'Section restored',
      undo: async () => {
        await db.sections.put(beforeSection)
        if (beforeTasks.length) await db.tasks.bulkPut(beforeTasks)
        if (seriesSnapshots.length) await db.recurringSeries.bulkPut(seriesSnapshots)
      },
    }
  },

  async moveTask(taskId: string, listId?: string, sectionId?: string): Promise<UndoableMutation> {
    const before = await taskRepository.get(taskId)
    if (!before) throw new Error('Task not found.')
    if (listId) {
      const list = await organizationRepository.getList(listId)
      if (!list || list.archived) throw new Error('List not found.')
    }
    if (sectionId) {
      const section = await organizationRepository.getSection(sectionId)
      if (!section || section.archived) throw new Error('Section not found.')
      if (!listId || section.listId !== listId) throw new Error('Section does not belong to the selected list.')
    }
    await taskRepository.update(taskId, { listId: listId ?? null, sectionId: sectionId ?? null })
    return { message: 'Task organization updated', undo: async () => { await taskRepository.replace(before) } }
  },

  async createTag(input: TagCreateInput): Promise<{ tag: TagEntity; undo: UndoableMutation }> {
    const tag = await organizationRepository.createTag(input)
    await assertTagParent(tag.id, tag.parentTagId)
    return { tag, undo: { message: 'Tag created', undo: async () => { await db.tags.delete(tag.id) } } }
  },

  async updateTag(id: string, input: TagUpdateInput): Promise<UndoableMutation> {
    const before = await organizationRepository.getTag(id)
    if (!before) throw new Error('Tag not found.')
    const requestedParent = input.parentTagId === null ? undefined : (input.parentTagId ?? before.parentTagId)
    await assertTagParent(id, requestedParent)
    const beforeName = before.name
    const childSnapshots = input.archived === true && !before.archived
      ? (await db.tags.where('parentTagId').equals(id).toArray()).map((tag) => ({ ...tag }))
      : []
    const next = await organizationRepository.updateTag(id, input)

    const affectedTasks = (await db.tasks.where('tagIds').equals(id).toArray()).map((task) => ({ ...task }))
    const affectedSeries = (await db.recurringSeries.toArray()).filter((series) =>
      series.taskTemplate.tagIds?.includes(id) || Object.values(series.exceptions ?? {}).some((exception) => exception.tagIds?.includes(id))
    ).map((series) => structuredClone(series))

    if (input.archived === true && !before.archived && childSnapshots.length) {
      for (const child of childSnapshots) await db.tags.update(child.id, { parentTagId: before.parentTagId, updatedAt: now() })
    }

    if (next.name !== beforeName && affectedTasks.length) {
      await db.tasks.bulkPut(affectedTasks.map((task) => ({
        ...task,
        tags: (task.tagIds ?? []).map((tagId) => tagId === id ? next.name : task.tags[(task.tagIds ?? []).indexOf(tagId)]).filter((name): name is string => Boolean(name)),
        updatedAt: now(),
      })))
    }

    if (next.name !== beforeName && affectedSeries.length) {
      for (const series of affectedSeries) {
        const templateTags = [...(series.taskTemplate.tags ?? [])]
        const templateIds = series.taskTemplate.tagIds ?? []
        series.taskTemplate.tags = templateIds.map((tagId, index) => tagId === id ? next.name : templateTags[index]).filter((name): name is string => Boolean(name))
        for (const [date, exception] of Object.entries(series.exceptions ?? {})) {
          if (!exception.tagIds?.includes(id)) continue
          const names = [...(exception.tags ?? [])]
          series.exceptions[date] = {
            ...exception,
            tags: exception.tagIds.map((tagId, index) => tagId === id ? next.name : names[index]).filter((name): name is string => Boolean(name)),
          }
        }
        series.updatedAt = now()
        await db.recurringSeries.put(series)
      }
    }

    return {
      message: input.archived === true ? 'Tag archived' : input.archived === false ? 'Tag restored' : 'Tag updated',
      undo: async () => {
        await db.tags.put(before)
        if (childSnapshots.length) await db.tags.bulkPut(childSnapshots)
        if (affectedTasks.length) await db.tasks.bulkPut(affectedTasks)
        if (affectedSeries.length) await db.recurringSeries.bulkPut(affectedSeries)
      },
    }
  },

  async mergeTag(sourceId: string, targetId: string): Promise<UndoableMutation> {
    if (sourceId === targetId) throw new Error('Choose two different tags.')
    const source = await organizationRepository.getTag(sourceId)
    const target = await organizationRepository.getTag(targetId)
    if (!source || !target) throw new Error('Tag not found.')

    let cursor: string | undefined = target.parentTagId
    while (cursor) {
      if (cursor === sourceId) throw new Error('Cannot merge a tag into one of its descendants.')
      cursor = (await organizationRepository.getTag(cursor))?.parentTagId
    }

    const tasks = (await db.tasks.where('tagIds').equals(sourceId).toArray()).map((task) => ({ ...task }))
    const series = (await db.recurringSeries.toArray()).filter((item) =>
      item.taskTemplate.tagIds?.includes(sourceId) || Object.values(item.exceptions ?? {}).some((exception) => exception.tagIds?.includes(sourceId))
    ).map((item) => structuredClone(item))
    const sourceSnapshot = { ...source }
    const targetSnapshot = { ...target }
    const childSnapshots = (await db.tags.where('parentTagId').equals(sourceId).toArray()).map((tag) => ({ ...tag }))

    await db.transaction('rw', db.tasks, db.tags, db.recurringSeries, async () => {
      if (target.parentTagId === sourceId) await db.tags.update(targetId, { parentTagId: source.parentTagId, updatedAt: now() })
      for (const child of childSnapshots) {
        if (child.id !== targetId) await db.tags.update(child.id, { parentTagId: targetId, updatedAt: now() })
      }

      for (const task of tasks) {
        const ids = [...new Set((task.tagIds ?? []).map((id) => id === sourceId ? targetId : id))]
        const tagEntities = await Promise.all(ids.map((id) => db.tags.get(id)))
        await db.tasks.update(task.id, {
          tagIds: ids,
          tags: tagEntities.filter(Boolean).map((tag) => tag!.name),
          updatedAt: now(),
        })
      }
      for (const item of series) {
        const replace = (ids: string[] = []) => [...new Set(ids.map((id) => id === sourceId ? targetId : id))]
        item.taskTemplate.tagIds = replace(item.taskTemplate.tagIds)
        item.taskTemplate.tags = (await Promise.all(item.taskTemplate.tagIds.map((id) => db.tags.get(id)))).filter(Boolean).map((tag) => tag!.name)
        for (const [date, exception] of Object.entries(item.exceptions ?? {})) {
          if (!exception.tagIds?.includes(sourceId)) continue
          const ids = replace(exception.tagIds)
          item.exceptions[date] = { ...exception, tagIds: ids, tags: (await Promise.all(ids.map((id) => db.tags.get(id)))).filter(Boolean).map((tag) => tag!.name) }
        }
        item.updatedAt = now()
        await db.recurringSeries.put(item)
      }
      await db.tags.update(sourceId, { archived: true, updatedAt: now() })
    })

    return {
      message: 'Tags merged',
      undo: async () => {
        await db.tags.put(sourceSnapshot)
        await db.tags.put(targetSnapshot)
        if (childSnapshots.length) await db.tags.bulkPut(childSnapshots)
        if (tasks.length) await db.tasks.bulkPut(tasks)
        if (series.length) await db.recurringSeries.bulkPut(series)
      },
    }
  },
}
}
