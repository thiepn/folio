import { z } from 'zod'
import { db } from '../db/database'
import { habitGroupCreateSchema, habitGroupUpdateSchema } from '../domain/schemas'
import type { HabitGroupEntity } from '../domain/models'

export type HabitGroupCreateInput = z.input<typeof habitGroupCreateSchema>
export type HabitGroupUpdateInput = z.input<typeof habitGroupUpdateSchema>

export const habitGroupRepository = {
  async listAll() { return (await db.habitGroups.toArray()).sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name)) },
  async get(id:string) { return db.habitGroups.get(id) },
  async create(input:HabitGroupCreateInput):Promise<HabitGroupEntity> {
    const parsed=habitGroupCreateSchema.parse(input), stamp=new Date().toISOString()
    const group:HabitGroupEntity={id:crypto.randomUUID(),name:parsed.name,color:parsed.color,sortOrder:parsed.sortOrder??Date.now(),collapsed:parsed.collapsed,createdAt:stamp,updatedAt:stamp}
    await db.habitGroups.add(group); return group
  },
  async update(id:string,input:HabitGroupUpdateInput):Promise<HabitGroupEntity> {
    const current=await db.habitGroups.get(id); if(!current) throw new Error('Habit group not found.')
    const parsed=habitGroupUpdateSchema.parse(input)
    const next={...current,...parsed,updatedAt:new Date().toISOString()}
    await db.habitGroups.put(next); return next
  },
  async replace(group:HabitGroupEntity){await db.habitGroups.put(group)},
  async remove(id:string){
    await db.transaction('rw',db.habitGroups,db.habits,async()=>{
      await db.habitGroups.delete(id)
      const habits=await db.habits.where('groupId').equals(id).toArray()
      await Promise.all(habits.map((habit)=>db.habits.put({...habit,groupId:undefined,updatedAt:new Date().toISOString()})))
    })
  },
}
