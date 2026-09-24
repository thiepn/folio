import { habitGroupRepository, type HabitGroupCreateInput, type HabitGroupUpdateInput } from '../repositories/habitGroupRepository'
import type { UndoableMutation } from './undo'

export const habitGroupService = {
  async create(input:HabitGroupCreateInput){
    const group=await habitGroupRepository.create(input)
    return {group,undo:{message:'Habit group created',undo:async()=>habitGroupRepository.remove(group.id)} satisfies UndoableMutation}
  },
  async update(id:string,input:HabitGroupUpdateInput):Promise<UndoableMutation>{
    const previous=await habitGroupRepository.get(id); if(!previous) throw new Error('Habit group not found.')
    await habitGroupRepository.update(id,input)
    return {message:'Habit group updated',undo:async()=>habitGroupRepository.replace(previous)}
  },
  async remove(id:string):Promise<UndoableMutation>{
    const previous=await habitGroupRepository.get(id); if(!previous) throw new Error('Habit group not found.')
    const { db } = await import('../db/database')
    const habitSnapshots=(await db.habits.where('groupId').equals(id).toArray()).map((habit)=>({...habit}))
    await habitGroupRepository.remove(id)
    return {message:'Habit group removed',undo:async()=>{await habitGroupRepository.replace(previous);if(habitSnapshots.length)await db.habits.bulkPut(habitSnapshots)}}
  },
}
