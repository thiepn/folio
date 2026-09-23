import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TaskRow } from '../../components/ui/TaskRow'
import { Tabs } from '../../components/ui/Tabs'
import type { TaskPreview } from '../../types/ui'
import type { SmartFilterGroup, SmartGroupBy, SmartTaskView } from './queryEngine'
import { KanbanBoard, type KanbanDropTarget } from '../boards/KanbanBoard'
import { TimelineView } from '../boards/TimelineView'

export function SmartViewGallery({views,results,onOpen,onCreate}:{
  views:SmartTaskView[]
  results:Record<string,{count:number;taskIds:string[]}>
  onOpen:(id:string)=>void
  onCreate:()=>void
}) {
  const builtins=views.filter((view)=>view.builtin)
  const custom=views.filter((view)=>!view.builtin)
  return <section className="organization-panel smart-view-gallery">
    <div className="organization-panel__head smart-view-gallery__head">
      <div><span className="eyebrow">Dynamic views</span><h2>Smart Views</h2><p>Live queries over tasks. Results update automatically as task data changes.</p></div>
      <Button variant="primary" onClick={onCreate}>Create smart view</Button>
    </div>
    <div className="smart-view-gallery__section">
      <div className="section-label">Built in</div>
      <div className="smart-view-card-grid">{builtins.map((view)=><SmartViewCard key={view.id} view={view} count={results[view.id]?.count??0} onOpen={onOpen}/>)}</div>
    </div>
    <div className="smart-view-gallery__section">
      <div className="section-label">Yours</div>
      {custom.length?<div className="smart-view-card-grid">{custom.map((view)=><SmartViewCard key={view.id} view={view} count={results[view.id]?.count??0} onOpen={onOpen}/>)}</div>:<div className="empty-state">Create a Smart View to save reusable AND/OR filters.</div>}
    </div>
  </section>
}

function SmartViewCard({view,count,onOpen}:{view:SmartTaskView;count:number;onOpen:(id:string)=>void}) {
  return <button className="smart-view-card" onClick={()=>onOpen(view.id)}>
    <i style={{background:view.color??'var(--accent)'}}/>
    <span><strong>{view.icon?view.icon+' ':''}{view.name}</strong><small>{view.description||querySummary(view)}{view.pinned?' · Pinned':''}</small></span>
    <b>{count}</b>
  </button>
}

export function SmartViewWorkspace({view,tasks,today,lists,projects,onBack,onOpenTask,onToggleTask,onEdit,onDuplicate,onDelete,onTogglePin,onBoardDrop,onTimelineSetSpan,onTimelineClear}:{
  view:SmartTaskView
  tasks:TaskPreview[]
  today:string
  lists:Array<{id:string;name:string}>
  projects:Array<{id:string;name:string}>
  onBack:()=>void
  onOpenTask:(id:string)=>void
  onToggleTask:(id:string)=>void
  onEdit:()=>void
  onDuplicate:()=>void
  onDelete:()=>void
  onTogglePin:()=>void
  onBoardDrop:(taskId:string,target:KanbanDropTarget)=>void|Promise<void>
  onTimelineSetSpan:(taskId:string,start:string,end:string,milestone:boolean)=>void|Promise<void>
  onTimelineClear:(taskId:string)=>void|Promise<void>
}) {
  const [display,setDisplay]=useState<'list'|'board'|'timeline'>('list')
  const groups=groupPreviews(tasks,view.groupBy)
  return <div className="smart-view-workspace">
    <header className="page-header smart-view-workspace__header">
      <div><button className="text-action" onClick={onBack}>← Lists & tags</button><span className="eyebrow">Smart View · live</span><h1>{view.icon?view.icon+' ':''}{view.name}</h1><p>{(view.description||querySummary(view))+' · '+tasks.length+' matching task'+(tasks.length===1?'':'s')+'.'}</p></div>
      <div>
        {!view.builtin?<Button onClick={onTogglePin}>{view.pinned?'Unpin':'Pin'}</Button>:null}
        <Button onClick={onDuplicate}>Duplicate</Button>
        {!view.builtin?<Button onClick={onEdit}>Edit</Button>:null}
        {!view.builtin?<Button onClick={onDelete}>Delete</Button>:null}
      </div>
    </header>
    <Tabs value={display} tabs={[{value:'list',label:'List'},{value:'board',label:'Board'},{value:'timeline',label:'Timeline'}]} onChange={setDisplay} />
    <section className="smart-view-runtime-meta">
      <span><strong>{view.scope==='all'?'All task depths':'Root tasks'}</strong><small>scope</small></span>
      <span><strong>{view.groupBy==='none'?'No grouping':view.groupBy}</strong><small>grouping</small></span>
      <span><strong>{view.sort.map((rule)=>rule.field+' '+(rule.direction==='asc'?'↑':'↓')).join(' · ')||'manual ↑'}</strong><small>sorting</small></span>
      <span><strong>{countRules(view.query)}</strong><small>filter rules</small></span>
    </section>
    {display==='board'?<KanbanBoard tasks={tasks} lists={lists} projects={projects} mode="status" allowedModes={['status','priority','list','project']} onOpenTask={onOpenTask} onToggleTask={onToggleTask} onDropTask={onBoardDrop}/>:null}
    {display==='timeline'?<TimelineView tasks={tasks} today={today} title={view.name} onOpenTask={onOpenTask} onToggleTask={onToggleTask} onSetSpan={onTimelineSetSpan} onClearSpan={onTimelineClear}/>:null}
    {display==='list'?<div className="smart-view-groups">
      {groups.map((group)=><section className="smart-view-result-group" key={group.key}>
        <header><span className="eyebrow">{group.label}</span><strong>{group.tasks.length}</strong></header>
        <div className="task-list">{group.tasks.map((task)=><TaskRow key={task.id} task={task} onOpen={onOpenTask} onToggle={onToggleTask}/>)}</div>
        {!group.tasks.length?<div className="empty-state">No tasks in this group.</div>:null}
      </section>)}
      {!tasks.length?<div className="empty-state smart-view-empty">No tasks match this Smart View.</div>:null}
    </div>:null}
  </div>
}

function groupPreviews(tasks:TaskPreview[],groupBy:SmartGroupBy) {
  if(groupBy==='none') return [{key:'all',label:'Tasks',tasks}]
  const rows=new Map<string,{key:string;label:string;tasks:TaskPreview[]}>()
  for(const task of tasks){
    const [key,label]=groupFor(task,groupBy)
    const row=rows.get(key)??{key,label,tasks:[]}
    row.tasks.push(task);rows.set(key,row)
  }
  return [...rows.values()]
}

function groupFor(task:TaskPreview,groupBy:SmartGroupBy):[string,string] {
  if(groupBy==='project') return [task.projectId??'__none__',task.project??'No project']
  if(groupBy==='list') return [task.listId??'__none__',task.list??'No list']
  if(groupBy==='section') return [task.sectionId??'__none__',task.section??'No section']
  if(groupBy==='priority') return [task.priority,task.priority[0].toUpperCase()+task.priority.slice(1)]
  if(groupBy==='status') return [task.status,task.status[0].toUpperCase()+task.status.slice(1)]
  if(groupBy==='readiness') return task.activeBlockerCount?['blocked','Blocked']:['ready','Ready']
  if(groupBy==='planned') return [task.plannedDate??'__none__',task.plannedDate??'Unscheduled']
  if(groupBy==='deadline') return [task.deadline??'__none__',task.deadline??'No deadline']
  if(groupBy==='tag') return [task.tagIds?.[0]??'__none__',task.tags?.[0]?'#'+task.tags[0]:'Untagged']
  return ['all','Tasks']
}

function countRules(node:SmartFilterGroup):number {
  return node.children.reduce((sum,child)=>sum+(child.type==='condition'?1:countRules(child)),0)
}

function querySummary(view:SmartTaskView) {
  const count=countRules(view.query)
  const logic=view.query.operator.toUpperCase()
  return count?(String(count)+' rule'+(count===1?'':'s')+' · '+logic+(view.query.negated?' · NOT':'')):'Matches everything'
}
