/** Read-only calendar-origin distinctions. Folio retains every event's owner.
 * Hiding a group affects presentation only; busy-time calculations always use
 * all authoritative blocks, including disconnected/imported source mirrors.
 */
import type { TimeBlockEntity } from '../../domain/models'

export interface CalendarSourceGroup {
  key:string
  label:string
  description:string
  count:number
  provenance:'folio'|'ics'|'klips'|'google'
}
export function calendarSourceIdentity(block:TimeBlockEntity) {
  if(block.source==='klips')return 'klips:'+(block.sourceCalendar??'unidentified')
  if(block.source==='google')return 'google:'+(block.sourceCalendar??'unidentified')
  if(block.source==='ics')return 'ics:'+(block.sourceCalendar??'imported')
  return block.kind==='task'?'folio:tasks':'folio:events'
}
export function calendarSourceGroups(blocks:readonly TimeBlockEntity[]):CalendarSourceGroup[]{
  const map=new Map<string,CalendarSourceGroup>()
  for(const block of blocks) {
    const key=calendarSourceIdentity(block)
    const source=block.source??'folio'
    const owner:CalendarSourceGroup['provenance']=
      source==='ics'||source==='klips'||source==='google'?source:'folio'
    const label=owner==='folio'?(block.kind==='task'?'Folio tasks':'Folio events')
      :owner==='ics'?'Imported ICS · '+(block.sourceCalendar??'Local file')
      :owner==='klips'?'KLIPS · '+(block.sourceCalendar?.replace(/^klips:/,'')??'Local timetable')
      :'Google · '+(block.sourceCalendar?.replace(/^gcal:/,'')??'Local mirror')
    const description=owner==='folio'?'Editable in Folio'
      :owner==='ics'?'One-time local import'
      :owner==='klips'?'Read-only local timetable'
      :'Read-only local mirror; connection not active'
    const prior=map.get(key)
    if(prior)prior.count++
    else map.set(key,{key,label,description,count:1,provenance:owner})
  }
  return [...map.values()].sort((a,b)=>{
    const rank={folio:0,ics:1,klips:2,google:3}
    return rank[a.provenance]-rank[b.provenance]||a.label.localeCompare(b.label)
  })
}
export function visibleCalendarBlocks(blocks:readonly TimeBlockEntity[],hidden:ReadonlySet<string>){
  return blocks.filter(block=>!hidden.has(calendarSourceIdentity(block)))
}
