import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import type { AutomationAction, AutomationTriggerType, ListEntity, ProjectTemplateDefinition, TagEntity, TaskPriority, TaskTemplateDefinition, TaskTemplateNode } from '../../domain/models'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskPreview } from '../../types/ui'
import { automationService } from '../../services/automationService'
import { templateService } from '../../services/templateService'
import type { UndoableMutation } from '../../services/undo'

type Tab='templates'|'automations'|'log'
const tabs=[{value:'templates',label:'Templates'},{value:'automations',label:'Automations'},{value:'log',label:'Run log'}] as const

function splitLines(value:string){return value.split('\n').map((item)=>item.trim()).filter(Boolean)}
function triggerLabel(value:AutomationTriggerType){return value==='task-created'?'Task created':value==='task-completed'?'Task completed':value==='daily'?'Daily check':'Manual only'}
function actionLabel(action:AutomationAction){
  if(action.type==='set-priority')return 'Set priority → '+action.priority
  if(action.type==='add-tag')return 'Add #'+action.tagName
  if(action.type==='move-project')return action.projectId?'Move project':'Clear project'
  if(action.type==='move-list')return action.listId?'Move list':'Clear list'
  if(action.type==='plan-offset')return 'Plan '+(action.days===0?'today':(action.days>0?'+':'')+action.days+'d')
  if(action.type==='deadline-offset')return 'Deadline '+(action.days===0?'today':(action.days>0?'+':'')+action.days+'d')
  return 'Create task template'
}
function defaultAction(type:AutomationAction['type']):AutomationAction{
  if(type==='set-priority')return {type,priority:'high'}
  if(type==='add-tag')return {type,tagName:'automated'}
  if(type==='move-project')return {type}
  if(type==='move-list')return {type}
  if(type==='plan-offset')return {type,days:0}
  if(type==='deadline-offset')return {type,days:7}
  return {type,templateId:''}
}

export function TemplatesAutomationView({tasks,projects,lists,tags,today,onUndo,onOpenTask,onOpenProject}:{tasks:TaskPreview[];projects:ProjectSummary[];lists:ListEntity[];tags:TagEntity[];today:string;onUndo:(undo:UndoableMutation)=>void;onOpenTask:(id:string)=>void;onOpenProject:(id:string)=>void}){
  const [tab,setTab]=useState<Tab>('templates')
  const templates=useLiveQuery(()=>templateService.listAll(),[],[])??[]
  const rules=useLiveQuery(()=>automationService.listRules(),[],[])??[]
  const logs=useLiveQuery(()=>automationService.listLogs(),[],[])??[]
  const taskTemplates=templates.filter((item):item is TaskTemplateDefinition=>item.kind==='task')
  const projectTemplates=templates.filter((item):item is ProjectTemplateDefinition=>item.kind==='project')
  const [anchorDate,setAnchorDate]=useState(today)
  const [templateProjectId,setTemplateProjectId]=useState('')
  const [captureTaskId,setCaptureTaskId]=useState('')
  const [captureTaskName,setCaptureTaskName]=useState('')
  const [captureProjectId,setCaptureProjectId]=useState('')
  const [captureProjectName,setCaptureProjectName]=useState('')
  const [newTaskName,setNewTaskName]=useState('')
  const [newTaskTitle,setNewTaskTitle]=useState('')
  const [newTaskDescription,setNewTaskDescription]=useState('')
  const [newTaskPriority,setNewTaskPriority]=useState<TaskPriority>('normal')
  const [newTaskEstimate,setNewTaskEstimate]=useState('')
  const [newTaskPlanned,setNewTaskPlanned]=useState('')
  const [newTaskDeadline,setNewTaskDeadline]=useState('')
  const [newTaskTags,setNewTaskTags]=useState('')
  const [newTaskChecklist,setNewTaskChecklist]=useState('')
  const [projectTemplateName,setProjectTemplateName]=useState('')
  const [projectName,setProjectName]=useState('')
  const [projectDescription,setProjectDescription]=useState('')
  const [projectType,setProjectType]=useState<'standard'|'academic'>('standard')
  const [projectDeadline,setProjectDeadline]=useState('')
  const [projectExam,setProjectExam]=useState('')
  const [projectMilestones,setProjectMilestones]=useState('')
  const [projectTasks,setProjectTasks]=useState('')
  const [ruleId,setRuleId]=useState<string|undefined>(undefined)
  const [ruleName,setRuleName]=useState('')
  const [ruleTrigger,setRuleTrigger]=useState<AutomationTriggerType>('task-created')
  const [ruleEnabled,setRuleEnabled]=useState(true)
  const [conditionProject,setConditionProject]=useState('')
  const [conditionTag,setConditionTag]=useState('')
  const [conditionPriority,setConditionPriority]=useState('')
  const [conditionStatus,setConditionStatus]=useState('')
  const [conditionTitle,setConditionTitle]=useState('')
  const [conditionDeadline,setConditionDeadline]=useState('')
  const [conditionDueWithin,setConditionDueWithin]=useState('')
  const [ruleActions,setRuleActions]=useState<AutomationAction[]>([{type:'set-priority',priority:'high'}])
  const [manualTaskId,setManualTaskId]=useState('')
  const [error,setError]=useState('')

  const rootTasks=useMemo(()=>tasks.filter((task)=>!task.parentTaskId&&!task.deletedAt&&task.status!=='cancelled'),[tasks])

  async function useTemplate(id:string,kind:'task'|'project'){
    setError('')
    try{
      if(kind==='task'){
        const result=await templateService.instantiateTask(id,{anchorDate,projectId:templateProjectId||undefined})
        onUndo(result.undo);onOpenTask(result.task.id)
      }else{
        const result=await templateService.instantiateProject(id,{anchorDate})
        onUndo(result.undo);onOpenProject(result.projectId)
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Template could not be created.')}
  }

  async function saveBlankTask(){
    const node:TaskTemplateNode={
      title:newTaskTitle.trim(),description:newTaskDescription,priority:newTaskPriority,
      estimatedMinutes:newTaskEstimate?Number(newTaskEstimate):undefined,
      tags:newTaskTags.split(',').map((item)=>item.trim()).filter(Boolean),
      checklist:splitLines(newTaskChecklist),
      plannedOffsetDays:newTaskPlanned===''?undefined:Number(newTaskPlanned),
      deadlineOffsetDays:newTaskDeadline===''?undefined:Number(newTaskDeadline),
      children:[],
    }
    try{
      await templateService.saveTaskDefinition({name:newTaskName,description:'Custom task template',root:node})
      setNewTaskName('');setNewTaskTitle('');setNewTaskDescription('');setNewTaskEstimate('');setNewTaskTags('');setNewTaskChecklist('')
    }catch(reason){setError(reason instanceof Error?reason.message:'Template could not be saved.')}
  }

  async function saveBlankProject(){
    const tasksNodes:TaskTemplateNode[]=splitLines(projectTasks).map((line,index)=>{const [title,planned,deadline]=line.split('|').map((part)=>part.trim());return {title,description:'',priority:index===0?'high':'normal',tags:[],checklist:[],plannedOffsetDays:planned===''||planned===undefined?undefined:Number(planned),deadlineOffsetDays:deadline===''||deadline===undefined?undefined:Number(deadline),children:[]}})
    const milestones=splitLines(projectMilestones).map((line)=>{const [title,due]=line.split('|').map((part)=>part.trim());return {title,dueOffsetDays:due===''||due===undefined?undefined:Number(due)}})
    try{
      await templateService.saveProjectDefinition({
        name:projectTemplateName,description:'Custom project template',
        project:{name:projectName,description:projectDescription,notes:'',type:projectType,deadlineOffsetDays:projectDeadline===''?undefined:Number(projectDeadline),examOffsetDays:projectType==='academic'&&projectExam!==''?Number(projectExam):undefined},
        milestones,tasks:tasksNodes,
      })
      setProjectTemplateName('');setProjectName('');setProjectDescription('');setProjectDeadline('');setProjectExam('');setProjectMilestones('');setProjectTasks('')
    }catch(reason){setError(reason instanceof Error?reason.message:'Project template could not be saved.')}
  }

  function editRule(id:string){
    const rule=rules.find((item)=>item.id===id);if(!rule)return
    setRuleId(rule.id);setRuleName(rule.name);setRuleTrigger(rule.trigger);setRuleEnabled(rule.enabled)
    setConditionProject(rule.conditions.projectId??'');setConditionTag(rule.conditions.tagId??'');setConditionPriority(rule.conditions.priority??'');setConditionStatus(rule.conditions.status??'');setConditionTitle(rule.conditions.titleContains??'')
    setConditionDeadline(rule.conditions.hasDeadline===true?'yes':rule.conditions.hasDeadline===false?'no':'')
    setConditionDueWithin(rule.conditions.dueWithinDays===undefined?'':String(rule.conditions.dueWithinDays))
    setRuleActions(structuredClone(rule.actions));setTab('automations')
  }
  function resetRule(){
    setRuleId(undefined);setRuleName('');setRuleTrigger('task-created');setRuleEnabled(true);setConditionProject('');setConditionTag('');setConditionPriority('');setConditionStatus('');setConditionTitle('');setConditionDeadline('');setConditionDueWithin('');setRuleActions([{type:'set-priority',priority:'high'}])
  }
  async function saveRule(){
    setError('')
    try{
      await automationService.saveRule({
        id:ruleId,name:ruleName,enabled:ruleEnabled,trigger:ruleTrigger,
        conditions:{
          projectId:conditionProject||undefined,tagId:conditionTag||undefined,priority:conditionPriority as TaskPriority||undefined,
          status:conditionStatus as 'inbox'|'todo'|'completed'||undefined,titleContains:conditionTitle.trim()||undefined,
          hasDeadline:conditionDeadline==='yes'?true:conditionDeadline==='no'?false:undefined,
          dueWithinDays:conditionDueWithin===''?undefined:Number(conditionDueWithin),
        },
        actions:ruleActions,
      })
      resetRule()
    }catch(reason){setError(reason instanceof Error?reason.message:'Automation could not be saved.')}
  }

  function updateAction(index:number,next:AutomationAction){setRuleActions((current)=>current.map((item,i)=>i===index?next:item))}

  return <div className="automation-workspace">
    <PageHeader kicker="Reusable work, explicit rules" title="Templates & automation" subtitle="Turn repeated structures into templates and automate small, predictable task transitions without hiding Folio's source-of-truth fields." />
    <Tabs<Tab> value={tab} tabs={tabs} onChange={setTab} label="Templates and automation views" />
    {error?<div className="form-error">{error}</div>:null}

    {tab==='templates'?<>
      <section className="automation-toolbar"><label><span>Creation anchor</span><input type="date" value={anchorDate} onChange={(e)=>setAnchorDate(e.target.value||today)}/></label><label><span>Task template project</span><select value={templateProjectId} onChange={(e)=>setTemplateProjectId(e.target.value)}><option value="">No project</option>{projects.filter((p)=>!p.archived).map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label></section>
      <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">Library</span><h2>Task templates</h2></div><span>{taskTemplates.length}</span></div><div className="template-card-grid">{taskTemplates.map((template)=><article key={template.id}><div><span>{template.builtin?'Built-in':'Custom'}</span><h3>{template.name}</h3><p>{template.description||template.root.description||'Reusable task structure'}</p><small>{template.root.priority} · {template.root.estimatedMinutes?template.root.estimatedMinutes+'m · ':''}{template.root.children.length} nested</small></div><div><Button variant="primary" onClick={()=>void useTemplate(template.id,'task')}>Use template</Button>{!template.builtin?<Button onClick={()=>void templateService.remove(template.id).then(onUndo)}>Delete</Button>:null}</div></article>)}</div></section>
      <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">Library</span><h2>Project templates</h2></div><span>{projectTemplates.length}</span></div><div className="template-card-grid">{projectTemplates.map((template)=><article key={template.id}><div><span>{template.builtin?'Built-in':'Custom'}</span><h3>{template.name}</h3><p>{template.description||template.project.description||'Reusable project structure'}</p><small>{template.project.type} · {template.tasks.length} root tasks · {template.milestones.length} milestones</small></div><div><Button variant="primary" onClick={()=>void useTemplate(template.id,'project')}>Create project</Button>{!template.builtin?<Button onClick={()=>void templateService.remove(template.id).then(onUndo)}>Delete</Button>:null}</div></article>)}</div></section>

      <div className="automation-two-col">
        <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">Capture</span><h2>Save existing work</h2></div></div>
          <div className="automation-form-stack"><label><span>Task</span><select value={captureTaskId} onChange={(e)=>setCaptureTaskId(e.target.value)}><option value="">Choose task…</option>{rootTasks.map((task)=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label><span>Template name</span><input value={captureTaskName} onChange={(e)=>setCaptureTaskName(e.target.value)} placeholder="Optional override"/></label><Button disabled={!captureTaskId} onClick={()=>void templateService.saveFromTask(captureTaskId,captureTaskName||undefined,anchorDate).then(()=>{setCaptureTaskId('');setCaptureTaskName('')}).catch((reason)=>setError(reason.message))}>Capture task tree</Button>
          <label><span>Project</span><select value={captureProjectId} onChange={(e)=>setCaptureProjectId(e.target.value)}><option value="">Choose project…</option>{projects.filter((p)=>!p.archived).map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label><span>Template name</span><input value={captureProjectName} onChange={(e)=>setCaptureProjectName(e.target.value)} placeholder="Optional override"/></label><Button disabled={!captureProjectId} onClick={()=>void templateService.saveFromProject(captureProjectId,captureProjectName||undefined,anchorDate).then(()=>{setCaptureProjectId('');setCaptureProjectName('')}).catch((reason)=>setError(reason.message))}>Capture project</Button></div>
        </section>

        <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">New</span><h2>Task template</h2></div></div>
          <div className="automation-form-stack"><label><span>Template name</span><input value={newTaskName} onChange={(e)=>setNewTaskName(e.target.value)}/></label><label><span>Task title</span><input value={newTaskTitle} onChange={(e)=>setNewTaskTitle(e.target.value)}/></label><label><span>Description</span><textarea rows={3} value={newTaskDescription} onChange={(e)=>setNewTaskDescription(e.target.value)}/></label><div className="automation-form-grid"><label><span>Priority</span><select value={newTaskPriority} onChange={(e)=>setNewTaskPriority(e.target.value as TaskPriority)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label><span>Estimate</span><input type="number" min="1" max="1440" value={newTaskEstimate} onChange={(e)=>setNewTaskEstimate(e.target.value)} placeholder="min"/></label><label><span>Plan offset</span><input type="number" value={newTaskPlanned} onChange={(e)=>setNewTaskPlanned(e.target.value)} placeholder="+ days"/></label><label><span>Deadline offset</span><input type="number" value={newTaskDeadline} onChange={(e)=>setNewTaskDeadline(e.target.value)} placeholder="+ days"/></label></div><label><span>Tags</span><input value={newTaskTags} onChange={(e)=>setNewTaskTags(e.target.value)} placeholder="study, deep-work"/></label><label><span>Checklist · one per line</span><textarea rows={4} value={newTaskChecklist} onChange={(e)=>setNewTaskChecklist(e.target.value)}/></label><Button variant="primary" disabled={!newTaskName.trim()||!newTaskTitle.trim()} onClick={()=>void saveBlankTask()}>Save task template</Button></div>
        </section>
      </div>

      <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">New</span><h2>Project template</h2></div></div>
        <div className="automation-project-builder"><label><span>Template name</span><input value={projectTemplateName} onChange={(e)=>setProjectTemplateName(e.target.value)}/></label><label><span>Project name</span><input value={projectName} onChange={(e)=>setProjectName(e.target.value)}/></label><label><span>Type</span><select value={projectType} onChange={(e)=>setProjectType(e.target.value as 'standard'|'academic')}><option value="standard">Standard</option><option value="academic">Academic</option></select></label><label><span>Deadline offset</span><input type="number" value={projectDeadline} onChange={(e)=>setProjectDeadline(e.target.value)} placeholder="+ days"/></label>{projectType==='academic'?<label><span>Exam offset</span><input type="number" value={projectExam} onChange={(e)=>setProjectExam(e.target.value)} placeholder="+ days"/></label>:null}<label className="is-wide"><span>Description</span><textarea rows={3} value={projectDescription} onChange={(e)=>setProjectDescription(e.target.value)}/></label><label><span>Milestones · title | due offset</span><textarea rows={5} value={projectMilestones} onChange={(e)=>setProjectMilestones(e.target.value)} placeholder={'First review | 7\nFinal handoff | 30'}/></label><label><span>Root tasks · title | planned | deadline</span><textarea rows={5} value={projectTasks} onChange={(e)=>setProjectTasks(e.target.value)} placeholder={'Map requirements | 0 | 7\nBuild first pass | 1 | 14'}/></label><div className="is-wide"><Button variant="primary" disabled={!projectTemplateName.trim()||!projectName.trim()} onClick={()=>void saveBlankProject()}>Save project template</Button></div></div>
      </section>
    </>:null}

    {tab==='automations'?<div className="automation-two-col automation-rules-layout">
      <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">Rules</span><h2>Automation rules</h2></div><span>{rules.length}</span></div>
        <label className="automation-manual-target"><span>Manual run target</span><select value={manualTaskId} onChange={(e)=>setManualTaskId(e.target.value)}><option value="">Choose an open task…</option>{rootTasks.map((task)=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <div className="automation-rule-list">{rules.map((rule)=><article key={rule.id}><header><div><strong>{rule.name}</strong><span>{triggerLabel(rule.trigger)} · {rule.actions.length} action{rule.actions.length===1?'':'s'}</span></div><label><input type="checkbox" checked={rule.enabled} onChange={(e)=>void automationService.setEnabled(rule.id,e.target.checked)}/><span>On</span></label></header><p>{rule.actions.map(actionLabel).join(' · ')}</p>{rule.lastRunAt?<small>Last run {new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(rule.lastRunAt))}</small>:null}<footer><Button onClick={()=>editRule(rule.id)}>Edit</Button><Button disabled={!manualTaskId} onClick={()=>void automationService.runManual(rule.id,manualTaskId,today).then(onUndo).catch((reason)=>setError(reason.message))}>Run now</Button><Button onClick={()=>void automationService.removeRule(rule.id).then(onUndo)}>Delete</Button></footer></article>)}{!rules.length?<p>No automations yet.</p>:null}</div>
      </section>

      <section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">{ruleId?'Edit':'New'}</span><h2>Rule builder</h2></div>{ruleId?<Button onClick={resetRule}>Cancel edit</Button>:null}</div>
        <div className="automation-form-stack"><label><span>Name</span><input value={ruleName} onChange={(e)=>setRuleName(e.target.value)} placeholder="Urgent exam tasks → high priority"/></label><div className="automation-form-grid"><label><span>Trigger</span><select value={ruleTrigger} onChange={(e)=>setRuleTrigger(e.target.value as AutomationTriggerType)}><option value="task-created">Task created</option><option value="task-completed">Task completed</option><option value="daily">Daily check</option><option value="manual">Manual only</option></select></label><label className="automation-enable"><span>Enabled</span><input type="checkbox" checked={ruleEnabled} onChange={(e)=>setRuleEnabled(e.target.checked)}/></label></div>
        <div className="automation-subsection"><span className="eyebrow">Conditions · all must match</span><div className="automation-form-grid"><label><span>Project</span><select value={conditionProject} onChange={(e)=>setConditionProject(e.target.value)}><option value="">Any</option>{projects.filter((p)=>!p.archived).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>Tag</span><select value={conditionTag} onChange={(e)=>setConditionTag(e.target.value)}><option value="">Any</option>{tags.filter((tag)=>!tag.archived).map((tag)=><option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select></label><label><span>Priority</span><select value={conditionPriority} onChange={(e)=>setConditionPriority(e.target.value)}><option value="">Any</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label><span>Status</span><select value={conditionStatus} onChange={(e)=>setConditionStatus(e.target.value)}><option value="">Any</option><option value="inbox">Inbox</option><option value="todo">To-do</option><option value="completed">Completed</option></select></label><label><span>Deadline</span><select value={conditionDeadline} onChange={(e)=>setConditionDeadline(e.target.value)}><option value="">Any</option><option value="yes">Has deadline</option><option value="no">No deadline</option></select></label><label><span>Due within</span><input type="number" min="0" max="3650" value={conditionDueWithin} onChange={(e)=>setConditionDueWithin(e.target.value)} placeholder="days"/></label></div><label><span>Title contains</span><input value={conditionTitle} onChange={(e)=>setConditionTitle(e.target.value)}/></label></div>
        <div className="automation-subsection"><div className="automation-action-head"><span className="eyebrow">Actions</span><Button onClick={()=>setRuleActions((current)=>[...current,{type:'set-priority',priority:'high'}])}>Add action</Button></div><div className="automation-action-list">{ruleActions.map((action,index)=><div key={index} className="automation-action-row"><select value={action.type} onChange={(e)=>updateAction(index,defaultAction(e.target.value as AutomationAction['type']))}><option value="set-priority">Set priority</option><option value="add-tag">Add tag</option><option value="move-project">Move project</option><option value="move-list">Move list</option><option value="plan-offset">Plan relative date</option><option value="deadline-offset">Set relative deadline</option><option value="create-task-template">Create task template</option></select>
          {action.type==='set-priority'?<select value={action.priority} onChange={(e)=>updateAction(index,{type:'set-priority',priority:e.target.value as TaskPriority})}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select>:null}
          {action.type==='add-tag'?<input value={action.tagName} onChange={(e)=>updateAction(index,{type:'add-tag',tagName:e.target.value})} placeholder="tag name"/>:null}
          {action.type==='move-project'?<select value={action.projectId??''} onChange={(e)=>updateAction(index,{type:'move-project',projectId:e.target.value||undefined})}><option value="">No project</option>{projects.filter((p)=>!p.archived).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>:null}
          {action.type==='move-list'?<select value={action.listId??''} onChange={(e)=>updateAction(index,{type:'move-list',listId:e.target.value||undefined})}><option value="">No list</option>{lists.filter((l)=>!l.archived).map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select>:null}
          {action.type==='plan-offset'?<input type="number" value={action.days} onChange={(e)=>updateAction(index,{type:'plan-offset',days:Number(e.target.value)||0})}/>:null}
          {action.type==='deadline-offset'?<input type="number" value={action.days} onChange={(e)=>updateAction(index,{type:'deadline-offset',days:Number(e.target.value)||0})}/>:null}
          {action.type==='create-task-template'?<select value={action.templateId} onChange={(e)=>updateAction(index,{type:'create-task-template',templateId:e.target.value})}><option value="">Choose template…</option>{taskTemplates.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>:null}
          <button aria-label="Remove action" onClick={()=>setRuleActions((current)=>current.filter((_,i)=>i!==index))}>×</button></div>)}</div></div>
        <Button variant="primary" disabled={!ruleName.trim()||!ruleActions.length} onClick={()=>void saveRule()}>{ruleId?'Save automation':'Create automation'}</Button></div>
      </section>
    </div>:null}

    {tab==='log'?<section className="automation-section"><div className="automation-section-head"><div><span className="eyebrow">Audit trail</span><h2>Automation run log</h2></div><div><span>{logs.length} entries</span>{logs.length?<Button onClick={()=>void automationService.clearLogs()}>Clear log</Button>:null}</div></div><div className="automation-log">{logs.map((entry)=><article key={entry.id} className={'is-'+entry.status}><i/><div><strong>{entry.ruleName}</strong><span>{entry.taskTitle??'No task'} · {triggerLabel(entry.trigger)}</span><p>{entry.message}</p></div><div><em>{entry.status}</em><time>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.at))}</time></div></article>)}{!logs.length?<p>No automation runs have been recorded yet.</p>:null}</div></section>:null}
  </div>
}
