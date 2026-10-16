/** Deterministic and explainable open-time suggestions, using Folio's own
 * time-block authority. No LLM, external service or writes. A user still
 * reviews the original TimeBlockModal before scheduling.
 */
import { addLocalDays, atTimeInZone } from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import { blockTouchesDate } from './calendarLogic'
export interface CalendarSlotC2 {
 date:LocalDate
 startMinute:number
 durationMinutes:number
 start:string
 end:string
}
export interface CalendarSlotOptionsC2 {
 from:LocalDate
 through?:LocalDate
 deadline?:LocalDate
 timeZone:string
 minutes:number
 dailyStart:number
 dailyEnd:number
 limit?:number
 afterIso?:string
}
export function suggestFreeCalendarSlots(blocks:ReadonlyArray<TimeBlockEntity>,o:CalendarSlotOptionsC2):CalendarSlotC2[]{
 const start=Math.round(o.dailyStart/15)*15,end=Math.floor(o.dailyEnd/15)*15
 const duration=Math.ceil(o.minutes/15)*15
 if(!o.from||duration<15||duration>240||start<0||end>1440||end-start<duration)
   return []
 const through=[o.through??addLocalDays(o.from,6),o.deadline??'9999-12-31'].sort()[0]
 const result:CalendarSlotC2[]=[]
 const after=o.afterIso?Date.parse(o.afterIso):Number.NEGATIVE_INFINITY
 for(let i=0;i<28&&result.length<(o.limit??4);i++){
   const date=addLocalDays(o.from,i)
   if(date>through)break
   const busy=blocks.filter(b=>blockTouchesDate(b,date,o.timeZone))
     .map(b=>[Date.parse(b.start),Date.parse(b.end)] as const)
   for(let minute=start;minute+duration<=end&&result.length<(o.limit??4);minute+=15){
     let first:string,last:string
     try{
       first=atTimeInZone(date,minute,o.timeZone)
       // End at true local boundary; avoids DST-crossing wall-clock mismatch.
       last=minute+duration===1440
         ?atTimeInZone(addLocalDays(date,1),0,o.timeZone)
         :atTimeInZone(date,minute+duration,o.timeZone)
     }catch{continue}
     const begin=Date.parse(first),finish=Date.parse(last)
     if(!Number.isFinite(begin)||!Number.isFinite(finish)||finish-begin!==duration*60_000||
       begin<after||busy.some(([s,e])=>s<finish&&e>begin))continue
     result.push({date,startMinute:minute,durationMinutes:duration,start:first,end:last})
     minute+=duration-15
   }
 }
 return result
}
