/** Reviewable multi-day Folio work allocation. Source tasks and existing
 * TimeBlocks remain authoritative; suggestions are pure, deterministic and
 * never alter recurrence templates or habit entries. */
import { addLocalDays } from '../../domain/date'
import type { LocalDate, TaskEntity, TimeBlockEntity } from '../../domain/models'
import { scheduledMinutesForTask } from './calendarLogic'
import { suggestFreeCalendarSlots, type CalendarSlotC2 } from './calendarSlotSuggestionsC2'

export interface AllocationOptionsC3 {
 from: LocalDate
 days: 7 | 14
 sessionMinutes: 30 | 45 | 60 | 90 | 120
 sessionsPerDay: 1 | 2
 dailyStart: number
 dailyEnd: number
 timeZone: string
 afterIso?: string
}
export interface AllocationPlanC3 {
 taskId: string
 taskRevision: string
 slots: CalendarSlotC2[]
 totalRemainingMinutes: number
 allocatedMinutes: number
 uncoveredMinutes: number
 deadline?: LocalDate
}
export function planMultiDayTaskC3(task:TaskEntity, blocks:ReadonlyArray<TimeBlockEntity>,options:AllocationOptionsC3):AllocationPlanC3 {
 const remaining=Math.max(0,(task.estimatedMinutes??30)-scheduledMinutesForTask(blocks as TimeBlockEntity[],task.id))
 const empty:AllocationPlanC3={taskId:task.id,taskRevision:task.updatedAt,slots:[],totalRemainingMinutes:remaining,allocatedMinutes:0,uncoveredMinutes:remaining,deadline:task.deadline}
 if(task.deletedAt||task.status!=='todo'||remaining<=0)return empty
 if(![7,14].includes(options.days)||![1,2].includes(options.sessionsPerDay)||
   options.sessionMinutes<15||options.sessionMinutes>240)return empty
 const occupied=[...blocks]
 const slots:CalendarSlotC2[]=[]
 const until=addLocalDays(options.from,options.days-1)
 let left=remaining
 for(let i=0;i<options.days&&left>0&&slots.length<16;i++){
  const date=addLocalDays(options.from,i)
  if(date>until||task.deadline&&date>task.deadline)break
  for(let j=0;j<options.sessionsPerDay&&left>0&&slots.length<16;j++){
   const minutes=Math.ceil(Math.min(options.sessionMinutes,left)/15)*15
   const candidate=suggestFreeCalendarSlots(occupied,{
    from:date,through:date,deadline:task.deadline,timeZone:options.timeZone,
    minutes,dailyStart:options.dailyStart,dailyEnd:options.dailyEnd,
    limit:1,afterIso:options.afterIso
   })[0]
   if(!candidate)break
   slots.push(candidate)
   occupied.push({id:'proposal:'+slots.length,kind:'task',title:task.title,
    taskId:task.id,source:'folio',start:candidate.start,end:candidate.end,
    createdAt:'',updatedAt:''})
   left=Math.max(0,left-candidate.durationMinutes)
  }
 }
 const allocated=Math.min(remaining,slots.reduce((n,b)=>n+b.durationMinutes,0))
 return {...empty,slots,allocatedMinutes:allocated,uncoveredMinutes:Math.max(0,remaining-allocated)}
}
