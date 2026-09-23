import { z } from 'zod'
import { db } from '../db/database'
import {
  folderCreateSchema, folderUpdateSchema,
  listCreateSchema, listUpdateSchema,
  sectionCreateSchema, sectionUpdateSchema,
  tagCreateSchema, tagUpdateSchema,
} from '../domain/schemas'
import type { FolderEntity, ListEntity, SectionEntity, TagEntity } from '../domain/models'

export type FolderCreateInput = z.input<typeof folderCreateSchema>
export type FolderUpdateInput = z.input<typeof folderUpdateSchema>
export type ListCreateInput = z.input<typeof listCreateSchema>
export type ListUpdateInput = z.input<typeof listUpdateSchema>
export type SectionCreateInput = z.input<typeof sectionCreateSchema>
export type SectionUpdateInput = z.input<typeof sectionUpdateSchema>
export type TagCreateInput = z.input<typeof tagCreateSchema>
export type TagUpdateInput = z.input<typeof tagUpdateSchema>

export function normalizeTagName(value: string) {
  return value.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase()
}

function now() { return new Date().toISOString() }

export const organizationRepository = {
  async listFolders(includeArchived = false): Promise<FolderEntity[]> {
    const rows = await db.folders.toArray()
    return rows.filter((item) => includeArchived || !item.archived).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name))
  },
  async listLists(includeArchived = false): Promise<ListEntity[]> {
    const rows = await db.lists.toArray()
    return rows.filter((item) => includeArchived || !item.archived).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name))
  },
  async listSections(includeArchived = false): Promise<SectionEntity[]> {
    const rows = await db.sections.toArray()
    return rows.filter((item) => includeArchived || !item.archived).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name))
  },
  async listTags(includeArchived = false): Promise<TagEntity[]> {
    const rows = await db.tags.toArray()
    return rows.filter((item) => includeArchived || !item.archived).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name))
  },
  async getFolder(id: string) { return db.folders.get(id) },
  async getList(id: string) { return db.lists.get(id) },
  async getSection(id: string) { return db.sections.get(id) },
  async getTag(id: string) { return db.tags.get(id) },

  async createFolder(input: FolderCreateInput): Promise<FolderEntity> {
    const parsed=folderCreateSchema.parse(input), stamp=now()
    const row: FolderEntity={id:crypto.randomUUID(),name:parsed.name,color:parsed.color,icon:parsed.icon,sortOrder:parsed.sortOrder ?? Date.now(),collapsed:parsed.collapsed,archived:false,createdAt:stamp,updatedAt:stamp}
    await db.folders.add(row); return row
  },
  async updateFolder(id:string,input:FolderUpdateInput): Promise<FolderEntity> {
    const current=await db.folders.get(id); if(!current) throw new Error('Folder not found.')
    const parsed=folderUpdateSchema.parse(input)
    const next:FolderEntity={...current,...parsed,archivedAt:parsed.archived===true&&!current.archived?now():parsed.archived===false?undefined:current.archivedAt,updatedAt:now()}
    await db.folders.put(next); return next
  },

  async createList(input: ListCreateInput): Promise<ListEntity> {
    const parsed=listCreateSchema.parse(input)
    if(parsed.folderId && !(await db.folders.get(parsed.folderId))) throw new Error('Folder not found.')
    const stamp=now()
    const row:ListEntity={id:crypto.randomUUID(),name:parsed.name,description:parsed.description,folderId:parsed.folderId,color:parsed.color,icon:parsed.icon,favorite:parsed.favorite,archived:false,sortOrder:parsed.sortOrder??Date.now(),sortMode:parsed.sortMode,groupMode:parsed.groupMode,showCompleted:parsed.showCompleted,createdAt:stamp,updatedAt:stamp}
    await db.lists.add(row); return row
  },
  async updateList(id:string,input:ListUpdateInput): Promise<ListEntity> {
    const current=await db.lists.get(id); if(!current) throw new Error('List not found.')
    const parsed=listUpdateSchema.parse(input)
    const folderId=parsed.folderId===null?undefined:(parsed.folderId??current.folderId)
    if(folderId && !(await db.folders.get(folderId))) throw new Error('Folder not found.')
    const next:ListEntity={...current,...parsed,folderId,archivedAt:parsed.archived===true&&!current.archived?now():parsed.archived===false?undefined:current.archivedAt,updatedAt:now()}
    await db.lists.put(next); return next
  },

  async createSection(input:SectionCreateInput): Promise<SectionEntity> {
    const parsed=sectionCreateSchema.parse(input)
    if(!(await db.lists.get(parsed.listId))) throw new Error('List not found.')
    const stamp=now()
    const row:SectionEntity={id:crypto.randomUUID(),listId:parsed.listId,name:parsed.name,sortOrder:parsed.sortOrder??Date.now(),archived:false,createdAt:stamp,updatedAt:stamp}
    await db.sections.add(row); return row
  },
  async updateSection(id:string,input:SectionUpdateInput): Promise<SectionEntity> {
    const current=await db.sections.get(id); if(!current) throw new Error('Section not found.')
    const parsed=sectionUpdateSchema.parse(input), next={...current,...parsed,updatedAt:now()}
    await db.sections.put(next); return next
  },

  async findTagByName(name:string): Promise<TagEntity|undefined> {
    const normalized=normalizeTagName(name)
    if(!normalized) return undefined
    return db.tags.where('normalizedName').equals(normalized).first()
  },
  async createTag(input:TagCreateInput): Promise<TagEntity> {
    const parsed=tagCreateSchema.parse(input), normalizedName=normalizeTagName(parsed.name)
    if(!normalizedName) throw new Error('Tag name is required.')
    const existing=await db.tags.where('normalizedName').equals(normalizedName).first()
    if(existing) throw new Error('A tag with that name already exists.')
    if(parsed.parentTagId && !(await db.tags.get(parsed.parentTagId))) throw new Error('Parent tag not found.')
    const stamp=now()
    const row:TagEntity={id:crypto.randomUUID(),name:parsed.name.trim().replace(/^#/,'').replace(/\s+/g,' '),normalizedName,parentTagId:parsed.parentTagId,color:parsed.color,favorite:parsed.favorite,archived:false,sortOrder:parsed.sortOrder??Date.now(),createdAt:stamp,updatedAt:stamp}
    await db.tags.add(row); return row
  },
  async updateTag(id:string,input:TagUpdateInput): Promise<TagEntity> {
    const current=await db.tags.get(id); if(!current) throw new Error('Tag not found.')
    const parsed=tagUpdateSchema.parse(input)
    const name=parsed.name?.trim().replace(/^#/,'').replace(/\s+/g,' ') ?? current.name
    const normalizedName=normalizeTagName(name)
    const duplicate=await db.tags.where('normalizedName').equals(normalizedName).first()
    if(duplicate && duplicate.id!==id) throw new Error('A tag with that name already exists.')
    const parentTagId=parsed.parentTagId===null?undefined:(parsed.parentTagId??current.parentTagId)
    if(parentTagId===id) throw new Error('A tag cannot be its own parent.')
    const next:TagEntity={...current,...parsed,name,normalizedName,parentTagId,updatedAt:now()}
    await db.tags.put(next); return next
  },
  async resolveTagNames(names:string[]): Promise<TagEntity[]> {
    const result:TagEntity[]=[]
    for(const raw of [...new Set(names.map((value)=>value.trim()).filter(Boolean))].slice(0,50)) {
      const normalized=normalizeTagName(raw)
      let tag=await db.tags.where('normalizedName').equals(normalized).first()
      if(!tag) tag=await this.createTag({name:raw})
      result.push(tag)
    }
    return result
  },
}
