import { taskRepository } from '../repositories/taskRepository'
import { taskService } from './taskService'
import type { UndoableMutation } from './undo'

export const FOLIO_HUB_TASK_ACTION_MESSAGE = 'thiepn:folio-hub-task-actions:v1' as const
export const FOLIO_HUB_TASK_WRITE_GRANT_KEY = 'folio:hub:task-write-consent:v1' as const

export type HubTaskAction =
  | {kind:'create';title:string;status:'todo'|'inbox';priority:'normal'|'high'|'critical';plannedDate?:string}
  | {kind:'complete'|'reopen';taskId:string;expectedUpdatedAt:string}
  | {kind:'reschedule';taskId:string;expectedUpdatedAt:string;plannedDate:string|null}
  | {kind:'undo';undoId:string}
export type HubTaskActionResult =
  | {ok:true;message:string;taskId:string;updatedAt:string;undoId?:string}
  | {ok:false;code:'invalid'|'conflict'|'missing'|'forbidden'|'unavailable';message:string}

const day=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(new Date(value+'T12:00:00Z').getTime())&&
  new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
const text=(value:unknown,max:number):value is string=>
  typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value)
const iso=(value:unknown)=>text(value,64)&&!Number.isNaN(Date.parse(value))
const id=(value:unknown)=>text(value,128)
const priorities=['normal','high','critical']
export function parseHubTaskAction(value:unknown):HubTaskAction {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid task request')
  const x=value as Record<string,unknown>
  if(x.kind==='create'){
    if(!text(x.title,160)||!['todo','inbox'].includes(String(x.status))||
      !priorities.includes(String(x.priority))||
      (x.plannedDate!==undefined&&!day(x.plannedDate)))throw Error('Invalid create task request')
    return {kind:'create',title:x.title.trim(),status:x.status as 'todo'|'inbox',
      priority:x.priority as 'normal'|'high'|'critical',
      ...(x.plannedDate?{plannedDate:x.plannedDate as string}:{})}
  }
  if(x.kind==='complete'||x.kind==='reopen'){
    if(!id(x.taskId)||!iso(x.expectedUpdatedAt))throw Error('Invalid task version')
    return {kind:x.kind,taskId:x.taskId as string,expectedUpdatedAt:x.expectedUpdatedAt as string}
  }
  if(x.kind==='reschedule'){
    if(!id(x.taskId)||!iso(x.expectedUpdatedAt)||
      !(x.plannedDate===null||day(x.plannedDate)))throw Error('Invalid reschedule')
    return {kind:'reschedule',taskId:x.taskId as string,
      expectedUpdatedAt:x.expectedUpdatedAt as string,plannedDate:x.plannedDate as string|null}
  }
  if(x.kind==='undo'){
    if(!id(x.undoId))throw Error('Invalid undo request')
    return {kind:'undo',undoId:x.undoId as string}
  }
  throw Error('Unknown task action')
}

type SavedUndo={id:string;taskId:string;updatedAt:string;expiresAt:number;undo:UndoableMutation['undo']}
export class FolioHubTaskActions {
  private previous:SavedUndo|null=null
  private busy=false

  reset(){this.previous=null}
  /** No retry on an unconfirmed outcome. Source service owns all task side effects. */
  async execute(raw:unknown):Promise<HubTaskActionResult>{
    if(this.busy)return {ok:false,code:'unavailable',message:'A Folio task action is still running'}
    let action:HubTaskAction
    try{action=parseHubTaskAction(raw)}
    catch{return {ok:false,code:'invalid',message:'Invalid Folio action request'}}
    this.busy=true
    try {
      if(action.kind==='undo'){
        const prior=this.previous
        if(!prior||prior.id!==action.undoId||Date.now()>=prior.expiresAt)
          return {ok:false,code:'conflict',message:'Undo expired. Check the task in Folio'}
        const current=await taskRepository.get(prior.taskId)
        if(!current||current.updatedAt!==prior.updatedAt)
          return {ok:false,code:'conflict',message:'The task changed. Open Folio to review before undoing'}
        this.previous=null
        await prior.undo()
        return {ok:true,message:'Last Folio action undone',taskId:prior.taskId,
          updatedAt:(await taskRepository.get(prior.taskId))?.updatedAt??''}
      }
      if(action.kind==='create'){
        if(!action.title.trim())return {ok:false,code:'invalid',message:'Enter a task title'}
        const created=await taskService.createUndoable({
          title:action.title,status:action.status,priority:action.priority,
          ...(action.status==='todo'&&action.plannedDate?{plannedDate:action.plannedDate}:{}),
        })
        this.previous={id:crypto.randomUUID(),taskId:created.task.id,updatedAt:created.task.updatedAt,
          expiresAt:Date.now()+90_000,undo:created.undo.undo}
        return {ok:true,message:created.undo.message,taskId:created.task.id,
          updatedAt:created.task.updatedAt,undoId:this.previous.id}
      }
      const current=await taskRepository.get(action.taskId)
      if(!current||current.deletedAt||current.status==='cancelled')
        return {ok:false,code:'missing',message:'Task was removed in Folio'}
      if(current.updatedAt!==action.expectedUpdatedAt)
        return {ok:false,code:'conflict',message:'Task changed in Folio. Refresh and review before retrying'}
      if(action.kind==='complete'&&current.status==='completed'||
         action.kind==='reopen'&&current.status!=='completed')
        return {ok:false,code:'conflict',message:'Task status changed. Refresh first'}
      let mutation:UndoableMutation
      if(action.kind==='complete'||action.kind==='reopen'){
        mutation=await taskService.setCompleted(action.taskId,action.kind==='complete')
      } else {
        if(current.status!=='todo'&&current.status!=='inbox')
          return {ok:false,code:'conflict',message:'Only open tasks can be rescheduled'}
        mutation=await taskService.reschedule(action.taskId,action.plannedDate??undefined)
      }
      const updated=await taskRepository.get(action.taskId)
      if(!updated)throw Error('Task disappeared after update')
      this.previous={id:crypto.randomUUID(),taskId:updated.id,updatedAt:updated.updatedAt,
        expiresAt:Date.now()+90_000,undo:mutation.undo}
      return {ok:true,message:mutation.message,taskId:updated.id,
        updatedAt:updated.updatedAt,undoId:this.previous.id}
    } catch {
      // The source may have written before a downstream automation threw.
      // Never suggest a blind retry when completion cannot be proven.
      this.previous=null
      return {ok:false,code:'unavailable',message:'Outcome uncertain. Open Folio to review before retrying'}
    } finally {this.busy=false}
  }
}
