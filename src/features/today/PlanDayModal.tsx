import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { TaskRow } from '../../components/ui/TaskRow'
import type { DailyPlanBucket } from '../../domain/models'
import type { HabitPreview, TaskPreview } from '../../types/ui'
import { formatMinutes } from './TodayView'
import { outstandingHabitMinutes, plannedDayMinutes, recommendDeferrals } from './planningLogic'

const steps = ['Carryover', 'Deadlines', 'Balance', 'Commit'] as const

export function PlanDayModal({
  open, today, tasks, carryover, deadlines, habits, capacity, defaultCapacity, planStatus,
  onClose, onMoveDate, onBucket, onSetCapacity, onCommit, onOpenTask, onToggleTask,
}: {
  open: boolean
  today: string
  tasks: TaskPreview[]
  carryover: TaskPreview[]
  deadlines: TaskPreview[]
  habits: HabitPreview[]
  capacity: number
  defaultCapacity: number
  planStatus: 'draft' | 'committed'
  onClose: () => void
  onMoveDate: (id: string, target: 'today' | 'tomorrow' | 'later') => Promise<void>
  onBucket: (id: string, bucket: DailyPlanBucket) => Promise<void>
  onSetCapacity: (minutes?: number) => Promise<void>
  onCommit: () => Promise<void>
  onOpenTask: (id: string) => void
  onToggleTask: (id: string) => void
}) {
  const [step, setStep] = useState(0)
  const [capacityInput, setCapacityInput] = useState(String(capacity))

  useEffect(() => {
    if (!open) return
    setStep(0)
    setCapacityInput(String(capacity))
  }, [open])

  const incomplete = tasks.filter((task) => !task.completed)
  const plannedMinutes = plannedDayMinutes(tasks, habits)
  const habitMinutes = outstandingHabitMinutes(habits)
  const remaining = capacity - plannedMinutes
  const unplannedDeadlines = deadlines.filter((task) => task.plannedDate !== today && !task.completed)

  const suggestions = recommendDeferrals(tasks, Math.max(0, -remaining), today)

  async function saveCapacity() {
    const value = Number(capacityInput)
    if (!Number.isFinite(value) || value < 30) return
    await onSetCapacity(Math.round(value))
  }

  async function finish() {
    await onCommit()
    onClose()
  }

  if (!open) return null
  return (
    <Modal open title="Plan Day" className="plan-day-modal" onClose={onClose} footer={<div className="plan-day__footer-inner"><Button onClick={onClose}>Close</Button><div>{step > 0 ? <Button onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</Button> : null}{step < steps.length - 1 ? <Button variant="primary" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Continue</Button> : <Button variant="primary" onClick={() => void finish()}>{planStatus === 'committed' ? 'Recommit Plan' : 'Commit Plan'}</Button>}</div></div>}>
      <div className="plan-day">
        <div className="plan-day__steps" aria-label="Daily planning progress">
          {steps.map((label, index) => <button key={label} className={index === step ? 'is-active' : index < step ? 'is-done' : ''} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}
        </div>

        {step === 0 ? <section className="plan-day__section">
          <div className="plan-day__intro"><span className="eyebrow">Step 1</span><h3>Resolve unfinished work.</h3><p>Carryover should be a decision, not an automatic rollover. Choose what genuinely deserves another place in the plan.</p></div>
          <div className="plan-day__list">
            {carryover.length ? carryover.map((task) => <PlanDecisionRow key={task.id} task={task} onOpen={onOpenTask} onToggle={onToggleTask} actions={<><Button variant="primary" onClick={() => void onMoveDate(task.id, 'today')}>Today</Button><Button onClick={() => void onMoveDate(task.id, 'tomorrow')}>Tomorrow</Button><Button onClick={() => void onMoveDate(task.id, 'later')}>Later</Button></>} />) : <div className="plan-day__clear"><strong>No carryover.</strong><span>Yesterday is not leaking into today.</span></div>}
          </div>
        </section> : null}

        {step === 1 ? <section className="plan-day__section">
          <div className="plan-day__intro"><span className="eyebrow">Step 2</span><h3>Protect approaching deadlines.</h3><p>Only pull work into Today when the deadline or consequence justifies consuming today's capacity.</p></div>
          <div className="plan-day__list">
            {unplannedDeadlines.length ? unplannedDeadlines.map((task) => <PlanDecisionRow key={task.id} task={task} onOpen={onOpenTask} onToggle={onToggleTask} actions={<><Button variant="primary" onClick={() => void onMoveDate(task.id, 'today')}>Add Today</Button><Button onClick={() => onOpenTask(task.id)}>Inspect</Button></>} />) : <div className="plan-day__clear"><strong>No unplanned deadline pressure.</strong><span>Everything due soon is already accounted for or completed.</span></div>}
          </div>
        </section> : null}

        {step === 2 ? <section className="plan-day__section">
          <div className="plan-day__intro"><span className="eyebrow">Step 3</span><h3>Make the day fit.</h3><p>Must is protected, Planned is committed, Optional is expendable. Capacity is a constraint—not a productivity score.</p></div>
          <div className="plan-day__capacity">
            <div><span>Planned workload</span><strong>{formatMinutes(plannedMinutes)}</strong><small>{habitMinutes ? `${formatMinutes(habitMinutes)} habits included` : 'No habit time reserved'}</small></div>
            <div><span>Daily capacity</span><strong>{formatMinutes(capacity)}</strong></div>
            <div className={remaining < 0 ? 'is-warning' : ''}><span>{remaining < 0 ? 'Over by' : 'Margin'}</span><strong>{formatMinutes(Math.abs(remaining))}</strong></div>
          </div>
          <div className="plan-day__capacity-edit">
            <label><span>Capacity for this day</span><input type="number" min="30" step="15" value={capacityInput} onChange={(event) => setCapacityInput(event.target.value)} /></label>
            <Button onClick={() => void saveCapacity()}>Use {capacityInput || '—'} min</Button>
            {capacity !== defaultCapacity ? <Button onClick={() => { setCapacityInput(String(defaultCapacity)); void onSetCapacity(undefined) }}>Use default ({formatMinutes(defaultCapacity)})</Button> : null}
          </div>
          <div className="plan-buckets-preview">
            {(['must', 'planned', 'optional'] as DailyPlanBucket[]).map((bucket) => <div key={bucket}><header><strong>{bucket}</strong><span>{incomplete.filter((task) => (task.planningBucket ?? 'planned') === bucket).reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0) ? formatMinutes(incomplete.filter((task) => (task.planningBucket ?? 'planned') === bucket).reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0)) : '0m'}</span></header>{incomplete.filter((task) => (task.planningBucket ?? 'planned') === bucket).map((task) => <div className="plan-bucket-item" key={task.id}><span>{task.title}</span><select value={task.planningBucket ?? 'planned'} onChange={(event) => void onBucket(task.id, event.target.value as DailyPlanBucket)}><option value="must">Must</option><option value="planned">Planned</option><option value="optional">Optional</option></select></div>)}</div>)}
          </div>
          {remaining < 0 ? <div className="plan-day__recommendation"><span className="eyebrow">Recommendation</span><strong>Reduce {formatMinutes(Math.abs(remaining))} before committing.</strong>{suggestions.length ? <p>Best candidates: {suggestions.map((task) => task.title).join(', ')}. Start with Optional work and tasks without today's deadline.</p> : <p>All remaining work is protected. Increase capacity only if the time genuinely exists.</p>}</div> : null}
        </section> : null}

        {step === 3 ? <section className="plan-day__section">
          <div className="plan-day__intro"><span className="eyebrow">Step 4</span><h3>{planStatus === 'committed' ? 'Recommit the day.' : 'Commit the day.'}</h3><p>This does not lock tasks. It marks the plan as intentional so later changes are visible as changes rather than silent drift.</p></div>
          <div className="plan-day__commit-summary">
            <strong>{incomplete.length} open tasks · {formatMinutes(plannedMinutes)}</strong>
            <span>{habitMinutes ? `${formatMinutes(habitMinutes)} of the plan is unfinished habit time. ` : ''}{remaining >= 0 ? `${formatMinutes(remaining)} margin remains.` : `${formatMinutes(Math.abs(remaining))} over capacity.`}</span>
            <div><span>{incomplete.filter((task) => task.planningBucket === 'must').length} Must</span><span>{incomplete.filter((task) => (task.planningBucket ?? 'planned') === 'planned').length} Planned</span><span>{incomplete.filter((task) => task.planningBucket === 'optional').length} Optional</span></div>
          </div>
          {remaining < 0 ? <div className="form-error">The app will still let you commit an overloaded day, but it is intentionally warning you first.</div> : null}
        </section> : null}
      </div>
    </Modal>
  )
}

function PlanDecisionRow({ task, actions, onOpen, onToggle }: { task: TaskPreview; actions: ReactNode; onOpen: (id: string) => void; onToggle: (id: string) => void }) {
  return <div className="plan-decision-row"><TaskRow task={task} onOpen={onOpen} onToggle={onToggle} /><div className="plan-decision-row__actions">{actions}</div></div>
}
