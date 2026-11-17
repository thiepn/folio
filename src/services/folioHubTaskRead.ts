import { db } from '../db/database'
import { addLocalDays, localDateKey } from '../domain/date'
import type { TaskEntity } from '../domain/models'

/** Owner-created read-only task projection. No Hub imports, cloud, or task mutation. */
export const FOLIO_HUB_TASK_READ_LIMIT = 160
export const FOLIO_HUB_TASK_READ_MESSAGE = 'thiepn:folio-hub-tasks-read:v1' as const
export const FOLIO_HUB_LIVE_GRANT_KEY = 'folio:hub:task-read-consent:v1' as const
export type FolioHubTaskBucket = 'today' | 'inbox' | 'upcoming' | 'later'
export interface FolioHubTaskRow {
  id: string
  title: string
  status: 'todo' | 'inbox'
  priority: 'normal' | 'high' | 'critical'
  plannedDate?: string
  deadline?: string
  updatedAt: string
  bucket: FolioHubTaskBucket
  recurring?: boolean
  hasSubtasks?: boolean
  projectId?: string
  projectName?: string
  listId?: string
  listName?: string
}
export interface FolioHubTaskRead {
  schema: 'thiepn:folio-hub-tasks'
  version: 1
  source: 'folio-local-device'
  date: string
  generatedAt: string
  totalCount: number
  counts: Record<FolioHubTaskBucket,number>
  truncated: boolean
  tasks: FolioHubTaskRow[]
  availableProjects?: {id:string;name:string}[]
  availableLists?: {id:string;name:string}[]
  contextTruncated?: boolean
  /** Separate bounded recently completed list for explicit reopen controls.
   * It never alters active bucket totals or v1 read semantics. */
  recentCompleted: {id:string;title:string;updatedAt:string;completedAt?:string;priority:'normal'|'high'|'critical';plannedDate?:string}[]
}
export function projectTask(task: TaskEntity, today: string, horizon: string, plan: Set<string>,
  parents: Set<string>, projects: Map<string,string>, lists: Map<string,string>): FolioHubTaskRow {
  const bucket: FolioHubTaskBucket = (task.deadline && task.deadline <= today) ||
    (task.plannedDate && task.plannedDate <= today) || plan.has(task.id) ? 'today' :
    task.status === 'inbox' ? 'inbox' :
    ((task.plannedDate && task.plannedDate <= horizon) ||
     (task.deadline && task.deadline <= horizon)) ? 'upcoming' : 'later'
  return {
    id: task.id, title: task.title.slice(0,160), status: task.status as 'todo' | 'inbox',
    priority: task.priority, updatedAt: task.updatedAt, bucket,
    ...(task.seriesId ? {recurring:true} : {}),
    ...(parents.has(task.id) ? {hasSubtasks:true} : {}),
    ...(task.projectId ? {projectId:task.projectId} : {}),
    ...(task.projectId && projects.has(task.projectId) ? {projectName:projects.get(task.projectId)} : {}),
    ...(task.listId ? {listId:task.listId} : {}),
    ...(task.listId && lists.has(task.listId) ? {listName:lists.get(task.listId)} : {}),
    ...(task.plannedDate ? {plannedDate:task.plannedDate} : {}),
    ...(task.deadline ? {deadline:task.deadline} : {}),
  }
}
export const order: Record<FolioHubTaskBucket,number> = {today:0,inbox:1,upcoming:2,later:3}
export const priority: Record<FolioHubTaskRow['priority'],number> = {critical:0,high:1,normal:2}

/** Reads task, daily-plan and context tables in one Dexie readonly transaction; never writes. */
export async function createFolioHubTaskRead(now = new Date()):Promise<FolioHubTaskRead> {
  const today = localDateKey(now)
  const horizon = addLocalDays(today,7)
  const [tasks, planned, projectRows, listRows] = await db.transaction('r',
    [db.tasks,db.dailyPlanItems,db.projects,db.lists],()=>Promise.all([
      db.tasks.toArray(), db.dailyPlanItems.where('date').equals(today).toArray(),
      db.projects.toArray(), db.lists.toArray(),
    ]))
  const projectNames=new Map(projectRows.map(row=>[row.id,row.name.slice(0,120)]))
  const listNames=new Map(listRows.map(row=>[row.id,row.name.slice(0,120)]))
  const activeProjects=projectRows.filter(p=>!p.archived).sort((a,b)=>a.name.localeCompare(b.name))
  const activeLists=listRows.filter(l=>!l.archived).sort((a,b)=>a.name.localeCompare(b.name))
  const plannedIds=new Set(planned.map(row=>row.taskId))
  const parents=new Set(tasks.filter(task=>!task.deletedAt&&task.parentTaskId).map(task=>task.parentTaskId!))
  const rows=tasks
    .filter(task=>!task.deletedAt && (task.status==='todo' || task.status==='inbox'))
    .map(task=>projectTask(task,today,horizon,plannedIds,parents,projectNames,listNames))
    .sort((a,b)=>order[a.bucket]-order[b.bucket] ||
      (a.bucket==='today' && a.deadline && a.deadline<today ? -1 : 0) -
      (b.bucket==='today' && b.deadline && b.deadline<today ? -1 : 0) ||
      priority[a.priority]-priority[b.priority] ||
      (a.deadline||a.plannedDate||'9999-12-31').localeCompare(b.deadline||b.plannedDate||'9999-12-31') ||
      a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  const recentCompleted=tasks.filter(task=>!task.deletedAt && task.status==='completed')
    .sort((a,b)=>(b.completedAt||b.updatedAt).localeCompare(a.completedAt||a.updatedAt))
    .slice(0,20).map(task=>({
      id:task.id,title:task.title.slice(0,160),updatedAt:task.updatedAt,
      ...(task.completedAt?{completedAt:task.completedAt}:{}),
      priority:task.priority,
      ...(task.plannedDate?{plannedDate:task.plannedDate}:{})
    }))
  const counts:Record<FolioHubTaskBucket,number>={today:0,inbox:0,upcoming:0,later:0}
  for (const row of rows) counts[row.bucket]++
  const snapshot:FolioHubTaskRead={
    schema:'thiepn:folio-hub-tasks',version:1,source:'folio-local-device',
    date:today,generatedAt:now.toISOString(),totalCount:rows.length,counts,
    truncated:rows.length>FOLIO_HUB_TASK_READ_LIMIT,
    tasks:rows.slice(0,FOLIO_HUB_TASK_READ_LIMIT),
    availableProjects:activeProjects.slice(0,80).map(p=>({id:p.id,name:p.name.slice(0,120)})),
    availableLists:activeLists.slice(0,80).map(l=>({id:l.id,name:l.name.slice(0,120)})),
    contextTruncated:activeProjects.length>80||activeLists.length>80,
    recentCompleted,
  }
  if(JSON.stringify(snapshot).length>80_000)throw new Error('Folio task read is too large')
  return snapshot
}
