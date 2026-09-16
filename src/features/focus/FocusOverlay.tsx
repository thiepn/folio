import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { FocusMode, FocusSessionEntity } from '../../domain/models'
import type { FocusSessionPreview, TaskPreview } from '../../types/ui'
import { countdownReached, effectiveFocusSeconds, focusDisplaySeconds, formatFocusClock } from './focusLogic'
import { focusTaskReason, rankFocusTasks, suggestFocusMinutes } from './focusPlanning'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

const presets = [15, 25, 45, 60, 90]

export function FocusOverlay({ open, activeSession, tasks, preferredTaskId, taskTotals, recentSessions = [], todaySeconds = 0, weekSeconds = 0, weekSessionCount = 0, onClose, onStart, onPause, onResume, onFinish, onFinishTask, onCancel }: {
  open: boolean
  activeSession?: FocusSessionEntity
  tasks: TaskPreview[]
  preferredTaskId?: string
  taskTotals: Record<string, number>
  recentSessions?: FocusSessionPreview[]
  todaySeconds?: number
  weekSeconds?: number
  weekSessionCount?: number
  onClose: () => void
  onStart: (taskId: string, mode: FocusMode, targetSeconds?: number, plannedSeconds?: number, intention?: string) => Promise<void>
  onPause: (id: string) => Promise<void>
  onResume: (id: string) => Promise<void>
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
  const [intention, setIntention] = useState('')
  const [sessionNote, setSessionNote] = useState('')
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

  if (!open) return null

  if (!activeSession) {
    const selected = actionable.find((task) => task.id === taskId)
    const previous = selected ? taskTotals[selected.id] ?? 0 : 0
    const estimateRemaining = selected?.durationMinutes ? Math.max(1, Math.ceil((selected.durationMinutes * 60 - previous) / 60)) : undefined
    return (
      <div ref={dialogRef} className="focus-overlay focus-overlay--launcher focus-overlay--v16" role="dialog" aria-modal="true" aria-label="Start focus session" tabIndex={-1}>
        <button className="focus-overlay__close" onClick={onClose}>Close</button>
        <div className="focus-launcher focus-launcher--v16">
          <div className="kicker">Execution</div>
          <h2>Choose the work. Define the session.</h2>
          <p>Folio prioritizes ready work, but the final choice stays yours.</p>

          <div className="focus-week-summary">
            <div><strong>{formatMinutes(Math.round(todaySeconds / 60))}</strong><span>Today</span></div>
            <div><strong>{formatMinutes(Math.round(weekSeconds / 60))}</strong><span>This week</span></div>
            <div><strong>{weekSessionCount}</strong><span>Sessions</span></div>
          </div>

          {actionable.length ? <>
            <label className="field"><span>Task</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{actionable.map((task, index) => <option key={task.id} value={task.id}>{index === 0 ? 'Suggested · ' : ''}{task.title}{task.project ? ` · ${task.project}` : ''}</option>)}</select></label>
            {selected ? <div className="focus-task-context"><div><span className="eyebrow">Why this work</span><strong>{focusTaskReason(selected)}</strong></div><div><span>{selected.durationMinutes ? `${selected.durationMinutes}m estimate` : 'No estimate'}</span><span>{previous ? `${formatMinutes(Math.round(previous / 60))} already focused` : 'No tracked focus yet'}</span></div></div> : null}

            <label className="field"><span>Session intention <small>optional</small></span><input maxLength={240} value={intention} onChange={(event) => setIntention(event.target.value)} placeholder="What does a good session accomplish?" /></label>

            <div className="focus-mode-switch" role="group" aria-label="Focus mode">
              <button className={mode === 'stopwatch' ? 'is-active' : ''} onClick={() => setMode('stopwatch')}><strong>Open session</strong><span>Track freely; planned time is guidance</span></button>
              <button className={mode === 'countdown' ? 'is-active' : ''} onClick={() => { setMode('countdown'); const suggested = suggestFocusMinutes(selected, previous); setTargetMinutes(suggested); setPlannedMinutes(suggested) }}><strong>Timed session</strong><span>Pause automatically at the target</span></button>
            </div>

            {mode === 'countdown' ? <div className="focus-duration-picker"><span className="eyebrow">Countdown target</span><div>{presets.map((minutes) => <button key={minutes} className={targetMinutes === minutes ? 'is-active' : ''} onClick={() => { setTargetMinutes(minutes); setPlannedMinutes(minutes) }}>{minutes}m</button>)}<label><input type="number" min="1" max="1440" value={targetMinutes} onChange={(event) => { const value = Math.max(1, Number(event.target.value) || 1); setTargetMinutes(value); setPlannedMinutes(value) }} /><span>min</span></label></div>{estimateRemaining ? <small>{formatMinutes(Math.round(previous / 60))} already focused · about {formatMinutes(estimateRemaining)} remains from the task estimate.</small> : null}</div> : <div className="focus-duration-picker focus-duration-picker--plan"><span className="eyebrow">Optional session plan</span><div><button className={plannedMinutes === 0 ? 'is-active' : ''} onClick={() => setPlannedMinutes(0)}>Open</button>{presets.slice(1).map((minutes) => <button key={minutes} className={plannedMinutes === minutes ? 'is-active' : ''} onClick={() => setPlannedMinutes(minutes)}>{minutes}m</button>)}<label><input type="number" min="0" max="1440" value={plannedMinutes} onChange={(event) => setPlannedMinutes(Math.max(0, Number(event.target.value) || 0))} /><span>min</span></label></div><small>A stopwatch plan never stops the session. It only gives the work a visible boundary.</small></div>}

            {error ? <div className="form-error">{error}</div> : null}
            <Button variant="primary" disabled={!taskId} onClick={() => void onStart(taskId, mode, mode === 'countdown' ? targetMinutes * 60 : undefined, (mode === 'countdown' ? targetMinutes : plannedMinutes) ? (mode === 'countdown' ? targetMinutes : plannedMinutes) * 60 : undefined, intention.trim() || undefined).then(() => { setIntention(''); setSessionNote('') }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not start focus.'))}>Start focus</Button>
          </> : <div className="focus-launcher__empty"><strong>No ready task to focus on.</strong><span>Complete blockers, create a task, or plan work before starting a session.</span></div>}

          {recentSessions.length ? <section className="focus-launcher-history"><div className="section-title-row"><span className="eyebrow">Recent sessions</span><em>{recentSessions.length} shown</em></div>{recentSessions.slice(0, 5).map((session) => <div key={session.id}><div><strong>{session.taskTitle}</strong><span>{session.projectName ?? 'No project'} · {formatSessionDate(session.startedAt)}</span></div><em>{formatMinutes(Math.round(session.durationSeconds / 60))}</em></div>)}</section> : null}
        </div>
      </div>
    )
  }

  const elapsed = effectiveFocusSeconds(activeSession, now)
  const display = focusDisplaySeconds(activeSession, now)
  const reached = activeSession.mode === 'countdown' && activeSession.targetSeconds && elapsed >= activeSession.targetSeconds
  const planSeconds = activeSession.targetSeconds ?? activeSession.plannedSeconds
  const planPercent = planSeconds ? Math.round(Math.min(100, (elapsed / planSeconds) * 100)) : undefined
  return (
    <div ref={dialogRef} className="focus-overlay focus-overlay--v16" role="dialog" aria-modal="true" aria-label="Focus session" tabIndex={-1}>
      <button className="focus-overlay__close" onClick={onClose}>Leave view</button>
      <div className="focus-overlay__content">
        <div className="kicker">{activeSession.status === 'paused' ? reached ? 'Target reached' : 'Paused' : activeSession.mode === 'countdown' ? 'Timed focus' : 'Open focus'}</div>
        <h2>{activeSession.taskTitleSnapshot ?? 'Focus session'}</h2>
        <p>{activeSession.projectNameSnapshot ?? 'No project'}{planSeconds ? ` · ${formatMinutes(Math.round(planSeconds / 60))} planned` : ''}</p>
        {activeSession.intention ? <div className="focus-intention"><span>Session intention</span><strong>{activeSession.intention}</strong></div> : null}
        <strong className={`focus-time ${activeSession.status === 'paused' ? 'is-paused' : ''}`} aria-label={`Focus time ${formatFocusClock(display)}`}>{formatFocusClock(display)}</strong>
        {planSeconds ? <div className={`focus-progress ${activeSession.mode === 'stopwatch' ? 'is-plan' : ''}`} role="progressbar" aria-label={activeSession.mode === 'countdown' ? 'Countdown progress' : 'Session plan progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={planPercent}><span style={{ width: `${planPercent}%` }} /></div> : null}
        <div className="focus-session-meta"><span>Started {formatTime(activeSession.startedAt)}</span><span>{formatMinutes(Math.round(elapsed / 60))} tracked</span>{planSeconds ? <span>{elapsed >= planSeconds ? `${formatMinutes(Math.round((elapsed - planSeconds) / 60))} beyond plan` : `${formatMinutes(Math.ceil((planSeconds - elapsed) / 60))} to plan`}</span> : null}</div>
        <label className="focus-session-note"><span>Session note <small>saved when you finish</small></span><textarea rows={3} maxLength={2000} value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} placeholder="What changed, what remains, or where should you resume?" /></label>
        <div className="focus-actions">
          {activeSession.status === 'running' ? <Button onClick={() => void onPause(activeSession.id)}>Pause</Button> : !reached ? <Button variant="primary" onClick={() => void onResume(activeSession.id)}>Resume</Button> : null}
          <Button variant={activeSession.status === 'paused' ? 'primary' : 'outline'} onClick={() => void onFinish(activeSession.id, sessionNote.trim() || undefined)}>Finish session</Button>
          <Button onClick={() => void onFinishTask(activeSession.id, activeSession.taskId, sessionNote.trim() || undefined)}>Finish + complete task</Button>
        </div>
        <button className="focus-cancel" onClick={() => void onCancel(activeSession.id)}>Cancel session</button>
      </div>
    </div>
  )
}

function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatSessionDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value)) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
