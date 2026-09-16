import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { FocusMode, FocusSessionEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import { countdownReached, effectiveFocusSeconds, focusDisplaySeconds, formatFocusClock } from './focusLogic'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

const presets = [15, 25, 45, 60, 90]

export function FocusOverlay({ open, activeSession, tasks, preferredTaskId, taskTotals, onClose, onStart, onPause, onResume, onFinish, onFinishTask, onCancel }: {
  open: boolean
  activeSession?: FocusSessionEntity
  tasks: TaskPreview[]
  preferredTaskId?: string
  taskTotals: Record<string, number>
  onClose: () => void
  onStart: (taskId: string, mode: FocusMode, targetSeconds?: number) => Promise<void>
  onPause: (id: string) => Promise<void>
  onResume: (id: string) => Promise<void>
  onFinish: (id: string) => Promise<void>
  onFinishTask: (id: string, taskId?: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
}) {
  useOverlayScrollLock(open)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocusTrap(open, dialogRef, onClose)
  const actionable = useMemo(() => tasks.filter((task) => !task.completed && task.status === 'todo'), [tasks])
  const initial = preferredTaskId && actionable.some((task) => task.id === preferredTaskId) ? preferredTaskId : actionable[0]?.id ?? ''
  const [taskId, setTaskId] = useState(initial)
  const [mode, setMode] = useState<FocusMode>('stopwatch')
  const [targetMinutes, setTargetMinutes] = useState(25)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (preferredTaskId && actionable.some((task) => task.id === preferredTaskId)) setTaskId(preferredTaskId)
    else if (!actionable.some((task) => task.id === taskId)) setTaskId(actionable[0]?.id ?? '')
  }, [open, preferredTaskId, actionable, taskId])

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
      <div ref={dialogRef} className="focus-overlay focus-overlay--launcher" role="dialog" aria-modal="true" aria-label="Start focus session" tabIndex={-1}>
        <button className="focus-overlay__close" onClick={onClose}>Close</button>
        <div className="focus-launcher">
          <div className="kicker">Execution</div>
          <h2>Start focus.</h2>
          <p>Choose one task. The rest of the application can wait.</p>
          <label className="field"><span>Task</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{actionable.map((task) => <option key={task.id} value={task.id}>{task.title}{task.project ? ` · ${task.project}` : ''}</option>)}</select></label>
          <div className="focus-mode-switch" role="group" aria-label="Focus mode">
            <button className={mode === 'stopwatch' ? 'is-active' : ''} onClick={() => setMode('stopwatch')}><strong>Stopwatch</strong><span>Work until you stop</span></button>
            <button className={mode === 'countdown' ? 'is-active' : ''} onClick={() => { setMode('countdown'); if (estimateRemaining) setTargetMinutes(Math.min(estimateRemaining, 240)) }}><strong>Countdown</strong><span>Stop at a target</span></button>
          </div>
          {mode === 'countdown' ? <div className="focus-duration-picker"><span className="eyebrow">Target</span><div>{presets.map((minutes) => <button key={minutes} className={targetMinutes === minutes ? 'is-active' : ''} onClick={() => setTargetMinutes(minutes)}>{minutes}m</button>)}<label><input type="number" min="1" max="1440" value={targetMinutes} onChange={(event) => setTargetMinutes(Math.max(1, Number(event.target.value) || 1))} /><span>min</span></label></div>{estimateRemaining ? <small>{formatMinutes(Math.round(previous / 60))} already focused · about {formatMinutes(estimateRemaining)} remains from the task estimate.</small> : null}</div> : selected && previous ? <div className="focus-launcher__history">Already tracked on this task: <strong>{formatMinutes(Math.round(previous / 60))}</strong></div> : null}
          {error ? <div className="form-error">{error}</div> : null}
          <Button variant="primary" disabled={!taskId} onClick={() => void onStart(taskId, mode, mode === 'countdown' ? targetMinutes * 60 : undefined).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not start focus.'))}>Start focus</Button>
        </div>
      </div>
    )
  }

  const elapsed = effectiveFocusSeconds(activeSession, now)
  const display = focusDisplaySeconds(activeSession, now)
  const reached = activeSession.mode === 'countdown' && activeSession.targetSeconds && elapsed >= activeSession.targetSeconds
  return (
    <div ref={dialogRef} className="focus-overlay" role="dialog" aria-modal="true" aria-label="Focus session" tabIndex={-1}>
      <button className="focus-overlay__close" onClick={onClose}>Leave view</button>
      <div className="focus-overlay__content">
        <div className="kicker">{activeSession.status === 'paused' ? reached ? 'Target reached' : 'Paused' : activeSession.mode === 'countdown' ? 'Countdown' : 'Stopwatch'}</div>
        <h2>{activeSession.taskTitleSnapshot ?? 'Focus session'}</h2>
        <p>{activeSession.projectNameSnapshot ?? 'No project'}{activeSession.mode === 'countdown' && activeSession.targetSeconds ? ` · ${formatMinutes(Math.round(activeSession.targetSeconds / 60))} target` : ''}</p>
        <strong className={`focus-time ${activeSession.status === 'paused' ? 'is-paused' : ''}`} aria-label={`Focus time ${formatFocusClock(display)}`}>{formatFocusClock(display)}</strong>
        {activeSession.mode === 'countdown' ? <div className="focus-progress" role="progressbar" aria-label="Countdown progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, (elapsed / (activeSession.targetSeconds ?? 1)) * 100))}><span style={{ width: `${Math.min(100, (elapsed / (activeSession.targetSeconds ?? 1)) * 100)}%` }} /></div> : null}
        <div className="focus-session-meta"><span>Started {formatTime(activeSession.startedAt)}</span><span>{formatMinutes(Math.round(elapsed / 60))} tracked</span></div>
        <div className="focus-actions">
          {activeSession.status === 'running' ? <Button onClick={() => void onPause(activeSession.id)}>Pause</Button> : !reached ? <Button variant="primary" onClick={() => void onResume(activeSession.id)}>Resume</Button> : null}
          <Button variant={activeSession.status === 'paused' ? 'primary' : 'outline'} onClick={() => void onFinish(activeSession.id)}>Finish session</Button>
          <Button onClick={() => void onFinishTask(activeSession.id, activeSession.taskId)}>Finish + complete task</Button>
        </div>
        <button className="focus-cancel" onClick={() => void onCancel(activeSession.id)}>Cancel session</button>
      </div>
    </div>
  )
}

function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
