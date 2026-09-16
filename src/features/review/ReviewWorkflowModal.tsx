import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { ReviewRecordEntity } from '../../domain/models'
import type { ReviewSnapshot, ReviewTaskIssue, ReviewTaskReference } from './reviewLogic'

const steps = ['Carryover', 'Friction', 'Deadlines', 'Reflect'] as const

export interface WeeklyReviewReflection {
  summary: string
  wins: string
  friction: string
  lessons: string
  nextFocus: string
}

export function ReviewWorkflowModal({ open, snapshot, existingRecord, onClose, onMoveTask, onTrashTask, onOpenTask, onSaveReview, onOpenPlanner }: {
  open: boolean
  snapshot?: ReviewSnapshot
  existingRecord?: ReviewRecordEntity | null
  onClose: () => void
  onMoveTask: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onTrashTask: (id: string) => void
  onOpenTask: (id: string) => void
  onSaveReview: (reflection: WeeklyReviewReflection) => Promise<void>
  onOpenPlanner: () => void
}) {
  const [step, setStep] = useState(0)
  const [summary, setSummary] = useState('')
  const [wins, setWins] = useState('')
  const [friction, setFriction] = useState('')
  const [lessons, setLessons] = useState('')
  const [nextFocus, setNextFocus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setSummary(existingRecord?.summary ?? '')
    setWins(existingRecord?.wins ?? '')
    setFriction(existingRecord?.friction ?? '')
    setLessons(existingRecord?.lessons ?? '')
    setNextFocus(existingRecord?.nextFocus ?? '')
    setSaving(false)
    setError('')
  }, [open, existingRecord])

  const title = steps[step]
  const canBack = step > 0
  const final = step === steps.length - 1
  const subtitle = useMemo(() => snapshot ? `${formatDate(snapshot.weekStart)}–${formatDate(snapshot.weekEnd)}` : '', [snapshot])

  async function finish() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSaveReview({ summary, wins, friction, lessons, nextFocus })
      onClose()
      onOpenPlanner()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The weekly review could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal
    open={open}
    title="Weekly review"
    onClose={onClose}
    className="review-workflow-modal"
    footer={<div className="review-workflow-footer">
      <div>{canBack ? <Button onClick={() => setStep((value) => value - 1)}>Back</Button> : <span />}</div>
      <div className="review-workflow-footer__right">
        <span className="review-workflow-count">{step + 1} / {steps.length}</span>
        {final ? <Button variant="primary" disabled={saving} onClick={() => void finish()}>{saving ? 'Saving…' : existingRecord ? 'Update review & plan next week' : 'Save review & plan next week'}</Button> : <Button variant="primary" onClick={() => setStep((value) => value + 1)}>Continue</Button>}
      </div>
    </div>}
  >
    {!snapshot ? <div className="empty-state">Preparing review…</div> : <>
      <div className="review-workflow-rail">{steps.map((label, index) => <div key={label} className={index === step ? 'is-active' : index < step ? 'is-done' : ''}><span>{index + 1}</span><b>{label}</b></div>)}</div>
      <header className="review-workflow-intro"><div className="eyebrow">{subtitle}</div><h3>{title}</h3>{step === 0 ? <p>Resolve unfinished work instead of letting yesterday silently become today.</p> : step === 1 ? <p>Repeatedly postponed and stale work needs a deliberate decision, not another automatic rollover.</p> : step === 2 ? <p>Look ahead before next week is filled with discretionary work.</p> : <p>Preserve what you learned. This reflection becomes part of Folio's durable history.</p>}</header>
      {step === 0 ? <CarryoverStep tasks={snapshot.carryoverTasks} onMoveTask={onMoveTask} onOpenTask={onOpenTask} /> : null}
      {step === 1 ? <FrictionStep postponed={snapshot.postponedTasks} stale={snapshot.staleTasks} onMoveTask={onMoveTask} onTrashTask={onTrashTask} onOpenTask={onOpenTask} /> : null}
      {step === 2 ? <DeadlineStep overdue={snapshot.overdueDeadlines} nextWeek={snapshot.nextWeekDeadlines} onMoveTask={onMoveTask} onOpenTask={onOpenTask} /> : null}
      {step === 3 ? <ReflectStep snapshot={snapshot} {...{ summary, setSummary, wins, setWins, friction, setFriction, lessons, setLessons, nextFocus, setNextFocus }} /> : null}
      {error ? <div className="form-error">{error}</div> : null}
    </>}
  </Modal>
}

function CarryoverStep({ tasks, onMoveTask, onOpenTask }: { tasks: ReviewTaskReference[]; onMoveTask: (id: string, target: 'today' | 'tomorrow' | 'later') => void; onOpenTask: (id: string) => void }) {
  if (!tasks.length) return <ReviewOkay title="No unresolved carryover" detail="Nothing planned before today is still open." />
  return <div className="review-workflow-list">{tasks.slice(0, 12).map((task) => <ReviewTask key={task.id} task={task} meta={task.plannedDate ? `Planned ${formatDate(task.plannedDate)}` : 'Unplanned'} actions={<><button onClick={() => onMoveTask(task.id, 'today')}>Today</button><button onClick={() => onMoveTask(task.id, 'tomorrow')}>Tomorrow</button><button onClick={() => onMoveTask(task.id, 'later')}>Later</button><button onClick={() => onOpenTask(task.id)}>Inspect</button></>} />)}</div>
}

function FrictionStep({ postponed, stale, onMoveTask, onTrashTask, onOpenTask }: { postponed: ReviewTaskIssue[]; stale: ReviewTaskIssue[]; onMoveTask: (id: string, target: 'today' | 'tomorrow' | 'later') => void; onTrashTask: (id: string) => void; onOpenTask: (id: string) => void }) {
  const items = dedupeIssues([...postponed, ...stale]).slice(0, 14)
  if (!items.length) return <ReviewOkay title="Backlog looks healthy" detail="No repeatedly postponed or stale tasks need attention." />
  return <div className="review-workflow-list">{items.map((task) => <ReviewTask key={task.id} task={task} meta={task.reason} actions={<><button onClick={() => onOpenTask(task.id)}>Inspect</button><button onClick={() => onMoveTask(task.id, 'tomorrow')}>Tomorrow</button><button onClick={() => onMoveTask(task.id, 'later')}>Later</button><button className="is-danger" onClick={() => onTrashTask(task.id)}>Trash</button></>} />)}</div>
}

function DeadlineStep({ overdue, nextWeek, onMoveTask, onOpenTask }: { overdue: ReviewTaskReference[]; nextWeek: ReviewTaskReference[]; onMoveTask: (id: string, target: 'today' | 'tomorrow' | 'later') => void; onOpenTask: (id: string) => void }) {
  return <div className="review-workflow-deadlines">
    <section><div className="eyebrow">Overdue</div>{overdue.length ? <div className="review-workflow-list">{overdue.slice(0, 8).map((task) => <ReviewTask key={task.id} task={task} meta={`Due ${task.deadline ? formatDate(task.deadline) : '—'}`} actions={<><button onClick={() => onMoveTask(task.id, 'today')}>Today</button><button onClick={() => onOpenTask(task.id)}>Inspect</button></>} />)}</div> : <ReviewOkay title="No overdue deadlines" detail="Nothing currently needs deadline recovery." />}</section>
    <section><div className="eyebrow">Next week</div>{nextWeek.length ? <div className="review-workflow-list">{nextWeek.slice(0, 10).map((task) => <ReviewTask key={task.id} task={task} meta={`Due ${task.deadline ? formatDate(task.deadline) : '—'}`} actions={<button onClick={() => onOpenTask(task.id)}>Inspect</button>} />)}</div> : <ReviewOkay title="No deadlines next week" detail="The next week currently has no hard task deadlines." />}</section>
  </div>
}

function ReflectStep({ snapshot, summary, setSummary, wins, setWins, friction, setFriction, lessons, setLessons, nextFocus, setNextFocus }: {
  snapshot: ReviewSnapshot
  summary: string; setSummary: (value: string) => void
  wins: string; setWins: (value: string) => void
  friction: string; setFriction: (value: string) => void
  lessons: string; setLessons: (value: string) => void
  nextFocus: string; setNextFocus: (value: string) => void
}) {
  return <div className="review-reflection-step">
    <div className="review-next-week__summary">
      <div><strong>{snapshot.completedPlannedCount}/{snapshot.plannedThroughTodayCount}</strong><span>Planned tasks done</span></div>
      <div><strong>{formatDuration(snapshot.focusWeekSeconds)}</strong><span>Focused</span></div>
      <div><strong>{snapshot.nextWeekDeadlines.length}</strong><span>Deadlines next week</span></div>
    </div>
    <label className="field"><span>Week summary</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What happened this week?" /></label>
    <div className="review-reflection-grid">
      <label className="field"><span>Wins</span><textarea rows={4} value={wins} onChange={(event) => setWins(event.target.value)} placeholder="What worked well?" /></label>
      <label className="field"><span>Friction</span><textarea rows={4} value={friction} onChange={(event) => setFriction(event.target.value)} placeholder="What repeatedly got in the way?" /></label>
      <label className="field"><span>Lessons</span><textarea rows={4} value={lessons} onChange={(event) => setLessons(event.target.value)} placeholder="What should the system learn?" /></label>
      <label className="field"><span>Next focus</span><textarea rows={4} value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} placeholder="What deserves protected attention next week?" /></label>
    </div>
    <section><div className="eyebrow">Evidence-based corrections</div><div className="review-recommendation-stack">{snapshot.recommendations.map((item) => <article key={item.id} className={`review-recommendation is-${item.tone}`}><span /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></section>
  </div>
}

function ReviewTask({ task, meta, actions }: { task: ReviewTaskReference; meta: string; actions: ReactNode }) {
  return <div className="review-workflow-task"><div><strong>{task.title}</strong><span>{[task.projectName, meta, task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : ''].filter(Boolean).join(' · ')}</span></div><div className="review-workflow-task__actions">{actions}</div></div>
}

function ReviewOkay({ title, detail }: { title: string; detail: string }) { return <div className="review-okay"><strong>{title}</strong><span>{detail}</span></div> }
function dedupeIssues(items: ReviewTaskIssue[]) { const seen = new Set<string>(); return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id))) }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDuration(seconds: number) { return formatMinutes(Math.round(seconds / 60)) }
