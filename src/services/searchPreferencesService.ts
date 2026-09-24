import type { SearchFilters } from './contentSearchService'
import { settingsRepository } from '../repositories/settingsRepository'

export interface SavedSearchDefinition {
  id: string
  name: string
  query: string
  filters: SearchFilters
  createdAt: string
  updatedAt: string
}

export interface RecentSearchDefinition {
  id: string
  query: string
  filters: SearchFilters
  usedAt: string
}

const SAVED_KEY='search.saved.v2'
const RECENT_KEY='search.recents.v2'
const MAX_RECENTS=12

function validSaved(value:unknown):SavedSearchDefinition[]{
  if(!Array.isArray(value))return[]
  return value.filter((item):item is SavedSearchDefinition=>Boolean(item&&typeof item==='object'&&typeof (item as any).id==='string'&&typeof (item as any).name==='string'&&typeof (item as any).query==='string'&&typeof (item as any).createdAt==='string'&&typeof (item as any).updatedAt==='string'&&(item as any).filters&&typeof (item as any).filters==='object'))
}
function validRecent(value:unknown):RecentSearchDefinition[]{
  if(!Array.isArray(value))return[]
  return value.filter((item):item is RecentSearchDefinition=>Boolean(item&&typeof item==='object'&&typeof (item as any).id==='string'&&typeof (item as any).query==='string'&&typeof (item as any).usedAt==='string'&&(item as any).filters&&typeof (item as any).filters==='object')).slice(0,MAX_RECENTS)
}
function snapshot(filters:SearchFilters):SearchFilters{
  return {
    types:[...(filters.types??[])],
    projectId:filters.projectId,
    tagId:filters.tagId,
    status:filters.status??'all',
    includeArchived:Boolean(filters.includeArchived),
    updatedWithinDays:filters.updatedWithinDays,
    dateFrom:filters.dateFrom,
    dateTo:filters.dateTo,
    sort:filters.sort??'relevance',
  }
}
function key(query:string,filters:SearchFilters){
  return JSON.stringify([query.trim(),snapshot(filters)])
}

export const searchPreferencesService={
  async listSaved(){return validSaved(await settingsRepository.get<unknown>(SAVED_KEY,[])).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))},
  async save(name:string,query:string,filters:SearchFilters){
    const cleaned=name.trim()
    if(!cleaned)throw new Error('Saved search name is required.')
    const current=await this.listSaved()
    const now=new Date().toISOString()
    const existing=current.find((item)=>item.name.toLocaleLowerCase()===cleaned.toLocaleLowerCase())
    const row:SavedSearchDefinition=existing
      ?{...existing,name:cleaned,query:query.trim(),filters:snapshot(filters),updatedAt:now}
      :{id:crypto.randomUUID(),name:cleaned,query:query.trim(),filters:snapshot(filters),createdAt:now,updatedAt:now}
    await settingsRepository.set(SAVED_KEY,[row,...current.filter((item)=>item.id!==row.id)].slice(0,40))
    return row
  },
  async removeSaved(id:string){
    const current=await this.listSaved()
    await settingsRepository.set(SAVED_KEY,current.filter((item)=>item.id!==id))
  },
  async listRecent(){return validRecent(await settingsRepository.get<unknown>(RECENT_KEY,[]))},
  async remember(query:string,filters:SearchFilters){
    const cleaned=query.trim()
    if(!cleaned&&!Object.values(filters).some(Boolean))return
    const current=await this.listRecent()
    const signature=key(cleaned,filters)
    const now=new Date().toISOString()
    const row:RecentSearchDefinition={id:crypto.randomUUID(),query:cleaned,filters:snapshot(filters),usedAt:now}
    const next=[row,...current.filter((item)=>key(item.query,item.filters)!==signature)].slice(0,MAX_RECENTS)
    await settingsRepository.set(RECENT_KEY,next)
    return row
  },
  async clearRecent(){await settingsRepository.set(RECENT_KEY,[])},
}
