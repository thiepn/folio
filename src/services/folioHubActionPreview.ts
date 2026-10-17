import { db } from '../db/database'
import { localDateKey } from '../domain/date'
import type { DisciplineCommand } from './disciplineCommandGate'

export interface FolioActionPreview {
  title:string; status:string; updatedAt:string; available:boolean;
}
/** Read actual original source before native user approval. No derived IDs or writes. */
export async function readFolioHubActionPreview(command:DisciplineCommand):Promise<FolioActionPreview|null>{
  if(command.operation==='calendar.review')return null
  if(command.operation==='focus.finish'){
    const focus=await db.focusSessions.get(command.resourceId)
    if(!focus)return null
    return {title:focus.taskTitleSnapshot||'Original Folio focus session',
      status:focus.status,updatedAt:focus.updatedAt,
      available:focus.status==='running'||focus.status==='paused'}
  }
  const habit=await db.habits.get(command.resourceId)
  if(!habit||habit.archived)return null
  const date=localDateKey()
  const paused=habit.pauses.some(p=>date>=p.startDate&&(!p.endDate||date<=p.endDate))
  const entry=await db.habitEntries.get(habit.id+':'+date)
  const status=paused?'paused':entry?.status??'open'
  const available=!paused&&(command.operation==='habit.complete'
    ?status!=='completed'&&status!=='skipped':status==='completed')
  return {title:habit.title,status,updatedAt:entry?.updatedAt??habit.updatedAt,available}
}
