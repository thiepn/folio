import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { ReviewSnapshot, ReviewTaskIssue, ReviewTaskReference } from './reviewLogic'

const steps = ['Carryover', 'Friction', 'Deadlines', 'Next week'] as const

export function ReviewWorkflowModal({ open, snapshot, onClose, onMoveTask, onTrashTask, onOpenTask, onOpenPlanner }: {
  open: boolean
  snapshot?: ReviewSnapshot
  onClose: () => void
  onMoveTask: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onTrashTask: (id: string) => void
  onOpenTask: (id: string) => void
  onOpenPlanner: () => void
}) {
  const [step, setStep] = useState(0)
  useEffect(() => { if (open) setStep(0) }, [open])
  const title = steps[step]
  const canBack = step > 0
  const final = step === steps.length - 1
  const subtitle = useMemo(() => snapshot ? `${formatDate(snapshot.weekStart)}–${formatDate(snapshot.weekEnd)}` : '', [snapshot])

  return <Modal
    open={open}
    title="Weekly review"
    onClose={onClose}
    className="review-workflow-modal"
    footer={<div className="review-workflow-footer">
      <div>{canBack ? <Button onClick={() => setStep((value) => value - 1)}>Back</Button> : <span />}</div>
      <div className="review-workflow-footer__right">
        <span className="review-workflow-count">{step + 1} / {steps.length}</span>
        {final ? <Button variant="primary" onClick={() => { onClose(); onOpenPlanner() }}>Open Planner</Button> : <Button variant="primary" onClick={() => setStep((value) => value + 1)}>Continue</Button>}
      </div>
    </div>}
  >
    {!snapshot ? <div className="empty-state">Preparing review…</div> : <>
      <div className="review-workflow-rail">{steps.map((label, index) => <div key={label} className={index === step ? 'is-active' : index < step ? 'is-done' : ''}><span>{index + 1}</span><b>{label}</b></div>)}</div>
      <header className="review-workflow-intro"><div className="eyebrow">{subtitle}</div><h3>{title}</h3>{step === 0 ? <p>Resolve unfinished work instead of letting yesterday silently become today.</p> : step === 1 ? <p>Repeatedly postponed and stale work needs a deliberate decision, not another automatic rollover.</p> : step === 2 ? <p>Look ahead before next week is filled with discretionary work.</p> : <p>Carry the useful corrections into the next planning cycle.</p>}</header>
      {step === 0 ? <CarryoverStep tasks={snapshot.carryoverTasks} onMoveTask={onMoveTask} onOpenTask={onOpenTask} /> : null}
      {step === 1 ? <FrictionStep postponed={snapshot.postponedTasks} stale={snapshot.staleTasks} onMoveTask={onMoveTask} onTrashTask={onTrashTask} onOpenTask={onOpenTask} /> : null}
      {step === 2 ? <DeadlineStep overdue={snapshot.overdueDeadlines} nextWeek={snapshot.nextWeekDeadlines} onMoveTask={onMoveTask} onOpenTask={onOpenTask} /> : null}
      {step === 3 ? <NextWeekStep snapshot={snapshot} /> : null}
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

function NextWeekStep({ snapshot }: { snapshot: ReviewSnapshot }) {
  const academic = snapshot.projectMetrics.filter((project) => project.type === 'academic')
  return <div className="review-next-week">
    <div className="review-next-week__summary">
      <div><strong>{snapshot.nextWeekDeadlines.length}</strong><span>Deadlines next week</span></div>
      <div><strong>{snapshot.behindAcademicProjects.length}</strong><span>Courses below pace</span></div>
      <div><strong>{snapshot.neglectedProjects.length}</strong><span>Neglected projects</span></div>
    </div>
    <section><div className="eyebrow">Carry forward these corrections</div><div className="review-recommendation-stack">{snapshot.recommendations.map((item) => <article key={item.id} className={`review-recommendation is-${item.tone}`}><span /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></section>
    {academic.length ? <section><div className="eyebrow">Academic pace</div><div className="review-project-compact">{academic.map((project) => <div key={project.projectId}><strong>{project.name}</strong><span>{formatDuration(project.focusSeconds)} / {formatMinutes(project.weeklyTargetMinutes ?? 0)} · {project.paceStatus ?? '—'}</span></div>)}</div></section> : null}
    <p className="review-next-week__note">The review does not automatically schedule anything. Planner opens next so the week can be committed deliberately.</p>
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
