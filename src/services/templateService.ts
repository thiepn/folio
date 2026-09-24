import { addLocalDays, localDateKey } from '../domain/date'
import type {
  FolioTemplateDefinition, ProjectEntity, ProjectMilestone, ProjectTemplateDefinition,
  TaskEntity, TaskTemplateDefinition, TaskTemplateNode,
} from '../domain/models'
import { db } from '../db/database'
import { projectRepository } from '../repositories/projectRepository'
import { taskRepository } from '../repositories/taskRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { contentSearchService } from './contentSearchService'
import type { UndoableMutation } from './undo'

const CUSTOM_KEY='templates.custom.v1'
const BUILTIN_STAMP='2026-01-01T00:00:00.000Z'

export const BUILTIN_TEMPLATES: FolioTemplateDefinition[]=[
  {id:'builtin-task-deep-work',kind:'task',name:'Deep work block',description:'A focused task with a concrete definition of done.',root:{title:'Deep work',description:'Define the outcome before starting.',priority:'high',estimatedMinutes:60,tags:['deep-work'],checklist:['Define outcome','Do the focused work','Capture next action'],children:[]},createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP,builtin:true},
  {id:'builtin-task-meeting-followup',kind:'task',name:'Meeting follow-up',description:'Turn a meeting into explicit follow-up actions.',root:{title:'Meeting follow-up',description:'Capture decisions, owners, and next actions.',priority:'normal',estimatedMinutes:20,tags:['follow-up'],checklist:['Write decisions','Send promised material','Create delegated follow-ups'],plannedOffsetDays:0,children:[]},createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP,builtin:true},
  {id:'builtin-project-exam-prep',kind:'project',name:'Exam preparation',description:'Academic project with staged preparation tasks.',project:{name:'Exam preparation',description:'Prepare deliberately for an upcoming exam.',notes:'Set the exam date after creating the project.',type:'academic',weeklyTargetMinutes:300},milestones:[{title:'Finish first content pass',dueOffsetDays:14},{title:'Begin mock exams',dueOffsetDays:21}],tasks:[
    {title:'Map syllabus and materials',description:'List examinable topics and source material.',priority:'high',estimatedMinutes:45,tags:['exam'],checklist:[],plannedOffsetDays:0,children:[]},
    {title:'Build first revision pass',description:'Work through the full examinable content.',priority:'high',tags:['exam'],checklist:[],plannedOffsetDays:1,deadlineOffsetDays:14,children:[]},
    {title:'Run mock exams and error review',description:'Use timed mocks and turn errors into targeted revision.',priority:'critical',tags:['exam'],checklist:['Timed mock','Mark errors','Revise weak areas'],plannedOffsetDays:14,deadlineOffsetDays:28,children:[]},
  ],createdAt:BUILTIN_STAMP,updatedAt:BUILTIN_STAMP,builtin:true},
]

function clone<T>(value:T):T{return structuredClone(value)}
function unique(values:string[]){return [...new Set(values.map((value)=>value.trim()).filter(Boolean))]}
function diffDays(anchor:string,value?:string){if(!value)return undefined;return Math.round((new Date(value+'T12:00:00').getTime()-new Date(anchor+'T12:00:00').getTime())/86_400_000)}
function applyOffset(anchor:string,offset?:number){return offset===undefined?undefined:addLocalDays(anchor,offset)}

function validateNode(node:TaskTemplateNode){
  if(!node.title.trim())throw new Error('Template tasks need a title.')
  if(node.estimatedMinutes!==undefined&&(node.estimatedMinutes<1||node.estimatedMinutes>1440))throw new Error('Template task estimate must be between 1 and 1440 minutes.')
  if(node.children.length>50)throw new Error('A template task can have at most 50 direct nested tasks.')
  for(const child of node.children)validateNode(child)
}

function validCustom(value:unknown):FolioTemplateDefinition[]{
  if(!Array.isArray(value))return[]
  return value.flatMap((row)=>{
    if(!row||typeof row!=='object')return[]
    const item=row as FolioTemplateDefinition
    if(typeof item.id!=='string'||typeof item.name!=='string'||(item.kind!=='task'&&item.kind!=='project'))return[]
    return [item]
  }).slice(0,100)
}

async function custom(){return validCustom(await settingsRepository.get<unknown>(CUSTOM_KEY,[]))}
async function write(rows:FolioTemplateDefinition[]){await settingsRepository.set(CUSTOM_KEY,rows.slice(0,100))}

async function nodeFromTask(task:TaskEntity,all:TaskEntity[],anchor:string):Promise<TaskTemplateNode>{
  const children=all.filter((item)=>item.parentTaskId===task.id&&!item.deletedAt&&item.status!=='cancelled').sort((a,b)=>a.sortOrder-b.sortOrder)
  return {
    title:task.title,description:task.description,priority:task.priority,estimatedMinutes:task.estimatedMinutes,
    tags:unique(task.tags??[]),checklist:(task.checklist??[]).map((item)=>item.text),
    plannedOffsetDays:diffDays(anchor,task.plannedDate),deadlineOffsetDays:diffDays(anchor,task.deadline),
    children:await Promise.all(children.map((child)=>nodeFromTask(child,all,anchor))),
  }
}

async function createNode(node:TaskTemplateNode,anchor:string,options:{projectId?:string;listId?:string;sectionId?:string;parentTaskId?:string},createdIds:string[]){
  validateNode(node)
  const stamp=new Date().toISOString()
  const checklist=node.checklist.map((text,index)=>({id:crypto.randomUUID(),text,completed:false,sortOrder:index,createdAt:stamp,updatedAt:stamp}))
  const task=await taskRepository.create({
    title:node.title,description:node.description,priority:node.priority,status:'todo',
    projectId:options.projectId,listId:options.listId,sectionId:options.sectionId,parentTaskId:options.parentTaskId,
    plannedDate:applyOffset(anchor,node.plannedOffsetDays),deadline:applyOffset(anchor,node.deadlineOffsetDays),
    estimatedMinutes:node.estimatedMinutes,tags:unique(node.tags),checklist,
  })
  createdIds.push(task.id)
  for(const child of node.children)await createNode(child,anchor,{...options,parentTaskId:task.id},createdIds)
  return task
}

export const templateService={
  async listCustom(){return custom()},
  async listAll(){return [...BUILTIN_TEMPLATES,...await custom()]},
  async get(id:string){return BUILTIN_TEMPLATES.find((item)=>item.id===id)??(await custom()).find((item)=>item.id===id)},

  async saveTaskDefinition(input:{id?:string;name:string;description?:string;root:TaskTemplateNode}){
    validateNode(input.root)
    const name=input.name.trim();if(!name)throw new Error('Template name is required.')
    const rows=await custom(),now=new Date().toISOString(),existing=input.id?rows.find((item)=>item.id===input.id):undefined
    if(existing&&existing.kind!=='task')throw new Error('Template kind cannot be changed.')
    const row:TaskTemplateDefinition={id:existing?.id??crypto.randomUUID(),kind:'task',name,description:input.description?.trim()??'',root:clone(input.root),createdAt:existing?.createdAt??now,updatedAt:now}
    await write([row,...rows.filter((item)=>item.id!==row.id)])
    return row
  },

  async saveProjectDefinition(input:{id?:string;name:string;description?:string;project:ProjectTemplateDefinition['project'];milestones:ProjectTemplateDefinition['milestones'];tasks:TaskTemplateNode[]}){
    const name=input.name.trim();if(!name)throw new Error('Template name is required.')
    if(!input.project.name.trim())throw new Error('Project template needs a project name.')
    for(const task of input.tasks)validateNode(task)
    const rows=await custom(),now=new Date().toISOString(),existing=input.id?rows.find((item)=>item.id===input.id):undefined
    if(existing&&existing.kind!=='project')throw new Error('Template kind cannot be changed.')
    const row:ProjectTemplateDefinition={id:existing?.id??crypto.randomUUID(),kind:'project',name,description:input.description?.trim()??'',project:clone(input.project),milestones:clone(input.milestones).slice(0,100),tasks:clone(input.tasks).slice(0,100),createdAt:existing?.createdAt??now,updatedAt:now}
    await write([row,...rows.filter((item)=>item.id!==row.id)])
    return row
  },

  async saveFromTask(taskId:string,name?:string,anchor=localDateKey()){
    const task=await taskRepository.get(taskId);if(!task||task.deletedAt)throw new Error('Task not found.')
    const all=await taskRepository.listSnapshot()
    return this.saveTaskDefinition({name:name?.trim()||task.title,description:'Captured from an existing Folio task.',root:await nodeFromTask(task,all,anchor)})
  },

  async saveFromProject(projectId:string,name?:string,anchor=localDateKey()){
    const project=await projectRepository.get(projectId);if(!project)throw new Error('Project not found.')
    const all=await taskRepository.listSnapshot()
    const roots=all.filter((task)=>task.projectId===project.id&&!task.parentTaskId&&!task.deletedAt&&task.status!=='cancelled').sort((a,b)=>a.sortOrder-b.sortOrder)
    return this.saveProjectDefinition({
      name:name?.trim()||project.name,description:'Captured from an existing Folio project.',
      project:{name:project.name,description:project.description,notes:project.notes,color:project.color,icon:project.icon,type:project.type,weeklyTargetMinutes:project.weeklyTargetMinutes,deadlineOffsetDays:diffDays(anchor,project.deadline),examOffsetDays:diffDays(anchor,project.examDate)},
      milestones:(project.milestones??[]).filter((item)=>!item.completedAt).map((item)=>({title:item.title,dueOffsetDays:diffDays(anchor,item.dueDate)})),
      tasks:await Promise.all(roots.map((task)=>nodeFromTask(task,all,anchor))),
    })
  },

  async remove(id:string):Promise<UndoableMutation>{
    if(id.startsWith('builtin-'))throw new Error('Built-in templates cannot be deleted.')
    const rows=await custom(),before=rows.find((item)=>item.id===id);if(!before)throw new Error('Template not found.')
    await write(rows.filter((item)=>item.id!==id))
    return {message:'Template deleted',undo:async()=>write([before,...await custom()])}
  },

  async instantiateTask(id:string,options:{anchorDate?:string;projectId?:string;listId?:string;sectionId?:string}={}){
    const template=await this.get(id);if(!template||template.kind!=='task')throw new Error('Task template not found.')
    const anchor=options.anchorDate??localDateKey(),createdIds:string[]=[]
    const task=await createNode(template.root,anchor,options,createdIds)
    return {task,createdIds,undo:{message:'Task template created',undo:async()=>taskRepository.removePermanently(createdIds)} satisfies UndoableMutation}
  },

  async instantiateProject(id:string,options:{anchorDate?:string}={}){
    const template=await this.get(id);if(!template||template.kind!=='project')throw new Error('Project template not found.')
    const anchor=options.anchorDate??localDateKey()
    const project=await projectRepository.create({
      name:template.project.name,description:template.project.description,notes:template.project.notes,color:template.project.color,icon:template.project.icon,type:template.project.type,status:'active',favorite:false,
      deadline:applyOffset(anchor,template.project.deadlineOffsetDays),examDate:template.project.type==='academic'?applyOffset(anchor,template.project.examOffsetDays):undefined,weeklyTargetMinutes:template.project.type==='academic'?template.project.weeklyTargetMinutes:undefined,
    })
    const now=new Date().toISOString()
    const milestones:ProjectMilestone[]=template.milestones.map((item,index)=>({id:crypto.randomUUID(),title:item.title,dueDate:applyOffset(anchor,item.dueOffsetDays),sortOrder:index,createdAt:now,updatedAt:now}))
    if(milestones.length)await projectRepository.replaceWithMilestones(project.id,milestones,{id:crypto.randomUUID(),kind:'project',label:'Project template milestones created',at:now})
    const createdIds:string[]=[]
    try{
      for(const node of template.tasks)await createNode(node,anchor,{projectId:project.id},createdIds)
    }catch(error){
      if(createdIds.length)await taskRepository.removePermanently(createdIds)
      await db.projects.delete(project.id)
      await contentSearchService.rebuildAll()
      throw error
    }
    return {projectId:project.id,createdTaskIds:createdIds,undo:{message:'Project template created',undo:async()=>{if(createdIds.length)await taskRepository.removePermanently(createdIds);await db.projects.delete(project.id);await contentSearchService.rebuildAll()}} satisfies UndoableMutation}
  },
}
