import { addLocalDays, localDateKey } from '../domain/date'
import type { AutomationAction, AutomationCondition, AutomationRuleDefinition, AutomationRunLogEntry, AutomationTriggerType, TaskEntity, TaskPriority } from '../domain/models'
import { db } from '../db/database'
import { organizationRepository } from '../repositories/organizationRepository'
import { projectRepository } from '../repositories/projectRepository'
import { taskRepository } from '../repositories/taskRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { templateService } from './templateService'
import type { UndoableMutation } from './undo'

const RULES_KEY='automation.rules.v1'
const LOG_KEY='automation.log.v1'
const DAILY_KEYS='automation.daily.keys.v1'
const MAX_RULES=100
const MAX_LOGS=200
const running=new Set<string>()

function clone<T>(value:T):T{return structuredClone(value)}
function now(){return new Date().toISOString()}
function daysBetween(from:string,to:string){return Math.round((new Date(to+'T12:00:00').getTime()-new Date(from+'T12:00:00').getTime())/86_400_000)}

function validRules(value:unknown):AutomationRuleDefinition[]{
  if(!Array.isArray(value))return[]
  return value.flatMap((row)=>{
    if(!row||typeof row!=='object')return[]
    const rule=row as AutomationRuleDefinition
    if(typeof rule.id!=='string'||typeof rule.name!=='string'||!['task-created','task-completed','daily','manual'].includes(rule.trigger)||!Array.isArray(rule.actions))return[]
    return [{...rule,enabled:Boolean(rule.enabled),conditions:rule.conditions??{},actions:rule.actions.slice(0,10)}]
  }).slice(0,MAX_RULES)
}
function validLogs(value:unknown):AutomationRunLogEntry[]{
  if(!Array.isArray(value))return[]
  return value.filter((row):row is AutomationRunLogEntry=>Boolean(row&&typeof row==='object'&&typeof (row as any).id==='string'&&typeof (row as any).ruleId==='string'&&typeof (row as any).at==='string')).slice(0,MAX_LOGS)
}
async function readRules(){return validRules(await settingsRepository.get<unknown>(RULES_KEY,[]))}
async function writeRules(rows:AutomationRuleDefinition[]){await settingsRepository.set(RULES_KEY,rows.slice(0,MAX_RULES))}
async function readLogs(){return validLogs(await settingsRepository.get<unknown>(LOG_KEY,[]))}
async function log(entry:Omit<AutomationRunLogEntry,'id'|'at'>){
  const rows=await readLogs()
  await settingsRepository.set(LOG_KEY,[{...entry,id:crypto.randomUUID(),at:now()},...rows].slice(0,MAX_LOGS))
}
async function dailyKeys(){const raw=await settingsRepository.get<unknown>(DAILY_KEYS,[]);return Array.isArray(raw)?raw.filter((value):value is string=>typeof value==='string').slice(-1500):[]}
async function rememberDailyKey(value:string){const rows=await dailyKeys();await settingsRepository.set(DAILY_KEYS,[...rows.filter((item)=>item!==value),value].slice(-1500))}

function conditionMatches(task:TaskEntity,condition:AutomationCondition,today:string){
  if(condition.projectId&&task.projectId!==condition.projectId)return false
  if(condition.tagId&&!(task.tagIds??[]).includes(condition.tagId))return false
  if(condition.priority&&task.priority!==condition.priority)return false
  if(condition.status&&task.status!==condition.status)return false
  if(condition.titleContains&&!task.title.toLocaleLowerCase().includes(condition.titleContains.toLocaleLowerCase()))return false
  if(condition.hasDeadline===true&&!task.deadline)return false
  if(condition.hasDeadline===false&&task.deadline)return false
  if(condition.dueWithinDays!==undefined){
    if(!task.deadline)return false
    const days=daysBetween(today,task.deadline)
    if(days<0||days>condition.dueWithinDays)return false
  }
  return true
}

async function validateRule(rule:Omit<AutomationRuleDefinition,'id'|'createdAt'|'updatedAt'|'lastRunAt'>){
  const name=rule.name.trim()
  if(!name)throw new Error('Automation name is required.')
  if(!rule.actions.length)throw new Error('Add at least one automation action.')
  if(rule.actions.length>10)throw new Error('An automation can have at most 10 actions.')
  if(rule.conditions.dueWithinDays!==undefined&&(rule.conditions.dueWithinDays<0||rule.conditions.dueWithinDays>3650))throw new Error('Due-within condition must be between 0 and 3650 days.')
  for(const action of rule.actions){
    if(action.type==='move-project'&&action.projectId){
      const project=await projectRepository.get(action.projectId)
      if(!project||project.archived)throw new Error('Automation target project is unavailable.')
    }
    if(action.type==='move-list'&&action.listId){
      const list=await organizationRepository.getList(action.listId)
      if(!list||list.archived)throw new Error('Automation target list is unavailable.')
    }
    if(action.type==='create-task-template'){
      const template=await templateService.get(action.templateId)
      if(!template||template.kind!=='task')throw new Error('Automation task template is unavailable.')
    }
    if(action.type==='add-tag'&&!action.tagName.trim())throw new Error('Automation tag name is required.')
    if((action.type==='plan-offset'||action.type==='deadline-offset')&&(action.days<-3650||action.days>3650))throw new Error('Automation date offset is outside the supported range.')
  }
  return {...rule,name}
}

async function applyActions(rule:AutomationRuleDefinition,task:TaskEntity,today:string){
  const before=clone(task)
  const templateUndos:UndoableMutation[]=[]
  const messages:string[]=[]
  let current=task
  for(const action of rule.actions){
    if(action.type==='set-priority'){
      current=await taskRepository.update(current.id,{priority:action.priority})
      messages.push('priority → '+action.priority)
    }else if(action.type==='add-tag'){
      current=await taskRepository.update(current.id,{tags:[...(current.tags??[]),action.tagName]})
      messages.push('tag #'+action.tagName)
    }else if(action.type==='move-project'){
      current=await taskRepository.update(current.id,{projectId:action.projectId??null})
      messages.push(action.projectId?'project changed':'project cleared')
    }else if(action.type==='move-list'){
      current=await taskRepository.update(current.id,{listId:action.listId??null,sectionId:null})
      messages.push(action.listId?'list changed':'list cleared')
    }else if(action.type==='plan-offset'){
      current=await taskRepository.update(current.id,{plannedDate:addLocalDays(today,action.days),status:current.status==='inbox'?'todo':current.status})
      messages.push('planned '+(action.days===0?'today':(action.days>0?'+':'')+action.days+'d'))
    }else if(action.type==='deadline-offset'){
      current=await taskRepository.update(current.id,{deadline:addLocalDays(today,action.days)})
      messages.push('deadline '+(action.days===0?'today':(action.days>0?'+':'')+action.days+'d'))
    }else if(action.type==='create-task-template'){
      const created=await templateService.instantiateTask(action.templateId,{anchorDate:today,projectId:current.projectId})
      templateUndos.push(created.undo)
      messages.push('task template created')
    }
  }
  return {
    task:current,
    message:messages.join(' · ')||'No actions',
    undo:{message:'Automation run undone',undo:async()=>{for(const action of [...templateUndos].reverse())await action.undo();await taskRepository.replace(before)}} satisfies UndoableMutation,
  }
}

async function executeRule(rule:AutomationRuleDefinition,task:TaskEntity,trigger:AutomationTriggerType,today:string,recordSkip=false){
  const key=rule.id+':'+task.id+':'+trigger
  if(running.has(key))return null
  if(!conditionMatches(task,rule.conditions,today)){
    if(recordSkip)await log({ruleId:rule.id,ruleName:rule.name,trigger,status:'skipped',taskId:task.id,taskTitle:task.title,message:'Conditions did not match.'})
    return null
  }
  running.add(key)
  try{
    const result=await applyActions(rule,task,today)
    await log({ruleId:rule.id,ruleName:rule.name,trigger,status:'success',taskId:task.id,taskTitle:task.title,message:result.message})
    const rules=await readRules()
    const stored=rules.find((item)=>item.id===rule.id)
    if(stored)await writeRules(rules.map((item)=>item.id===rule.id?{...item,lastRunAt:now(),updatedAt:item.updatedAt}:item))
    return result
  }catch(error){
    await log({ruleId:rule.id,ruleName:rule.name,trigger,status:'error',taskId:task.id,taskTitle:task.title,message:error instanceof Error?error.message:'Automation failed.'})
    throw error
  }finally{running.delete(key)}
}

export const automationService={
  async listRules(){return readRules()},
  async listLogs(){return readLogs()},
  async clearLogs(){await settingsRepository.set(LOG_KEY,[])},

  async saveRule(input:{id?:string;name:string;enabled:boolean;trigger:AutomationTriggerType;conditions:AutomationCondition;actions:AutomationAction[]}){
    const validated=await validateRule({name:input.name,enabled:input.enabled,trigger:input.trigger,conditions:clone(input.conditions),actions:clone(input.actions)})
    const rows=await readRules(),existing=input.id?rows.find((item)=>item.id===input.id):undefined,stamp=now()
    const rule:AutomationRuleDefinition={id:existing?.id??crypto.randomUUID(),...validated,lastRunAt:existing?.lastRunAt,createdAt:existing?.createdAt??stamp,updatedAt:stamp}
    await writeRules([rule,...rows.filter((item)=>item.id!==rule.id)])
    return rule
  },

  async removeRule(id:string):Promise<UndoableMutation>{
    const rows=await readRules(),before=rows.find((item)=>item.id===id);if(!before)throw new Error('Automation not found.')
    await writeRules(rows.filter((item)=>item.id!==id))
    return {message:'Automation deleted',undo:async()=>writeRules([before,...await readRules()])}
  },

  async setEnabled(id:string,enabled:boolean){
    const rows=await readRules(),rule=rows.find((item)=>item.id===id);if(!rule)throw new Error('Automation not found.')
    await writeRules(rows.map((item)=>item.id===id?{...item,enabled,updatedAt:now()}:item))
  },

  async handleTaskEvent(trigger:'task-created'|'task-completed',taskId:string,today=localDateKey()):Promise<UndoableMutation|null>{
    const task=await taskRepository.get(taskId);if(!task)return null
    const rules=(await readRules()).filter((rule)=>rule.enabled&&rule.trigger===trigger)
    const undos:UndoableMutation[]=[]
    for(const rule of rules){
      try{
        const result=await executeRule(rule,await taskRepository.get(taskId)??task,trigger,today)
        if(result)undos.push(result.undo)
      }catch{/* Logged; source task mutation must still succeed. */}
    }
    if(!undos.length)return null
    return {message:'Automation side effects undone',undo:async()=>{for(const action of [...undos].reverse())await action.undo()}}
  },

  async runDaily(today=localDateKey()){
    const rules=(await readRules()).filter((rule)=>rule.enabled&&rule.trigger==='daily')
    if(!rules.length)return
    const tasks=(await taskRepository.listRootTasks()).filter((task)=>!task.deletedAt&&(task.status==='todo'||task.status==='inbox'))
    const remembered=new Set(await dailyKeys())
    for(const rule of rules){
      for(const task of tasks){
        const key=today+':'+rule.id+':'+task.id
        if(remembered.has(key))continue
        try{await executeRule(rule,await taskRepository.get(task.id)??task,'daily',today)}catch{/* Error already logged. */}
        await rememberDailyKey(key)
        remembered.add(key)
      }
    }
  },

  async runManual(ruleId:string,taskId:string,today=localDateKey()){
    const rule=(await readRules()).find((item)=>item.id===ruleId);if(!rule)throw new Error('Automation not found.')
    const task=await taskRepository.get(taskId);if(!task||task.deletedAt)throw new Error('Task not found.')
    const result=await executeRule(rule,task,'manual',today,true)
    if(!result)throw new Error('Automation conditions did not match this task.')
    return result.undo
  },
}
