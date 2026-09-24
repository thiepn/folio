import { z } from 'zod'
import { db } from '../db/database'
import { habitTemplateCreateSchema } from '../domain/schemas'
import type { HabitEntity, HabitTemplateEntity } from '../domain/models'

export type HabitTemplateCreateInput = z.input<typeof habitTemplateCreateSchema>

const BUILTIN_STAMP='2026-01-01T00:00:00.000Z'
export const BUILTIN_HABIT_TEMPLATES: HabitTemplateEntity[] = [
  {id:'builtin-daily-check',name:'Daily check-in',description:'A simple once-per-day rhythm.',kind:'check',target:1,schedule:{type:'daily'},countsTowardCapacity:false,builtin:true,createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP},
  {id:'builtin-read-pages',name:'Read 10 pages',description:'Track a measurable reading target.',kind:'quantity',target:10,unit:'pages',schedule:{type:'daily'},countsTowardCapacity:false,builtin:true,createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP},
  {id:'builtin-language',name:'Language practice',description:'Twenty minutes of deliberate language exposure.',kind:'duration',target:20,schedule:{type:'daily'},countsTowardCapacity:true,builtin:true,createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP},
  {id:'builtin-strength',name:'Strength training',description:'Three flexible sessions each week.',kind:'check',target:1,schedule:{type:'times-per-week',timesPerWeek:3},countsTowardCapacity:false,builtin:true,createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP},
]

export const habitTemplateRepository = {
  async listCustom(){return (await db.habitTemplates.toArray()).sort((a,b)=>a.name.localeCompare(b.name))},
  async listAll(){return [...BUILTIN_HABIT_TEMPLATES,...await this.listCustom()]},
  async get(id:string){return BUILTIN_HABIT_TEMPLATES.find((item)=>item.id===id)??db.habitTemplates.get(id)},
  async create(input:HabitTemplateCreateInput):Promise<HabitTemplateEntity>{
    const parsed=habitTemplateCreateSchema.parse(input),stamp=new Date().toISOString()
    const row:HabitTemplateEntity={id:crypto.randomUUID(),...parsed,unit:parsed.kind==='quantity'?(parsed.unit??'units'):undefined,countsTowardCapacity:parsed.kind==='duration'?parsed.countsTowardCapacity:false,createdAt:stamp,updatedAt:stamp}
    await db.habitTemplates.add(row);return row
  },
  async createFromHabit(habit:HabitEntity){return this.create({name:habit.title,description:habit.description,kind:habit.kind,target:habit.target,unit:habit.unit,color:habit.color,schedule:habit.schedule,countsTowardCapacity:habit.countsTowardCapacity})},
  async remove(id:string){if(id.startsWith('builtin-'))throw new Error('Built-in templates cannot be deleted.');await db.habitTemplates.delete(id)},
}
