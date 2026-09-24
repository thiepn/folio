import type { HabitTemplateEntity } from '../domain/models'
import { habitTemplateRepository } from '../repositories/habitTemplateRepository'
import type { HabitCreateInput } from '../repositories/habitRepository'
import type { UndoableMutation } from './undo'

export function habitInputFromTemplate(template:HabitTemplateEntity,groupId?:string):HabitCreateInput{
  return {title:template.name,description:template.description,kind:template.kind,target:template.target,unit:template.unit,color:template.color,groupId,schedule:template.schedule,countsTowardCapacity:template.countsTowardCapacity}
}
export const habitTemplateService={
  async saveFromHabit(habitId:string):Promise<UndoableMutation>{
    const { db }=await import('../db/database')
    const habit=await db.habits.get(habitId);if(!habit)throw new Error('Habit not found.')
    const template=await habitTemplateRepository.createFromHabit(habit)
    return {message:'Habit template saved',undo:async()=>habitTemplateRepository.remove(template.id)}
  },
  async remove(id:string):Promise<UndoableMutation>{
    const template=await habitTemplateRepository.get(id);if(!template||template.builtin)throw new Error('Custom template not found.')
    await habitTemplateRepository.remove(id)
    return {message:'Habit template removed',undo:async()=>{const { db }=await import('../db/database');await db.habitTemplates.put(template)}}
  },
}
