import { db } from '../db/database'
import { addLocalDays, localDateKey } from '../domain/date'
import { projectTask, priority, order, type FolioHubTaskBucket, type FolioHubTaskRow } from './folioHubTaskRead'
import type { TaskEntity } from '../domain/models'

/** Separate on-demand full-source query. The Stage 1B 160-item snapshot stays
 * unchanged; only the requested page crosses the same-origin read channel. */
export const FOLIO_HUB_TASK_QUERY_MESSAGE='thiepn:folio-hub-tasks-query:v1' as const
export const FOLIO_HUB_TASK_PAGE_SIZE=40
export type FolioHubQueryFilter=FolioHubTaskBucket|'all'|'completed'
export type FolioHubQueryRow=Omit<FolioHubTaskRow,'status'|'bucket'> & {
  status:'todo'|'inbox'|'completed'
  bucket:FolioHubTaskBucket|'completed'
  completedAt?:string
}
export interface FolioHubTaskQueryInput {
  filter:FolioHubQueryFilter
  search:string
  projectId:string
  page:number
}
export interface FolioHubTaskQueryResult extends FolioHubTaskQueryInput {
  schema:'thiepn:folio-hub-task-query'
  version:1
  source:'folio-local-device'
  date:string
  generatedAt:string
  pageSize:40
  total:number
  hasMore:boolean
  rows:FolioHubQueryRow[]
}
const filters:readonly string[]=['today','inbox','upcoming','later','all','completed']
const text=(x:unknown,max:number)=>typeof x==='string'&&x.length<=max&&!/[\u0000-\u001f]/.test(x)
const normalized=(s:string)=>s.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f]/g,'').trim()
export function parseFolioTaskQueryInput(input:unknown):FolioHubTaskQueryInput {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid task query')
  const value=input as Record<string,unknown>
  if(!filters.includes(String(value.filter))||!text(value.search,100)||
     !text(value.projectId,128)||!value.projectId||
     !Number.isSafeInteger(value.page)||Number(value.page)<0||Number(value.page)>9999)
    throw Error('Invalid task query')
  return {filter:value.filter as FolioHubQueryFilter,
    search:(value.search as string).trim(),projectId:value.projectId as string,
    page:value.page as number}
}
const due=(t:FolioHubQueryRow)=>t.deadline||t.plannedDate||'9999-12-31'
/** No task, identity, account or backup writes. Every request reads all
 * matching source records in a single readonly transaction, then pages them. */
export async function createFolioHubTaskQuery(raw:unknown, now=new Date()):Promise<FolioHubTaskQueryResult> {
  const query=parseFolioTaskQueryInput(raw)
  const today=localDateKey(now)
  const horizon=addLocalDays(today,7)
  const [tasks, planned, projects, lists] = await db.transaction('r',
    [db.tasks,db.dailyPlanItems,db.projects,db.lists],()=>Promise.all([
      db.tasks.toArray(),db.dailyPlanItems.where('date').equals(today).toArray(),
      db.projects.toArray(),db.lists.toArray()
    ]))
  const projectNames=new Map(projects.map(row=>[row.id,row.name.slice(0,120)]))
  const listNames=new Map(lists.map(row=>[row.id,row.name.slice(0,120)]))
  const plannedIds=new Set(planned.map(row=>row.taskId))
  const parents=new Set(tasks.filter(t=>!t.deletedAt&&t.parentTaskId).map(t=>t.parentTaskId!))
  const search=normalized(query.search)
  const matched:FolioHubQueryRow[]=[]
  for(const task of tasks){
    if(task.deletedAt||task.status==='cancelled')continue
    if(query.filter==='completed'?task.status!=='completed':
       task.status!=='todo'&&task.status!=='inbox')continue
    if(query.projectId!=='all' &&
       (query.projectId==='none'?!!task.projectId:task.projectId!==query.projectId))continue
    if(search && !normalized([task.title,projectNames.get(task.projectId||'')||'',
      listNames.get(task.listId||'')||''].join(' ')).includes(search))continue
    const row=projectTask(task as TaskEntity,today,horizon,plannedIds,parents,projectNames,listNames)
    if(task.status==='completed'){
      if(query.filter!=='completed')continue
      matched.push({...row,status:'completed',bucket:'completed',
        ...(task.completedAt?{completedAt:task.completedAt}:{})})
    }else if(query.filter==='all'||query.filter===row.bucket)
      matched.push(row)
  }
  // Pure per-request comparison. No global mutable comparator state.
  matched.sort((a,b)=>{
    if(a.bucket==='completed'&&b.bucket==='completed')
      return (b.completedAt||b.updatedAt).localeCompare(a.completedAt||a.updatedAt)||
        a.id.localeCompare(b.id)
    if(a.bucket==='completed')return 1
    if(b.bucket==='completed')return -1
    return order[a.bucket]-order[b.bucket] ||
      (a.bucket==='today'&&a.deadline&&a.deadline<today?-1:0) -
      (b.bucket==='today'&&b.deadline&&b.deadline<today?-1:0) ||
      priority[a.priority]-priority[b.priority] || due(a).localeCompare(due(b)) ||
      a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  })
  const start=query.page*FOLIO_HUB_TASK_PAGE_SIZE
  const result:FolioHubTaskQueryResult={
    schema:'thiepn:folio-hub-task-query',version:1,source:'folio-local-device',
    date:today,generatedAt:now.toISOString(),...query,pageSize:40,
    total:matched.length,hasMore:start+FOLIO_HUB_TASK_PAGE_SIZE<matched.length,
    rows:matched.slice(start,start+FOLIO_HUB_TASK_PAGE_SIZE)
  }
  if(JSON.stringify(result).length>32_000)throw Error('Folio task query page too large')
  return result
}
