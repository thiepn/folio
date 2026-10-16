/** Atomic, owner-local allocation using the original Folio TimeBlock store.
 * The preview is recalculated inside the write transaction; any task/busy-block
 * divergence rejects the entire batch. Never mutates task plannedDate, deadline,
 * recurrence series, habits or provider-owned events.
 */
import { db } from '../db/database'
import { timeBlockRepository } from '../repositories/timeBlockRepository'
import { planMultiDayTaskC3,type AllocationOptionsC3,type AllocationPlanC3 } from '../features/planner/calendarMultiSessionC3'
import type { TimeBlockEntity } from '../domain/models'
import type { UndoableMutation } from './undo'

const equal=(a:AllocationPlanC3,b:AllocationPlanC3)=>
 a.taskId===b.taskId&&a.taskRevision===b.taskRevision&&
 a.totalRemainingMinutes===b.totalRemainingMinutes&&
 JSON.stringify(a.slots.map(x=>[x.start,x.end,x.date,x.durationMinutes]))===
 JSON.stringify(b.slots.map(x=>[x.start,x.end,x.date,x.durationMinutes]))
const blockSnapshot=async()=>db.timeBlocks.toArray()
export const calendarBatchAllocationC3={
 async preview(taskId:string,options:AllocationOptionsC3){
  const task=await db.tasks.get(taskId)
  if(!task||task.status!=='todo'||task.deletedAt)throw new Error('This task can no longer be scheduled.')
  return planMultiDayTaskC3(task,await blockSnapshot(),options)
 },
 async apply(preview:AllocationPlanC3,options:AllocationOptionsC3):Promise<{blocks:TimeBlockEntity[];undo:UndoableMutation}>{
  if(!preview.slots.length)throw new Error('No available time slots to schedule.')
  const created=await db.transaction('rw',db.tasks,db.timeBlocks,async()=>{
   const task=await db.tasks.get(preview.taskId)
   if(!task||task.status!=='todo'||task.deletedAt)throw new Error('Task changed; review the plan again.')
   const fresh=planMultiDayTaskC3(task,await blockSnapshot(),options)
   if(!equal(fresh,preview))throw new Error('The task or calendar changed; review the refreshed plan before applying.')
   const result:TimeBlockEntity[]=[]
   for(const slot of fresh.slots){
    const block=await timeBlockRepository.create({
     taskId:task.id,title:task.title,kind:'task',source:'folio',
     start:slot.start,end:slot.end,timeZone:options.timeZone,allDay:false
    })
    result.push(block)
   }
   return result
  })
  return {blocks:created,undo:{
   message:created.length+' Folio work sessions scheduled',
   undo:async()=>db.transaction('rw',db.timeBlocks,async()=>{
    for(const block of created){
     const current=await db.timeBlocks.get(block.id)
     if(!current||JSON.stringify(current)!==JSON.stringify(block))
      throw new Error('A scheduled session changed; undo would erase a newer edit.')
    }
    await db.timeBlocks.bulkDelete(created.map(b=>b.id))
   })
  }}
 }
}
