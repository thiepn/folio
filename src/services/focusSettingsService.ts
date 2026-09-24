import { focusGoalsSchema, focusTemplateDefinitionSchema } from '../domain/schemas'
import type { FocusTemplateDefinition } from '../domain/models'
import { settingsRepository } from '../repositories/settingsRepository'

export interface FocusGoals { dailyMinutes: number; weeklyMinutes: number }
export const DEFAULT_FOCUS_GOALS: FocusGoals = { dailyMinutes: 60, weeklyMinutes: 300 }

export const BUILTIN_FOCUS_TEMPLATES: FocusTemplateDefinition[] = [
  { id:'builtin-open', name:'Open focus', mode:'stopwatch', plannedMinutes:45, tags:[], builtin:true },
  { id:'builtin-25-5', name:'Pomodoro 25 / 5', mode:'pomodoro', workMinutes:25, shortBreakMinutes:5, longBreakMinutes:15, cyclesBeforeLongBreak:4, tags:['pomodoro'], builtin:true },
  { id:'builtin-50-10', name:'Deep work 50 / 10', mode:'pomodoro', workMinutes:50, shortBreakMinutes:10, longBreakMinutes:20, cyclesBeforeLongBreak:3, tags:['deep-work'], builtin:true },
  { id:'builtin-90', name:'90-minute block', mode:'countdown', targetMinutes:90, plannedMinutes:90, tags:['deep-work'], builtin:true },
]

function normalizeTemplates(value: unknown): FocusTemplateDefinition[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item)=>{ const parsed=focusTemplateDefinitionSchema.safeParse(item); return parsed.success?[parsed.data as FocusTemplateDefinition]:[] })
}

export const focusSettingsService = {
  async getGoals(): Promise<FocusGoals> {
    const raw=await settingsRepository.get<unknown>('focus.goals',DEFAULT_FOCUS_GOALS)
    const parsed=focusGoalsSchema.safeParse(raw)
    return parsed.success?parsed.data:DEFAULT_FOCUS_GOALS
  },
  async setGoals(goals: FocusGoals) {
    await settingsRepository.set('focus.goals',focusGoalsSchema.parse(goals))
  },
  async listTemplates() {
    const custom=normalizeTemplates(await settingsRepository.get<unknown>('focus.templates',[]))
    return [...BUILTIN_FOCUS_TEMPLATES,...custom]
  },
  async saveTemplate(input: Omit<FocusTemplateDefinition,'id'|'builtin'>) {
    const row=focusTemplateDefinitionSchema.parse({...input,id:crypto.randomUUID(),builtin:false}) as FocusTemplateDefinition
    const custom=normalizeTemplates(await settingsRepository.get<unknown>('focus.templates',[]))
    await settingsRepository.set('focus.templates',[...custom,row])
    return row
  },
  async removeTemplate(id:string) {
    if(id.startsWith('builtin-')) throw new Error('Built-in Focus presets cannot be deleted.')
    const custom=normalizeTemplates(await settingsRepository.get<unknown>('focus.templates',[]))
    const found=custom.find((item)=>item.id===id)
    if(!found) return
    await settingsRepository.set('focus.templates',custom.filter((item)=>item.id!==id))
    return found
  },
}
