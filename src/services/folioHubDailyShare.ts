import { db } from '../db/database'
import { localDateKey } from '../domain/date'

/** Original Folio-backed, bounded one-time device snapshot.
 * Read only. No automatic cross-origin sync, secret state or new DB schema.
 */
export const FOLIO_HUB_MESSAGE='thiepn:folio-hub-daily:v1' as const
export const HUB_SHARE_ORIGIN='https://thiepn.dev' as const
export const HUB_NONCE=/^[a-f0-9]{32}$/
export function parseHubShareNonce(search:string, origin:string, hasOpener:boolean):string|null{
  if(origin!==HUB_SHARE_ORIGIN || !hasOpener)return null
  const params=new URLSearchParams(search)
  const nonce=params.get('hubBridge')
  return nonce&&HUB_NONCE.test(nonce)?nonce:null
}
export async function readFolioHubDailyShare(){
  const date=localDateKey(),generatedAt=new Date().toISOString()
  return db.transaction('r',[db.tasks,db.timeBlocks,db.notes,db.habits,db.habitEntries],async()=>{
    const [tasks,events,notes,habits,entries]=await Promise.all([
      db.tasks.toArray(),db.timeBlocks.toArray(),db.notes.toArray(),
      db.habits.toArray(),db.habitEntries.where('date').equals(date).toArray()
    ])
    const pending=tasks.filter(t=>!t.deletedAt&&(t.status==='todo'||t.status==='inbox')&&
      (t.plannedDate===date||Boolean(t.deadline&&t.deadline<=date)))
    const overdue=pending.filter(t=>Boolean(t.deadline&&t.deadline<date))
    const soon=events.filter(e=>Date.parse(e.end)>Date.now() &&
      Date.parse(e.start)<Date.now()+7*86400000).sort((a,b)=>a.start.localeCompare(b.start))
    const byHabit=new Map(entries.map(e=>[e.habitId,e]))
    return {
      schema:'thiepn:folio-hub-daily' as const,version:1 as const,
      generatedAt,date,source:'folio-local-device' as const,
      tasks:pending.slice(0,12).map(t=>({
        id:t.id,title:t.title,priority:t.priority,plannedToday:t.plannedDate===date,
        ...(t.plannedDate?{plannedDate:t.plannedDate}:{}),
        ...(t.deadline?{deadline:t.deadline}:{})
      })),
      pendingCount:pending.length,overdueCount:overdue.length,
      events:soon.slice(0,12).map(e=>({
        id:e.id,title:e.title,start:e.start,end:e.end,
        kind:e.taskId?'task' as const:'event' as const,allDay:Boolean(e.allDay)
      })),
      notes:notes.filter(n=>!n.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
        .slice(0,5).map(n=>({id:n.id,title:n.title.trim()||'Untitled',updatedAt:n.updatedAt})),
      habits:habits.filter(h=>!h.archived).sort((a,b)=>a.sortOrder-b.sortOrder)
        .slice(0,10).map(h=>{
          const entry=byHabit.get(h.id)
          return {id:h.id,title:h.title,target:h.target,value:entry?.value??0,
            updatedAt:entry?.updatedAt??h.updatedAt,
            status:entry?.status==='completed'?'completed' as const:
              entry?.status==='skipped'?'skipped' as const:'open' as const}
        })
    }
  })
}
/** Explicit source UI click only. Does not persist, broadcast, or grant future reads. */
export async function shareFolioDailyOnClick(nonce:string,opener:Window|null){
  if(!HUB_NONCE.test(nonce)||!opener||window.location.origin!==HUB_SHARE_ORIGIN||
    document.hidden)return false
  const snapshot=await readFolioHubDailyShare()
  opener.postMessage({type:FOLIO_HUB_MESSAGE,nonce,snapshot},HUB_SHARE_ORIGIN)
  return true
}
