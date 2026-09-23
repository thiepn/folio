import { useMemo, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import { Button } from '../../components/ui/Button'
import { addLocalDays, addLocalMonths, formatLocalDate, localDateToDate, startOfLocalMonth, startOfLocalWeek } from '../../domain/date'
import { normalizeTimelineSpan, timelineDayOffset, timelineIntersects } from './boardTimelineLogic'
import type { LocalDate } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'

export type TimelineZoom = 'day' | 'week' | 'month'
const TIMELINE_LABEL_WIDTH = 205

export interface TimelineMilestoneMarker {
  id: string
  title: string
  dueDate?: LocalDate
  completed?: boolean
}

interface WindowSpec {
  start: LocalDate
  days: number
  pxPerDay: number
  navigateDays: number
}

export function TimelineView({
  tasks, today, title = 'Timeline', milestones = [],
  onOpenTask, onToggleTask, onSetSpan, onClearSpan,
}: {
  tasks: TaskPreview[]
  today: LocalDate
  title?: string
  milestones?: TimelineMilestoneMarker[]
  onOpenTask: (id:string)=>void
  onToggleTask: (id:string)=>void
  onSetSpan: (taskId:string,start:LocalDate,end:LocalDate,milestone:boolean)=>void|Promise<void>
  onClearSpan: (taskId:string)=>void|Promise<void>
}) {
  const [zoom,setZoom]=useState<TimelineZoom>('day')
  const [anchor,setAnchor]=useState<LocalDate>(today)
  const spec=useMemo(()=>windowSpec(anchor,zoom),[anchor,zoom])
  const through=addLocalDays(spec.start,spec.days-1)
  const activeTasks=useMemo(()=>tasks.filter((task)=>task.status!=='cancelled'),[tasks])
  const backlog=useMemo(()=>activeTasks.filter((task)=>!task.timelineStart&&!task.completed),[activeTasks])
  const visible=useMemo(()=>activeTasks
    .filter((task)=>task.timelineStart)
    .filter((task)=>timelineIntersects(normalizeTimelineSpan(task.timelineStart!,task.timelineEnd,Boolean(task.timelineMilestone))!,spec.start,through))
    .sort((a,b)=>(a.timelineStart??'').localeCompare(b.timelineStart??'')||(a.timelineEnd??a.timelineStart??'').localeCompare(b.timelineEnd??b.timelineStart??'')||a.title.localeCompare(b.title)),
  [activeTasks,spec.start,through])
  const width=TIMELINE_LABEL_WIDTH+spec.days*spec.pxPerDay
  const ticks=useMemo(()=>timelineTicks(spec,zoom),[spec,zoom])
  const visibleMilestones=milestones.filter((item)=>item.dueDate&&item.dueDate>=spec.start&&item.dueDate<=through)

  function dropBacklog(event:DragEvent<HTMLDivElement>){
    event.preventDefault()
    const taskId=event.dataTransfer.getData('timeline/task-id')
    if(!taskId)return
    const rect=event.currentTarget.getBoundingClientRect()
    const x=Math.max(0,Math.min(spec.days*spec.pxPerDay-1,event.clientX-rect.left-TIMELINE_LABEL_WIDTH))
    const date=addLocalDays(spec.start,Math.min(spec.days-1,Math.max(0,Math.floor(x/spec.pxPerDay))))
    void onSetSpan(taskId,date,date,false)
  }

  return <div className="timeline-workspace">
    <div className="timeline-toolbar">
      <div><span className="eyebrow">Timeline</span><strong>{title}</strong><small>{formatRange(spec.start,through)}</small></div>
      <div className="timeline-toolbar__nav">
        <button onClick={()=>setAnchor((date)=>addLocalDays(date,-spec.navigateDays))} aria-label="Previous timeline range">←</button>
        <Button onClick={()=>setAnchor(today)}>Today</Button>
        <button onClick={()=>setAnchor((date)=>addLocalDays(date,spec.navigateDays))} aria-label="Next timeline range">→</button>
      </div>
      <label><span>Zoom</span><select value={zoom} onChange={(e)=>setZoom(e.target.value as TimelineZoom)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
      <div className="timeline-toolbar__stats"><span><b>{visible.length}</b> visible spans</span><span><b>{backlog.length}</b> unscheduled</span></div>
    </div>

    <div className="timeline-layout">
      <aside className="timeline-backlog">
        <header><span className="eyebrow">Unscheduled</span><strong>{backlog.length} tasks</strong></header>
        <p>Drag a task onto the timeline, or place it at Today.</p>
        <div className="timeline-backlog__list">
          {backlog.map((task)=><article key={task.id} draggable onDragStart={(e)=>{e.dataTransfer.setData('timeline/task-id',task.id);e.dataTransfer.effectAllowed='copy'}}>
            <button onClick={()=>onOpenTask(task.id)}><strong>{task.title}</strong><span>{task.project??task.list??'No project/list'}</span></button>
            <div><span>{task.deadline?'Due '+shortDate(task.deadline):task.plannedDate?'Planned '+shortDate(task.plannedDate):'No dates'}</span><button onClick={()=>void onSetSpan(task.id,today,today,false)}>Today</button></div>
          </article>)}
          {!backlog.length?<div className="empty-state">Every open task in this view has a timeline position.</div>:null}
        </div>
      </aside>

      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{width}} onDragOver={(e)=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={dropBacklog}>
          <div className="timeline-header" style={{width}}>
            {ticks.map((tick)=><span key={tick.date} className={'timeline-tick-label '+(tick.major?'is-major':'')} style={{left:TIMELINE_LABEL_WIDTH+timelineDayOffset(spec.start,tick.date)*spec.pxPerDay}}>{tick.label}</span>)}
          </div>
          <div className="timeline-grid-lines">
            {ticks.map((tick)=><i key={tick.date} className={tick.major?'is-major':''} style={{left:TIMELINE_LABEL_WIDTH+timelineDayOffset(spec.start,tick.date)*spec.pxPerDay}} />)}
          </div>
          {today>=spec.start&&today<=through?<span className="timeline-today-line" style={{left:TIMELINE_LABEL_WIDTH+(timelineDayOffset(spec.start,today)+0.5)*spec.pxPerDay}}><b>Today</b></span>:null}

          <div className="timeline-milestone-lane">
            {visibleMilestones.map((item)=>{
              const x=TIMELINE_LABEL_WIDTH+(timelineDayOffset(spec.start,item.dueDate!)+0.5)*spec.pxPerDay
              return <span key={item.id} className={'timeline-project-milestone '+(item.completed?'is-complete':'')} style={{left:x}} title={item.title}><i>◆</i><em>{item.title}</em></span>
            })}
          </div>

          <DependencyOverlay tasks={visible} start={spec.start} pxPerDay={spec.pxPerDay} labelWidth={TIMELINE_LABEL_WIDTH} />

          <div className="timeline-rows">
            {visible.map((task,index)=><TimelineRow
              key={task.id}
              task={task}
              index={index}
              windowStart={spec.start}
              windowEnd={through}
              pxPerDay={spec.pxPerDay}
              labelWidth={TIMELINE_LABEL_WIDTH}
              onOpen={()=>onOpenTask(task.id)}
              onToggle={()=>onToggleTask(task.id)}
              onSetSpan={(start,end,milestone)=>onSetSpan(task.id,start,end,milestone)}
              onClear={()=>onClearSpan(task.id)}
            />)}
          </div>
        </div>
      </div>
    </div>
  </div>
}

function TimelineRow({task,index,windowStart,windowEnd,pxPerDay,labelWidth,onOpen,onToggle,onSetSpan,onClear}:{
  task:TaskPreview;index:number;windowStart:LocalDate;windowEnd:LocalDate;pxPerDay:number;labelWidth:number;
  onOpen:()=>void;onToggle:()=>void;onSetSpan:(start:LocalDate,end:LocalDate,milestone:boolean)=>void|Promise<void>;onClear:()=>void|Promise<void>
}) {
  const start=task.timelineStart!
  const end=task.timelineEnd??start
  const [preview,setPreview]=useState<{shift?:number;start?:number;end?:number}>({})
  const shift=preview.shift??0
  const startAdjust=preview.start??0
  const endAdjust=preview.end??0
  const previewStart=addLocalDays(start,shift+startAdjust)
  let previewEnd=addLocalDays(end,shift+endAdjust)
  if(previewEnd<previewStart) previewEnd=previewStart

  function beginMove(event:ReactPointerEvent<HTMLButtonElement>){
    if(task.timelineMilestone)return beginMilestoneMove(event)
    event.preventDefault()
    const x=event.clientX
    let delta=0
    const move=(pointer:PointerEvent)=>{delta=Math.round((pointer.clientX-x)/pxPerDay);setPreview({shift:delta})}
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setPreview({});if(delta)void onSetSpan(addLocalDays(start,delta),addLocalDays(end,delta),false)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
  }
  function beginMilestoneMove(event:ReactPointerEvent<HTMLButtonElement>){
    event.preventDefault();const x=event.clientX;let delta=0
    const move=(pointer:PointerEvent)=>{delta=Math.round((pointer.clientX-x)/pxPerDay);setPreview({shift:delta})}
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setPreview({});if(delta){const next=addLocalDays(start,delta);void onSetSpan(next,next,true)}}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
  }
  function beginResize(event:ReactPointerEvent<HTMLButtonElement>,edge:'start'|'end'){
    event.preventDefault();event.stopPropagation();const x=event.clientX;let delta=0
    const move=(pointer:PointerEvent)=>{delta=Math.round((pointer.clientX-x)/pxPerDay);setPreview(edge==='start'?{start:delta}:{end:delta})}
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);const nextStart=edge==='start'?addLocalDays(start,delta):start;const nextEnd=edge==='end'?addLocalDays(end,delta):end;setPreview({});void onSetSpan(nextStart,nextEnd<nextStart?nextStart:nextEnd,false)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
  }

  const pVisibleStart=previewStart<windowStart?windowStart:previewStart
  const pVisibleEnd=previewEnd>windowEnd?windowEnd:previewEnd
  const pLeft=labelWidth+timelineDayOffset(windowStart,pVisibleStart)*pxPerDay
  const pDays=Math.max(1,timelineDayOffset(pVisibleStart,pVisibleEnd)+1)
  const deadlineVisible=task.deadline&&task.deadline>=windowStart&&task.deadline<=windowEnd
  return <div className={'timeline-row '+(task.completed?'is-completed ':'')+(task.activeBlockerCount?'is-blocked':'')} style={{top:index*46}}>
    {deadlineVisible?<span className="timeline-deadline-marker" style={{left:labelWidth+(timelineDayOffset(windowStart,task.deadline!)+0.5)*pxPerDay}} title={'Deadline '+task.deadline}>◆</span>:null}
    {task.timelineMilestone
      ? <button className="timeline-task-milestone" style={{left:labelWidth+(timelineDayOffset(windowStart,previewStart)+0.5)*pxPerDay}} onPointerDown={beginMilestoneMove} onClick={onOpen} title={task.title}><i>◆</i><span>{task.title}</span></button>
      : <article className="timeline-bar" style={{left:pLeft,width:Math.max(20,pDays*pxPerDay-2)}}>
          <button className="timeline-bar__resize is-start" aria-label="Resize timeline start" onPointerDown={(e)=>beginResize(e,'start')}/>
          <button className="timeline-bar__main" onPointerDown={beginMove} onDoubleClick={onOpen}>
            <strong>{task.title}</strong><span>{shortDate(previewStart)} – {shortDate(previewEnd)}</span>
          </button>
          <button className="timeline-bar__resize is-end" aria-label="Resize timeline end" onPointerDown={(e)=>beginResize(e,'end')}/>
        </article>}
    <div className="timeline-row-actions"><button className={'task-check '+(task.completed?'task-check--done':'')} aria-label={task.completed?'Reopen '+task.title:'Complete '+task.title} onClick={onToggle}/><button onClick={onOpen}>{task.title}</button><button aria-label={'Remove '+task.title+' from timeline'} onClick={()=>void onClear()}>×</button></div>
  </div>
}

function DependencyOverlay({tasks,start,pxPerDay,labelWidth}:{tasks:TaskPreview[];start:LocalDate;pxPerDay:number;labelWidth:number}) {
  const index=new Map(tasks.map((task,row)=>[task.id,{task,row}]))
  const links:ReactElement[]=[]
  for(const task of tasks){
    const current=index.get(task.id)!
    for(const blockerId of task.blockedByTaskIds??[]){
      const blocker=index.get(blockerId)
      if(!blocker?.task.timelineStart)continue
      const blockerEnd=blocker.task.timelineEnd??blocker.task.timelineStart
      const x1=labelWidth+(timelineDayOffset(start,blockerEnd)+1)*pxPerDay
      const x2=labelWidth+timelineDayOffset(start,task.timelineStart!)*pxPerDay
      const y1=blocker.row*46+23
      const y2=current.row*46+23
      const mid=x1+(x2-x1)/2
      links.push(<path key={blockerId+'-'+task.id} d={'M '+x1+' '+y1+' H '+mid+' V '+y2+' H '+x2} />)
    }
  }
  if(!links.length)return null
  return <svg className="timeline-dependency-overlay" aria-hidden="true"><g>{links}</g></svg>
}

function windowSpec(anchor:LocalDate,zoom:TimelineZoom):WindowSpec {
  if(zoom==='day') return {start:addLocalDays(anchor,-7),days:42,pxPerDay:30,navigateDays:21}
  if(zoom==='week') return {start:addLocalDays(startOfLocalWeek(anchor),-14),days:112,pxPerDay:12,navigateDays:56}
  return {start:addLocalMonths(startOfLocalMonth(anchor),-1),days:397,pxPerDay:5,navigateDays:183}
}
function timelineTicks(spec:WindowSpec,zoom:TimelineZoom){
  const rows:{date:LocalDate;label:string;major:boolean}[]=[]
  for(let i=0;i<spec.days;i++){
    const date=addLocalDays(spec.start,i)
    const d=localDateToDate(date)
    if(zoom==='day'){
      if(i%2===0||d.getDate()===1) rows.push({date,label:d.getDate()===1?formatLocalDate(date,{month:'short',day:'numeric'}):String(d.getDate()),major:d.getDate()===1})
    } else if(zoom==='week'){
      if(d.getDay()===1) rows.push({date,label:formatLocalDate(date,{month:'short',day:'numeric'}),major:d.getDate()<=7})
    } else if(d.getDate()===1) rows.push({date,label:formatLocalDate(date,{month:'short',year:'2-digit'}),major:true})
  }
  return rows
}

function shortDate(value:LocalDate){return formatLocalDate(value,{month:'short',day:'numeric'})}
function formatRange(start:LocalDate,end:LocalDate){return formatLocalDate(start,{month:'short',day:'numeric',year:'numeric'})+' – '+formatLocalDate(end,{month:'short',day:'numeric',year:'numeric'})}
