import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { Button } from '../../components/ui/Button'
import type { ListEntity, SectionEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'

export type KanbanGroupMode = 'section' | 'status' | 'priority' | 'list' | 'project'
export type KanbanDropTarget =
  | { kind: 'section'; value?: string }
  | { kind: 'status'; value: 'todo' | 'completed' }
  | { kind: 'priority'; value: TaskPreview['priority'] }
  | { kind: 'list'; value?: string }
  | { kind: 'project'; value?: string }

interface Column {
  id: string
  label: string
  target: KanbanDropTarget
  tasks: TaskPreview[]
}

export function KanbanBoard({
  tasks, mode: initialMode, allowedModes, listId, sections = [], lists = [], projects = [],
  onOpenTask, onToggleTask, onDropTask, onAddColumn,
}: {
  tasks: TaskPreview[]
  mode?: KanbanGroupMode
  allowedModes?: KanbanGroupMode[]
  listId?: string
  sections?: SectionEntity[]
  lists?: Array<Pick<ListEntity,'id'|'name'>>
  projects?: Array<{id:string;name:string}>
  onOpenTask: (id:string)=>void
  onToggleTask: (id:string)=>void
  onDropTask: (taskId:string,target:KanbanDropTarget)=>void|Promise<void>
  onAddColumn?: (name:string)=>void|Promise<void>
}) {
  const modes=allowedModes?.length?allowedModes:(listId?['section','priority','status']:['status','priority','list','project'])
  const [mode,setMode]=useState<KanbanGroupMode>(modes.includes(initialMode??modes[0])?(initialMode??modes[0]):modes[0])
  const [columnName,setColumnName]=useState('')
  const activeTasks=useMemo(()=>tasks.filter((task)=>task.status!=='cancelled'),[tasks])
  const columns=useMemo(()=>buildColumns(activeTasks,mode,listId,sections,lists,projects),[activeTasks,mode,listId,sections,lists,projects])

  function drop(event:DragEvent<HTMLElement>,target:KanbanDropTarget){
    event.preventDefault()
    const id=event.dataTransfer.getData('kanban/task-id')
    if(id) void onDropTask(id,target)
  }

  return <div className="kanban-workspace">
    <div className="kanban-toolbar">
      <div><span className="eyebrow">Board</span><strong>{columns.length} columns · {activeTasks.length} tasks</strong></div>
      <label><span>Group by</span><select value={mode} onChange={(e)=>setMode(e.target.value as KanbanGroupMode)}>{modes.map((value)=><option key={value} value={value}>{modeLabel(value)}</option>)}</select></label>
      {mode==='section'&&onAddColumn?<form onSubmit={(e)=>{e.preventDefault();const name=columnName.trim();if(!name)return;void Promise.resolve(onAddColumn(name)).then(()=>setColumnName(''))}}><input value={columnName} onChange={(e)=>setColumnName(e.target.value)} placeholder="New column"/><Button type="submit" disabled={!columnName.trim()}>Add column</Button></form>:null}
    </div>

    <div className="kanban-board" style={{'--kanban-columns':Math.max(1,columns.length)} as CSSProperties}>
      {columns.map((column)=><section
        className="kanban-column"
        key={column.id}
        onDragOver={(e)=>{e.preventDefault();e.dataTransfer.dropEffect='move'}}
        onDrop={(e)=>drop(e,column.target)}
      >
        <header><div><strong>{column.label}</strong><span>{column.tasks.filter((task)=>!task.completed).length} open · {column.tasks.length} total</span></div><b>{column.tasks.length}</b></header>
        <div className="kanban-column__cards">
          {column.tasks.map((task)=><article
            className={'kanban-card '+(task.completed?'is-completed ':'')+(task.activeBlockerCount?'is-blocked':'')}
            key={task.id}
            draggable
            onDragStart={(e)=>{e.dataTransfer.setData('kanban/task-id',task.id);e.dataTransfer.effectAllowed='move'}}
          >
            <div className="kanban-card__head"><button className={'task-check '+(task.completed?'task-check--done':'')} aria-label={task.completed?'Reopen '+task.title:'Complete '+task.title} onClick={()=>onToggleTask(task.id)}/><button className="kanban-card__title" onClick={()=>onOpenTask(task.id)}>{task.title}</button></div>
            <div className="kanban-card__meta">
              <span className={'kanban-priority is-'+task.priority}>{task.priority}</span>
              {task.plannedDate?<span>Plan {shortDate(task.plannedDate)}</span>:null}
              {task.deadline?<span className="is-deadline">Due {shortDate(task.deadline)}</span>:null}
              {task.activeBlockerCount?<span>Blocked · {task.activeBlockerCount}</span>:null}
            </div>
            <div className="kanban-card__context">
              {task.project?<span>{task.project}</span>:null}
              {task.list&&mode!=='list'?<span>{task.list}{task.section?' / '+task.section:''}</span>:null}
              {task.tags?.slice(0,3).map((tag)=><span key={tag}>#{tag}</span>)}
            </div>
            {task.timelineStart?<div className="kanban-card__timeline"><span>{task.timelineMilestone?'◆':'↔'}</span><span>{shortDate(task.timelineStart)}{task.timelineEnd&&task.timelineEnd!==task.timelineStart?' – '+shortDate(task.timelineEnd):''}</span></div>:null}
          </article>)}
          {!column.tasks.length?<div className="kanban-column__empty">Drop a task here.</div>:null}
        </div>
      </section>)}
    </div>
  </div>
}

function buildColumns(tasks:TaskPreview[],mode:KanbanGroupMode,listId:string|undefined,sections:SectionEntity[],lists:Array<Pick<ListEntity,'id'|'name'>>,projects:Array<{id:string;name:string}>):Column[] {
  if(mode==='section'){
    const rows=sections.filter((section)=>!section.archived).sort((a,b)=>a.sortOrder-b.sortOrder).map((section)=>({
      id:section.id,label:section.name,target:{kind:'section',value:section.id} as KanbanDropTarget,tasks:tasks.filter((task)=>task.sectionId===section.id),
    }))
    rows.push({id:'__none__',label:'No section',target:{kind:'section',value:undefined},tasks:tasks.filter((task)=>!task.sectionId)})
    return rows
  }
  if(mode==='status') return [
    {id:'todo',label:'Open',target:{kind:'status',value:'todo'},tasks:tasks.filter((task)=>!task.completed&&task.status!=='inbox')},
    {id:'completed',label:'Completed',target:{kind:'status',value:'completed'},tasks:tasks.filter((task)=>task.completed)},
  ]
  if(mode==='priority') return (['critical','high','normal'] as const).map((value)=>({id:value,label:value[0].toUpperCase()+value.slice(1),target:{kind:'priority',value},tasks:tasks.filter((task)=>task.priority===value)}))
  if(mode==='list'){
    const rows=lists.map((list)=>({id:list.id,label:list.name,target:{kind:'list',value:list.id} as KanbanDropTarget,tasks:tasks.filter((task)=>task.listId===list.id)}))
    rows.push({id:'__none__',label:'No list',target:{kind:'list',value:undefined},tasks:tasks.filter((task)=>!task.listId)})
    return rows
  }
  const rows=projects.map((project)=>({id:project.id,label:project.name,target:{kind:'project',value:project.id} as KanbanDropTarget,tasks:tasks.filter((task)=>task.projectId===project.id)}))
  rows.push({id:'__none__',label:'No project',target:{kind:'project',value:undefined},tasks:tasks.filter((task)=>!task.projectId)})
  return rows
}

function modeLabel(mode:KanbanGroupMode){
  return mode==='section'?'Sections':mode==='status'?'Status':mode==='priority'?'Priority':mode==='list'?'Lists':'Projects'
}
function shortDate(value:string){
  return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(value+'T12:00:00'))
}
