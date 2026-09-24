import { db } from '../db/database'
import type {
  FolioTemplateDefinition, ListEntity, NoteEntity, ProjectEntity, ReviewRecordEntity,
  SectionEntity, TaskEntity,
} from '../domain/models'
import { deserializeAttachment, serializeAttachment, type PortableAttachment } from './attachmentService'
import { contentSearchService } from './contentSearchService'
import { noteRepository } from '../repositories/noteRepository'
import { organizationRepository } from '../repositories/organizationRepository'
import { projectRepository } from '../repositories/projectRepository'
import { reviewRecordRepository } from '../repositories/reviewRecordRepository'
import { taskRepository } from '../repositories/taskRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { templateService } from './templateService'
import type { UndoableMutation } from './undo'

export type CollaborationScope='task'|'project'|'list'|'review'|'template'
export type CollaborationAccess='view'|'copy'

export interface CollaborationPackage {
  format:'folio-share'
  version:1
  shareId:string
  createdAt:string
  title:string
  message?:string
  scope:CollaborationScope
  access:CollaborationAccess
  payload:{
    project?:ProjectEntity
    list?:ListEntity
    sections?:SectionEntity[]
    tasks?:TaskEntity[]
    notes?:NoteEntity[]
    attachments?:PortableAttachment[]
    review?:ReviewRecordEntity
    template?:FolioTemplateDefinition
  }
}

export interface CollaborationPreview {
  package:CollaborationPackage
  counts:{tasks:number;notes:number;attachments:number;sections:number}
  warnings:string[]
  importable:boolean
}

export interface CollaborationHistoryEntry {
  id:string
  direction:'sent'|'received'
  shareId:string
  title:string
  scope:CollaborationScope
  access:CollaborationAccess
  at:string
  status:'shared'|'imported'|'viewed'
}

const HISTORY_KEY='collaboration.history.v1'
const MAX_HISTORY=100
const MAX_PACKAGE_TEXT=60*1024*1024

function now(){return new Date().toISOString()}
function clone<T>(value:T):T{return structuredClone(value)}
function validScope(value:unknown):value is CollaborationScope{return ['task','project','list','review','template'].includes(String(value))}
function validAccess(value:unknown):value is CollaborationAccess{return value==='view'||value==='copy'}

function descendants(rootId:string,tasks:TaskEntity[]){
  const result:TaskEntity[]=[]
  const queue=[rootId]
  const seen=new Set<string>()
  while(queue.length){
    const id=queue.shift()!
    if(seen.has(id))continue
    seen.add(id)
    const task=tasks.find((item)=>item.id===id)
    if(task)result.push(task)
    for(const child of tasks.filter((item)=>item.parentTaskId===id))queue.push(child.id)
  }
  return result
}

async function contextForTasks(tasks:TaskEntity[],includeAttachments:boolean){
  const taskIds=new Set(tasks.map((task)=>task.id))
  const notes=(await db.notes.toArray()).filter((note)=>note.sourceTaskId&&taskIds.has(note.sourceTaskId))
  const noteIds=new Set(notes.map((note)=>note.id))
  const attachments=includeAttachments
    ? (await db.attachments.toArray()).filter((item)=>item.ownerType==='task'?taskIds.has(item.ownerId):noteIds.has(item.ownerId))
    : []
  return {notes,attachments:includeAttachments?await Promise.all(attachments.map(serializeAttachment)):[]}
}

function packageTitle(scope:CollaborationScope,entity:any){
  if(scope==='task')return entity.title
  if(scope==='project')return entity.name
  if(scope==='list')return entity.name
  if(scope==='review')return entity.title
  return entity.name
}

async function historyRows(){
  const value=await settingsRepository.get<unknown>(HISTORY_KEY,[])
  if(!Array.isArray(value))return[]
  return value.filter((row):row is CollaborationHistoryEntry=>Boolean(row&&typeof row==='object'&&typeof (row as any).id==='string'&&typeof (row as any).shareId==='string')).slice(0,MAX_HISTORY)
}
async function addHistory(entry:Omit<CollaborationHistoryEntry,'id'|'at'>){
  const rows=await historyRows()
  await settingsRepository.set(HISTORY_KEY,[{...entry,id:crypto.randomUUID(),at:now()},...rows].slice(0,MAX_HISTORY))
}

function plainTask(task:TaskEntity){
  return {
    title:task.title,description:task.description,priority:task.priority,status:task.status==='cancelled'?'todo':task.status,
    plannedDate:task.plannedDate,deadline:task.deadline,timelineStart:task.timelineStart,timelineEnd:task.timelineEnd,timelineMilestone:task.timelineMilestone,
    estimatedMinutes:task.estimatedMinutes,tags:[...(task.tags??[])],checklist:(task.checklist??[]).map((item)=>({...item,id:crypto.randomUUID()})),
    progressMode:task.progressMode,progressPercent:task.progressPercent,sourceUrl:task.sourceUrl,location:task.location,pinned:task.pinned,
    comments:(task.comments??[]).map((comment)=>({...comment,id:crypto.randomUUID()})),blockedByTaskIds:[] as string[],
  }
}

async function importTasks(tasks:TaskEntity[],maps:{projectId?:string;listId?:string;sectionIds:Map<string,string>},createdIds:string[]){
  const pending=[...tasks].sort((a,b)=>a.sortOrder-b.sortOrder)
  const idMap=new Map<string,string>()
  let guard=0
  while(pending.length&&guard<tasks.length+5){
    guard++
    let progressed=false
    for(let i=pending.length-1;i>=0;i--){
      const source=pending[i]
      if(source.parentTaskId&&!idMap.has(source.parentTaskId))continue
      const task=await taskRepository.create({
        ...plainTask(source),
        projectId:maps.projectId,
        listId:maps.listId,
        sectionId:source.sectionId?maps.sectionIds.get(source.sectionId):undefined,
        parentTaskId:source.parentTaskId?idMap.get(source.parentTaskId):undefined,
      })
      idMap.set(source.id,task.id);createdIds.push(task.id);pending.splice(i,1);progressed=true
    }
    if(!progressed)break
  }
  if(pending.length)throw new Error('Shared task hierarchy is invalid.')
  return idMap
}

async function importNotes(notes:NoteEntity[],taskMap:Map<string,string>,createdIds:string[]){
  const noteMap=new Map<string,string>()
  for(const source of notes){
    const note=await noteRepository.create({title:source.title,body:source.body,sourceTaskId:source.sourceTaskId?taskMap.get(source.sourceTaskId):undefined})
    noteMap.set(source.id,note.id);createdIds.push(note.id)
  }
  return noteMap
}

async function importAttachments(attachments:PortableAttachment[],taskMap:Map<string,string>,noteMap:Map<string,string>){
  const rows=[]
  for(const source of attachments){
    const ownerId=source.ownerType==='task'?taskMap.get(source.ownerId):noteMap.get(source.ownerId)
    if(!ownerId)continue
    rows.push({...deserializeAttachment(source),id:crypto.randomUUID(),ownerId,createdAt:now(),updatedAt:now()})
  }
  if(rows.length)await db.attachments.bulkAdd(rows)
  for(const [source,target] of taskMap)void source,await contentSearchService.rebuildOwner('task',target)
  for(const [source,target] of noteMap)void source,await contentSearchService.rebuildOwner('note',target)
}

export const collaborationService={
  async listHistory(){return historyRows()},
  async clearHistory(){await settingsRepository.set(HISTORY_KEY,[])},
  async recordViewed(pkg:CollaborationPackage){await addHistory({direction:'received',shareId:pkg.shareId,title:pkg.title,scope:pkg.scope,access:pkg.access,status:'viewed'})},

  async createPackage(input:{scope:CollaborationScope;entityId:string;access:CollaborationAccess;message?:string;includeAttachments?:boolean}):Promise<CollaborationPackage>{
    const allTasks=await db.tasks.toArray()
    const payload:CollaborationPackage['payload']={}
    let entity:any
    if(input.scope==='task'){
      entity=await taskRepository.get(input.entityId);if(!entity||entity.deletedAt)throw new Error('Task not found.')
      payload.tasks=descendants(entity.id,allTasks)
      Object.assign(payload,await contextForTasks(payload.tasks,Boolean(input.includeAttachments)))
    }else if(input.scope==='project'){
      entity=await projectRepository.get(input.entityId);if(!entity)throw new Error('Project not found.')
      payload.project=clone(entity)
      payload.tasks=allTasks.filter((task)=>task.projectId===entity.id&&!task.deletedAt&&task.status!=='cancelled')
      Object.assign(payload,await contextForTasks(payload.tasks,Boolean(input.includeAttachments)))
    }else if(input.scope==='list'){
      entity=await organizationRepository.getList(input.entityId);if(!entity)throw new Error('List not found.')
      payload.list=clone(entity)
      payload.sections=(await organizationRepository.listSections(true)).filter((section)=>section.listId===entity.id)
      payload.tasks=allTasks.filter((task)=>task.listId===entity.id&&!task.deletedAt&&task.status!=='cancelled')
      Object.assign(payload,await contextForTasks(payload.tasks,Boolean(input.includeAttachments)))
    }else if(input.scope==='review'){
      entity=await reviewRecordRepository.get(input.entityId);if(!entity)throw new Error('Review not found.')
      payload.review=clone(entity)
    }else{
      entity=await templateService.get(input.entityId);if(!entity)throw new Error('Template not found.')
      payload.template=clone(entity)
    }
    const pkg:CollaborationPackage={format:'folio-share',version:1,shareId:crypto.randomUUID(),createdAt:now(),title:packageTitle(input.scope,entity),message:input.message?.trim()||undefined,scope:input.scope,access:input.access,payload}
    await addHistory({direction:'sent',shareId:pkg.shareId,title:pkg.title,scope:pkg.scope,access:pkg.access,status:'shared'})
    return pkg
  },

  parse(value:unknown):CollaborationPreview{
    const raw=typeof value==='string'?(()=>{if(value.length>MAX_PACKAGE_TEXT)throw new Error('Share package is too large to preview safely.');return JSON.parse(value)})():value
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Share package must be a JSON object.')
    const pkg=raw as CollaborationPackage
    if(pkg.format!=='folio-share'||pkg.version!==1)throw new Error('Unsupported Folio share package.')
    if(typeof pkg.shareId!=='string'||typeof pkg.createdAt!=='string'||typeof pkg.title!=='string'||!validScope(pkg.scope)||!validAccess(pkg.access)||!pkg.payload||typeof pkg.payload!=='object')throw new Error('Share package metadata is invalid.')
    const tasks=Array.isArray(pkg.payload.tasks)?pkg.payload.tasks:[]
    const notes=Array.isArray(pkg.payload.notes)?pkg.payload.notes:[]
    const attachments=Array.isArray(pkg.payload.attachments)?pkg.payload.attachments:[]
    const sections=Array.isArray(pkg.payload.sections)?pkg.payload.sections:[]
    const warnings:string[]=[]
    if(pkg.scope==='task'&&!tasks.length)throw new Error('Shared task package has no task.')
    if(pkg.scope==='project'&&!pkg.payload.project)throw new Error('Shared project package has no project.')
    if(pkg.scope==='list'&&!pkg.payload.list)throw new Error('Shared list package has no list.')
    if(pkg.scope==='review'&&!pkg.payload.review)throw new Error('Shared review package has no review.')
    if(pkg.scope==='template'&&!pkg.payload.template)throw new Error('Shared template package has no template.')
    const taskIds=new Set(tasks.map((task)=>task.id))
    for(const task of tasks)if(task.parentTaskId&&!taskIds.has(task.parentTaskId))warnings.push('A shared task references a parent outside this package and will be rejected on import.')
    if(pkg.access==='view')warnings.push('View-only package: preview is allowed, but importing is disabled.')
    if(attachments.length)warnings.push(attachments.length+' attachment'+(attachments.length===1?'':'s')+' will be copied into local storage.')
    return {package:pkg,counts:{tasks:tasks.length,notes:notes.length,attachments:attachments.length,sections:sections.length},warnings,importable:pkg.access==='copy'}
  },

  async importPackage(preview:CollaborationPreview):Promise<{undo:UndoableMutation;open?:{type:'task'|'project'|'list'|'review'|'template';id:string}}>{
    if(!preview.importable)throw new Error('This package is view-only and cannot be imported.')
    const pkg=preview.package
    const createdTaskIds:string[]=[],createdNoteIds:string[]=[],sectionIds:string[]=[],createdAttachmentIds:string[]=[]
    let createdProjectId:string|undefined,createdListId:string|undefined,createdReviewId:string|undefined,createdTemplateId:string|undefined
    let taskMap=new Map<string,string>(),noteMap=new Map<string,string>()
    try{
      if(pkg.scope==='project'&&pkg.payload.project){
        const p=pkg.payload.project
        const created=await projectRepository.create({name:p.name,description:p.description,notes:p.notes,color:p.color,icon:p.icon,type:p.type,status:'active',deadline:p.deadline,favorite:false,examDate:p.type==='academic'?p.examDate:undefined,weeklyTargetMinutes:p.type==='academic'?p.weeklyTargetMinutes:undefined})
        createdProjectId=created.id
        if(p.milestones?.length){
          const stamp=now()
          await projectRepository.replaceWithMilestones(created.id,p.milestones.map((m,index)=>({...m,id:crypto.randomUUID(),completedAt:undefined,sortOrder:index,createdAt:stamp,updatedAt:stamp})),{id:crypto.randomUUID(),kind:'project',label:'Imported from shared package',at:stamp})
        }
      }
      const sectionMap=new Map<string,string>()
      if(pkg.scope==='list'&&pkg.payload.list){
        const l=pkg.payload.list
        const list=await organizationRepository.createList({name:l.name,description:l.description,color:l.color,icon:l.icon,favorite:false,sortMode:l.sortMode,groupMode:l.groupMode,showCompleted:l.showCompleted})
        createdListId=list.id
        for(const section of pkg.payload.sections??[]){
          const created=await organizationRepository.createSection({listId:list.id,name:section.name,sortOrder:section.sortOrder})
          sectionMap.set(section.id,created.id);sectionIds.push(created.id)
        }
      }
      if(pkg.payload.tasks?.length)taskMap=await importTasks(pkg.payload.tasks,{projectId:createdProjectId,listId:createdListId,sectionIds:sectionMap},createdTaskIds)
      if(pkg.payload.notes?.length)noteMap=await importNotes(pkg.payload.notes,taskMap,createdNoteIds)
      if(pkg.payload.attachments?.length){
        const before=new Set((await db.attachments.toArray()).map((a)=>a.id))
        await importAttachments(pkg.payload.attachments,taskMap,noteMap)
        createdAttachmentIds.push(...(await db.attachments.toArray()).filter((a)=>!before.has(a.id)).map((a)=>a.id))
      }
      if(pkg.scope==='review'&&pkg.payload.review){
        const source=pkg.payload.review
        const stamp=now(),id=crypto.randomUUID()
        await reviewRecordRepository.put({...source,id,title:source.title+' · shared copy',createdAt:stamp,updatedAt:stamp,completedAt:stamp})
        createdReviewId=id
      }
      if(pkg.scope==='template'&&pkg.payload.template){
        const source=pkg.payload.template
        const created=source.kind==='task'
          ? await templateService.saveTaskDefinition({name:source.name+' · shared',description:source.description,root:clone(source.root)})
          : await templateService.saveProjectDefinition({name:source.name+' · shared',description:source.description,project:clone(source.project),milestones:clone(source.milestones),tasks:clone(source.tasks)})
        createdTemplateId=created.id
      }
      await contentSearchService.rebuildAll()
    }catch(error){
      if(createdAttachmentIds.length)await db.attachments.bulkDelete(createdAttachmentIds)
      for(const id of createdNoteIds)await noteRepository.removePermanently(id)
      if(createdTaskIds.length)await taskRepository.removePermanently(createdTaskIds)
      if(sectionIds.length)await db.sections.bulkDelete(sectionIds)
      if(createdListId)await db.lists.delete(createdListId)
      if(createdProjectId)await db.projects.delete(createdProjectId)
      if(createdReviewId)await reviewRecordRepository.remove(createdReviewId)
      if(createdTemplateId){try{await templateService.remove(createdTemplateId)}catch{}}
      await contentSearchService.rebuildAll()
      throw error
    }
    await addHistory({direction:'received',shareId:pkg.shareId,title:pkg.title,scope:pkg.scope,access:pkg.access,status:'imported'})
    const undo:UndoableMutation={message:'Shared package imported',undo:async()=>{
      if(createdAttachmentIds.length)await db.attachments.bulkDelete(createdAttachmentIds)
      for(const id of createdNoteIds)await noteRepository.removePermanently(id)
      if(createdTaskIds.length)await taskRepository.removePermanently(createdTaskIds)
      if(sectionIds.length)await db.sections.bulkDelete(sectionIds)
      if(createdListId)await db.lists.delete(createdListId)
      if(createdProjectId)await db.projects.delete(createdProjectId)
      if(createdReviewId)await reviewRecordRepository.remove(createdReviewId)
      if(createdTemplateId){try{await templateService.remove(createdTemplateId)}catch{}}
      await contentSearchService.rebuildAll()
    }}
    const open=createdProjectId?{type:'project' as const,id:createdProjectId}:createdListId?{type:'list' as const,id:createdListId}:createdTaskIds[0]?{type:'task' as const,id:createdTaskIds[0]}:createdReviewId?{type:'review' as const,id:createdReviewId}:createdTemplateId?{type:'template' as const,id:createdTemplateId}:undefined
    return {undo,open}
  },

  summary(pkg:CollaborationPackage){
    const lines=['# '+pkg.title,'',pkg.message??'',pkg.scope.toUpperCase()+' · '+(pkg.access==='view'?'View only':'Copy allowed'),'']
    for(const task of pkg.payload.tasks??[])lines.push('- ['+(task.status==='completed'?'x':' ')+'] '+task.title+(task.deadline?' · due '+task.deadline:''))
    if(pkg.payload.project)lines.push('Project: '+pkg.payload.project.name)
    if(pkg.payload.list)lines.push('List: '+pkg.payload.list.name)
    if(pkg.payload.review)lines.push(pkg.payload.review.summary||pkg.payload.review.wins||'Shared review')
    if(pkg.payload.template)lines.push('Template: '+pkg.payload.template.name)
    return lines.filter((line,index)=>line||index<2).join('\n')
  },

  toFile(pkg:CollaborationPackage){return new File([JSON.stringify(pkg,null,2)],'folio-share-'+pkg.scope+'-'+pkg.shareId.slice(0,8)+'.json',{type:'application/json'})},
}
