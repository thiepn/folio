import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { FocusCycleSettings, FocusMode, FocusSessionEntity, FocusTemplateDefinition } from '../../domain/models'
import type { FocusSessionPreview, TaskPreview } from '../../types/ui'
import { countdownReached, effectiveFocusSeconds, focusDisplaySeconds, focusPhaseLabel, focusPhaseTargetSeconds, formatFocusClock } from './focusLogic'
import { focusTaskReason, rankFocusTasks, suggestFocusMinutes } from './focusPlanning'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { isEditableTarget } from '../power/shortcuts'

const presets = [15, 25, 45, 60, 90]

function tagsFromText(value:string){return [...new Set(value.split(',').map((tag)=>tag.trim()).filter(Boolean))].slice(0,30)}
function minutes(value:number|undefined,fallback:number){return Math.max(1,Math.round(value??fallback))}

export function FocusOverlay({ open, activeSession, tasks, preferredTaskId, taskTotals, recentSessions = [], todaySeconds = 0, weekSeconds = 0, weekSessionCount = 0, templates = [], dailyGoalPercent = 0, weeklyGoalPercent = 0, onClose, onHistory, onStart, onSaveTemplate, onDeleteTemplate, onPause, onResume, onInterrupt, onCompletePhase, onFinish, onFinishTask, onCancel }: {
  open: boolean
  activeSession?: FocusSessionEntity
  tasks: TaskPreview[]
  preferredTaskId?: string
  taskTotals: Record<string, number>
  recentSessions?: FocusSessionPreview[]
  todaySeconds?: number
  weekSeconds?: number
  weekSessionCount?: number
  templates?: FocusTemplateDefinition[]
  dailyGoalPercent?: number
  weeklyGoalPercent?: number
  onClose: () => void
  onHistory: () => void
  onStart: (taskId: string, mode: FocusMode, targetSeconds?: number, plannedSeconds?: number, intention?: string, options?: {context?:string;tags?:string[];cycle?:FocusCycleSettings}) => Promise<void>
  onSaveTemplate: (template: Omit<FocusTemplateDefinition,'id'|'builtin'>) => Promise<void>
  onDeleteTemplate: (id:string) => Promise<void>
  onPause: (id: string) => Promise<void>
  onResume: (id: string) => Promise<void>
  onInterrupt: (id:string) => Promise<void>
  onCompletePhase: (id:string) => Promise<void>
  onFinish: (id: string, note?: string) => Promise<void>
  onFinishTask: (id: string, taskId?: string, note?: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
}) {
  useOverlayScrollLock(open)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocusTrap(open, dialogRef, onClose)
  const actionable = useMemo(() => rankFocusTasks(tasks), [tasks])
  const initial = preferredTaskId && actionable.some((task) => task.id === preferredTaskId) ? preferredTaskId : actionable[0]?.id ?? ''
  const [taskId, setTaskId] = useState(initial)
  const [mode, setMode] = useState<FocusMode>('stopwatch')
  const [targetMinutes, setTargetMinutes] = useState(25)
  const [plannedMinutes, setPlannedMinutes] = useState(25)
  const [workMinutes,setWorkMinutes]=useState(25)
  const [shortBreakMinutes,setShortBreakMinutes]=useState(5)
  const [longBreakMinutes,setLongBreakMinutes]=useState(15)
  const [cyclesBeforeLongBreak,setCyclesBeforeLongBreak]=useState(4)
  const [intention, setIntention] = useState('')
  const [context,setContext]=useState('')
  const [tagText,setTagText]=useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [templateId,setTemplateId]=useState('')
  const [templateName,setTemplateName]=useState('')
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (preferredTaskId && actionable.some((task) => task.id === preferredTaskId)) setTaskId(preferredTaskId)
    else if (!actionable.some((task) => task.id === taskId)) setTaskId(actionable[0]?.id ?? '')
  }, [open, preferredTaskId, actionable, taskId])

  useEffect(() => {
    if (!open || activeSession) return
    const selected = actionable.find((task) => task.id === taskId)
    const suggested = suggestFocusMinutes(selected, selected ? taskTotals[selected.id] ?? 0 : 0)
    setPlannedMinutes(suggested)
    if (mode === 'countdown') setTargetMinutes(suggested)
  }, [open, activeSession, taskId])

  useEffect(() => {
    if (!open || !activeSession) return
    setSessionNote(activeSession.note ?? '')
  }, [open, activeSession?.id])

  useEffect(() => {
    if (!open || !activeSession || activeSession.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [open, activeSession?.id, activeSession?.status])

  useEffect(() => {
    if (!open || !activeSession || activeSession.status !== 'running') return
    if (countdownReached(activeSession, now)) void onPause(activeSession.id)
  }, [open, activeSession, now, onPause])

  useEffect(()=>{
    if(!open||!activeSession) return
    const handler=(event:KeyboardEvent)=>{
      if(isEditableTarget(event.target)) return
      if(event.code==='Space'){event.preventDefault();if(countdownReached(activeSession)){if(activeSession.mode==='pomodoro')void onCompletePhase(activeSession.id)}else if(activeSession.status==='running')void onPause(activeSession.id);else void onResume(activeSession.id)}
      else if(event.key.toLowerCase()==='i'&&activeSession.status==='running'){event.preventDefault();void onInterrupt(activeSession.id)}
      else if(event.shiftKey&&event.key==='Enter'){event.preventDefault();void onFinish(activeSession.id,sessionNote.trim()||undefined)}
      else if(event.key.toLowerCase()==='n'&&activeSession.mode==='pomodoro'&&countdownReached(activeSession)){event.preventDefault();void onCompletePhase(activeSession.id)}
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[open,activeSession,sessionNote,onPause,onResume,onInterrupt,onCompletePhase,onFinish])

  function applyTemplate(id:string){
    setTemplateId(id)
    const template=templates.find((item)=>item.id===id)
    if(!template)return
    setMode(template.mode)
    setTargetMinutes(minutes(template.targetMinutes,25))
    setPlannedMinutes(minutes(template.plannedMinutes,template.targetMinutes??45))
    setWorkMinutes(minutes(template.workMinutes,25))
    setShortBreakMinutes(minutes(template.shortBreakMinutes,5))
    setLongBreakMinutes(minutes(template.longBreakMinutes,15))
    setCyclesBeforeLongBreak(Math.max(1,template.cyclesBeforeLongBreak??4))
    setTagText(template.tags.join(', '))
    setContext(template.context??'')
  }

  async function savePreset(){
    if(!templateName.trim())return
    try{
      await onSaveTemplate({
        name:templateName.trim(),mode,targetMinutes:mode==='countdown'?targetMinutes:undefined,plannedMinutes:mode==='stopwatch'?plannedMinutes:undefined,
        workMinutes:mode==='pomodoro'?workMinutes:undefined,shortBreakMinutes:mode==='pomodoro'?shortBreakMinutes:undefined,longBreakMinutes:mode==='pomodoro'?longBreakMinutes:undefined,cyclesBeforeLongBreak:mode==='pomodoro'?cyclesBeforeLongBreak:undefined,
        tags:tagsFromText(tagText),context:context.trim()||undefined,
      })
      setTemplateName('')
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save preset.')}
  }

  if (!open) return null

  if (!activeSession) {
    const selected = actionable.find((task) => task.id === taskId)
    const previous = selected ? taskTotals[selected.id] ?? 0 : 0
    const estimateRemaining = selected?.durationMinutes ? Math.max(1, Math.ceil((selected.durationMinutes * 60 - previous) / 60)) : undefined
    const cycle:FocusCycleSettings={workSeconds:workMinutes*60,shortBreakSeconds:shortBreakMinutes*60,longBreakSeconds:longBreakMinutes*60,cyclesBeforeLongBreak}
    const selectedTemplate=templates.find((item)=>item.id===templateId)
    return <div ref={dialogRef} className="focus-overlay focus-overlay--launcher focus-overlay--v2" role="dialog" aria-modal="true" aria-label="Start focus session" tabIndex={-1}>
      <button className="focus-overlay__close" onClick={onClose}>Close</button>
      <div className="focus-launcher focus-launcher--v2">
        <div className="kicker">Execution</div><h2>Choose the work. Define the session.</h2><p>Track focused work, not just time with a timer open.</p>

        <div className="focus-week-summary focus-week-summary--v2">
          <div><strong>{formatMinutes(Math.round(todaySeconds/60))}</strong><span>Today · {dailyGoalPercent}% goal</span></div>
          <div><strong>{formatMinutes(Math.round(weekSeconds/60))}</strong><span>This week · {weeklyGoalPercent}% goal</span></div>
          <div><strong>{weekSessionCount}</strong><span>Sessions</span></div>
          <Button onClick={onHistory}>Time log & analytics</Button>
        </div>

        <div className="focus-template-row"><label className="field"><span>Session preset</span><select value={templateId} onChange={(event)=>applyTemplate(event.target.value)}><option value="">Custom session</option>{templates.map((template)=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>{selectedTemplate&&!selectedTemplate.builtin?<Button onClick={()=>void onDeleteTemplate(selectedTemplate.id).then(()=>setTemplateId(''))}>Delete preset</Button>:null}</div>

        {actionable.length ? <>
          <label className="field"><span>Task</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{actionable.map((task, index) => <option key={task.id} value={task.id}>{index === 0 ? 'Suggested · ' : ''}{task.title}{task.project ? ` · ${task.project}` : ''}</option>)}</select></label>
          {selected ? <div className="focus-task-context"><div><span className="eyebrow">Why this work</span><strong>{focusTaskReason(selected)}</strong></div><div><span>{selected.durationMinutes ? `${selected.durationMinutes}m estimate` : 'No estimate'}</span><span>{previous ? `${formatMinutes(Math.round(previous / 60))} already focused` : 'No tracked focus yet'}</span></div></div> : null}
          <label className="field"><span>Session intention <small>optional</small></span><input maxLength={240} value={intention} onChange={(event)=>setIntention(event.target.value)} placeholder="What does a good session accomplish?" /></label>
          <div className="form-grid"><label className="field"><span>Context <small>optional</small></span><input maxLength={120} value={context} onChange={(event)=>setContext(event.target.value)} placeholder="Library, deep work, study…" /></label><label className="field"><span>Tags <small>comma separated</small></span><input value={tagText} onChange={(event)=>setTagText(event.target.value)} placeholder="research, exam, coding" /></label></div>

          <div className="focus-mode-switch focus-mode-switch--v2" role="group" aria-label="Focus mode">
            <button className={mode==='stopwatch'?'is-active':''} onClick={()=>setMode('stopwatch')}><strong>Open</strong><span>Track freely</span></button>
            <button className={mode==='countdown'?'is-active':''} onClick={()=>{setMode('countdown');const s=suggestFocusMinutes(selected,previous);setTargetMinutes(s);setPlannedMinutes(s)}}><strong>Countdown</strong><span>One timed block</span></button>
            <button className={mode==='pomodoro'?'is-active':''} onClick={()=>setMode('pomodoro')}><strong>Pomodoro</strong><span>Focus + breaks</span></button>
          </div>

          {mode==='countdown'?<div className="focus-duration-picker"><span className="eyebrow">Countdown target</span><div>{presets.map((value)=><button key={value} className={targetMinutes===value?'is-active':''} onClick={()=>{setTargetMinutes(value);setPlannedMinutes(value)}}>{value}m</button>)}<label><input type="number" min="1" max="1440" value={targetMinutes} onChange={(event)=>{const value=Math.max(1,Number(event.target.value)||1);setTargetMinutes(value);setPlannedMinutes(value)}}/><span>min</span></label></div>{estimateRemaining?<small>{formatMinutes(Math.round(previous/60))} already focused · about {formatMinutes(estimateRemaining)} remains from the task estimate.</small>:null}</div>
          :mode==='pomodoro'?<div className="focus-cycle-editor"><label><span>Focus</span><input type="number" min="1" max="180" value={workMinutes} onChange={(e)=>setWorkMinutes(Math.max(1,Number(e.target.value)||1))}/><em>min</em></label><label><span>Short break</span><input type="number" min="1" max="60" value={shortBreakMinutes} onChange={(e)=>setShortBreakMinutes(Math.max(1,Number(e.target.value)||1))}/><em>min</em></label><label><span>Long break</span><input type="number" min="1" max="120" value={longBreakMinutes} onChange={(e)=>setLongBreakMinutes(Math.max(1,Number(e.target.value)||1))}/><em>min</em></label><label><span>Long break every</span><input type="number" min="1" max="12" value={cyclesBeforeLongBreak} onChange={(e)=>setCyclesBeforeLongBreak(Math.max(1,Number(e.target.value)||1))}/><em>cycles</em></label></div>
          :<div className="focus-duration-picker focus-duration-picker--plan"><span className="eyebrow">Optional session plan</span><div><button className={plannedMinutes===0?'is-active':''} onClick={()=>setPlannedMinutes(0)}>Open</button>{presets.slice(1).map((value)=><button key={value} className={plannedMinutes===value?'is-active':''} onClick={()=>setPlannedMinutes(value)}>{value}m</button>)}<label><input type="number" min="0" max="1440" value={plannedMinutes} onChange={(e)=>setPlannedMinutes(Math.max(0,Number(e.target.value)||0))}/><span>min</span></label></div></div>}

          <div className="focus-preset-save"><input value={templateName} maxLength={80} onChange={(event)=>setTemplateName(event.target.value)} placeholder="Save current setup as preset…" /><Button disabled={!templateName.trim()} onClick={()=>void savePreset()}>Save preset</Button></div>
          {error?<div className="form-error">{error}</div>:null}
          <Button variant="primary" disabled={!taskId} onClick={()=>void onStart(taskId,mode,mode==='countdown'?targetMinutes*60:undefined,mode==='countdown'?targetMinutes*60:mode==='stopwatch'&&plannedMinutes?plannedMinutes*60:mode==='pomodoro'?workMinutes*60:undefined,intention.trim()||undefined,{context:context.trim()||undefined,tags:tagsFromText(tagText),cycle:mode==='pomodoro'?cycle:undefined}).then(()=>{setIntention('');setSessionNote('')}).catch((reason)=>setError(reason instanceof Error?reason.message:'Could not start focus.'))}>Start focus</Button>
        </>:<div className="focus-launcher__empty"><strong>No ready task to focus on.</strong><span>Complete blockers, create a task, or use the time log to add manual focused work.</span><Button onClick={onHistory}>Open time log</Button></div>}

        {recentSessions.length?<section className="focus-launcher-history"><div className="section-title-row"><span className="eyebrow">Recent sessions</span><em>{recentSessions.length} shown</em></div>{recentSessions.slice(0,5).map((session)=><div key={session.id}><div><strong>{session.taskTitle}</strong><span>{session.projectName??'No project'} · {session.source==='manual'?'Manual · ':''}{formatSessionDate(session.startedAt)}</span></div><em>{formatMinutes(Math.round(session.durationSeconds/60))}</em></div>)}</section>:null}
      </div>
    </div>
  }

  const elapsed=effectiveFocusSeconds(activeSession,now)
  const display=focusDisplaySeconds(activeSession,now)
  const reached=countdownReached(activeSession,now)
  const phaseTarget=focusPhaseTargetSeconds(activeSession)
  const planSeconds=activeSession.mode==='pomodoro'?phaseTarget:(activeSession.targetSeconds??activeSession.plannedSeconds)
  const planPercent=planSeconds?Math.round(Math.min(100,((activeSession.mode==='stopwatch'?elapsed:(planSeconds-display))/planSeconds)*100)):undefined
  const phaseLabel=activeSession.mode==='pomodoro'?focusPhaseLabel(activeSession.phase):activeSession.mode==='countdown'?'Countdown':'Open focus'
  return <div ref={dialogRef} className="focus-overlay focus-overlay--v2" role="dialog" aria-modal="true" aria-label="Focus session" tabIndex={-1}>
    <button className="focus-overlay__close" onClick={onClose}>Minimize</button>
    <div className="focus-overlay__content">
      <div className="kicker">{reached?'Phase complete':activeSession.status==='paused'?'Paused':phaseLabel}</div>
      <h2>{activeSession.taskTitleSnapshot??'Focus session'}</h2>
      <p>{activeSession.projectNameSnapshot??'No project'}{activeSession.mode==='pomodoro'?` · cycle ${(activeSession.cycleIndex??0)+1}`:planSeconds?` · ${formatMinutes(Math.round(planSeconds/60))} planned`:''}</p>
      {activeSession.context||activeSession.tags.length?<div className="focus-active-context">{activeSession.context?<span>{activeSession.context}</span>:null}{activeSession.tags.map((tag)=><em key={tag}>#{tag}</em>)}</div>:null}
      {activeSession.intention?<div className="focus-intention"><span>Session intention</span><strong>{activeSession.intention}</strong></div>:null}
      <strong className={`focus-time ${activeSession.status==='paused'?'is-paused':''}`} aria-label={`Focus time ${formatFocusClock(display)}`}>{formatFocusClock(display)}</strong>
      {planSeconds?<div className={`focus-progress ${activeSession.mode==='stopwatch'?'is-plan':''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={planPercent}><span style={{width:`${planPercent}%`}}/></div>:null}
      <div className="focus-session-meta"><span>Started {formatTime(activeSession.startedAt)}</span><span>{formatMinutes(Math.round(elapsed/60))} focused</span><span>{activeSession.interruptionCount} interruption{activeSession.interruptionCount===1?'':'s'}</span>{activeSession.mode==='pomodoro'?<span>{formatMinutes(Math.round((activeSession.breakSeconds??0)/60))} breaks</span>:null}</div>
      <label className="focus-session-note"><span>Session note <small>saved when you finish</small></span><textarea rows={3} maxLength={4000} value={sessionNote} onChange={(event)=>setSessionNote(event.target.value)} placeholder="What changed, what remains, or where should you resume?"/></label>
      <div className="focus-actions">
        {reached&&activeSession.mode==='pomodoro'?<Button variant="primary" onClick={()=>void onCompletePhase(activeSession.id)}>Next phase <kbd>N</kbd></Button>:activeSession.status==='running'?<Button onClick={()=>void onPause(activeSession.id)}>Pause <kbd>Space</kbd></Button>:<Button variant="primary" onClick={()=>void onResume(activeSession.id)}>Resume <kbd>Space</kbd></Button>}
        {activeSession.status==='running'&&!reached?<Button onClick={()=>void onInterrupt(activeSession.id)}>Interrupt <kbd>I</kbd></Button>:null}
        <Button variant={activeSession.status==='paused'?'primary':'outline'} onClick={()=>void onFinish(activeSession.id,sessionNote.trim()||undefined)}>Finish <kbd>⇧ Enter</kbd></Button>
        <Button onClick={()=>void onFinishTask(activeSession.id,activeSession.taskId,sessionNote.trim()||undefined)}>Finish + complete task</Button>
      </div>
      <button className="focus-cancel" onClick={()=>void onCancel(activeSession.id)}>Cancel session</button>
    </div>
  </div>
}

function formatTime(value:string){return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function formatSessionDate(value:string){return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date(value))}
function formatMinutes(value:number){const safe=Math.max(0,Math.round(value));const h=Math.floor(safe/60),m=safe%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`}
