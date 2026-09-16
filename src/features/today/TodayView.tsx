import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { TaskRow } from '../../components/ui/TaskRow'
import type { DailyPlanBucket } from '../../domain/models'
import type { HabitPreview, SchedulePreview, TaskPreview } from '../../types/ui'
import { plannedDayMinutes } from './planningLogic'

interface ActiveFocusPreview {
  taskId?: string
  title: string
  status: 'running' | 'paused'
}

export function TodayView({
  tasks,
  carryover,
  nextTasks,
  laterTasks,
  habits,
  schedule,
  capacity,
  planStatus,
  deadlineCount,
  activeFocus,
  todayFocusSeconds,
  wrapUpNote,
  onAdd,
  onToggle,
  onToggleHabit,
  onHabitIncrement,
  onOpenHabit,
  onSkipHabit,
  onOpen,
  onPlan,
  onBucket,
  onMoveOrder,
  onMoveDate,
  onFocus,
  onOpenPlanner,
  onSaveWrapUp,
  onRollForward,
}: {
  tasks: TaskPreview[]
  carryover: TaskPreview[]
  nextTasks: TaskPreview[]
  laterTasks: TaskPreview[]
  habits: HabitPreview[]
  schedule: SchedulePreview[]
  capacity: number
  planStatus: 'draft' | 'committed'
  deadlineCount: number
  activeFocus?: ActiveFocusPreview
  todayFocusSeconds: number
  wrapUpNote: string
  onAdd: () => void
  onToggle: (id: string) => void
  onToggleHabit: (id: string) => void
  onHabitIncrement: (id: string, minutes: number) => void
  onOpenHabit: (id: string) => void
  onSkipHabit: (id: string) => void
  onOpen: (id: string) => void
  onPlan: () => void
  onBucket: (id: string, bucket: DailyPlanBucket) => void
  onMoveOrder: (id: string, direction: -1 | 1) => void
  onMoveDate: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onFocus: (id?: string) => void
  onOpenPlanner: () => void
  onSaveWrapUp: (note: string) => void | Promise<void>
  onRollForward: () => void
}) {
  const plannedMinutes = plannedDayMinutes(tasks, habits)
  const remaining = capacity - plannedMinutes
  const incomplete = tasks.filter((task) => !task.completed)
  const optionalMinutes = incomplete.filter((task) => task.planningBucket === 'optional').reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0)
  const mustTasks = tasks.filter((task) => task.planningBucket === 'must')
  const topThree = mustTasks.slice(0, 3)
  const topIds = useMemo(() => new Set(topThree.map((task) => task.id)), [topThree])
  const todayQueue = tasks.filter((task) => !topIds.has(task.id))
  const extraMustCount = Math.max(0, mustTasks.length - topThree.length)
  const suggestion = topThree.find((task) => !task.completed && !task.activeBlockerCount)
    ?? todayQueue.find((task) => !task.completed && task.planningBucket !== 'optional' && !task.activeBlockerCount)
    ?? incomplete.find((task) => !task.activeBlockerCount)
  const workspaceEmpty = !tasks.length && !carryover.length && !nextTasks.length && !laterTasks.length && !habits.length && !schedule.length
  const completedCount = tasks.filter((task) => task.completed).length
  const habitDoneCount = habits.filter((habit) => habit.completed).length
  const habitOpenCount = habits.filter((habit) => !habit.skipped).length
  const [wrapDraft, setWrapDraft] = useState(wrapUpNote)
  const [wrapSaved, setWrapSaved] = useState(false)

  useEffect(() => {
    setWrapDraft(wrapUpNote)
    setWrapSaved(false)
  }, [wrapUpNote])

  async function saveWrapUp() {
    await onSaveWrapUp(wrapDraft)
    setWrapSaved(true)
  }

  return (
    <>
      <PageHeader
        kicker={new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title="Today"
        subtitle="Decide what matters, clear yesterday, then work from one trusted page."
      />

      {workspaceEmpty ? <section className="workspace-start" aria-labelledby="workspace-start-title">
        <div>
          <span className="eyebrow">Fresh workspace</span>
          <h2 id="workspace-start-title">Start with what actually needs doing.</h2>
          <p>Capture one task. Folio will give it a place in Today, Next, or Later as your system grows.</p>
        </div>
        <div className="workspace-start__actions"><Button variant="primary" icon="plus" onClick={onAdd}>Add first task</Button><Button onClick={onPlan}>Set today’s capacity</Button></div>
      </section> : null}

      {!workspaceEmpty ? <>
        <div className={`day-command-bar ${planStatus === 'committed' ? 'is-committed' : ''}`}>
          <div className="day-command-bar__status">
            <span className="day-status-strip__mark" />
            <div>
              <strong>{planStatus === 'committed' ? 'Day planned' : 'Planning still open'}</strong>
              <small>{carryover.length ? `${carryover.length} item${carryover.length === 1 ? '' : 's'} from earlier` : 'No carryover'} · {deadlineCount ? `${deadlineCount} deadline${deadlineCount === 1 ? '' : 's'} soon` : 'No urgent deadlines'}</small>
            </div>
          </div>
          <div className="day-command-bar__actions">
            <Button icon="plus" onClick={onAdd}>Add task</Button>
            <Button variant={planStatus === 'committed' ? 'outline' : 'primary'} onClick={onPlan}>{planStatus === 'committed' ? 'Review plan' : 'Plan day'}</Button>
          </div>
        </div>

        {carryover.length ? <section className="carryover-resolver" aria-labelledby="carryover-heading">
          <div className="carryover-resolver__header">
            <div><span className="eyebrow">Resolve before adding more</span><h2 id="carryover-heading">Carryover</h2></div>
            <span>{carryover.length} unresolved</span>
          </div>
          <div className="carryover-resolver__list">
            {carryover.slice(0, 5).map((task) => (
              <div className="carryover-item" key={task.id}>
                <button className="carryover-item__title" onClick={() => onOpen(task.id)}>
                  <strong>{task.title}</strong>
                  <small>{[task.project, task.plannedDate ? `From ${task.plannedDate}` : undefined].filter(Boolean).join(' · ')}</small>
                </button>
                <div className="carryover-item__actions" aria-label={`Resolve ${task.title}`}>
                  <button onClick={() => onMoveDate(task.id, 'today')}>Today</button>
                  <button onClick={() => onMoveDate(task.id, 'tomorrow')}>Tomorrow</button>
                  <button onClick={() => onMoveDate(task.id, 'later')}>Later</button>
                  <button onClick={() => onToggle(task.id)}>Done</button>
                </div>
              </div>
            ))}
          </div>
          {carryover.length > 5 ? <button className="text-action" onClick={onOpenPlanner}>Review {carryover.length - 5} more in Planner →</button> : null}
        </section> : null}

        <div className="daily-workflow-grid">
          <div className="view-stack daily-workflow-main">
            <Panel title="Top 3" meta="Daily priorities">
              <p className="daily-section-intro">The first three <strong>Must</strong> tasks are your protected priorities. Keep this list deliberately small.</p>
              {topThree.length ? <div className="top-three-list">{topThree.map((task, index) => (
                <div className={`top-three-item ${task.completed ? 'is-complete' : ''}`} key={task.id}>
                  <span className="top-three-item__rank" aria-hidden="true">{index + 1}</span>
                  <div className="top-three-item__task"><TodayTask task={task} first={index === 0} last={index === topThree.length - 1 && !extraMustCount} onToggle={onToggle} onOpen={onOpen} onBucket={onBucket} onMoveOrder={onMoveOrder} onMoveDate={onMoveDate} onFocus={onFocus} /></div>
                </div>
              ))}</div> : <div className="daily-empty-prompt"><strong>No protected priorities yet.</strong><span>Use a task’s menu and set its role to Must. The first three become your Top 3.</span></div>}
              {extraMustCount ? <div className="daily-inline-warning"><strong>{extraMustCount} extra Must task{extraMustCount === 1 ? '' : 's'}.</strong><span>Only the first three are treated as Top 3. Reorder or demote the rest to keep priorities credible.</span></div> : null}
            </Panel>

            <Panel title="Today" meta={`${incomplete.length} open · ${completedCount} done`}>
              {todayQueue.length ? todayQueue.map((task, index) => (
                <TodayTask key={task.id} task={task} first={index === 0} last={index === todayQueue.length - 1} onToggle={onToggle} onOpen={onOpen} onBucket={onBucket} onMoveOrder={onMoveOrder} onMoveDate={onMoveDate} onFocus={onFocus} />
              )) : topThree.length ? <div className="empty-state">Everything else is off the table. Work the Top 3.</div> : <div className="empty-state">Nothing planned for today.</div>}
            </Panel>

            <Panel title="Habits" meta={`${habitDoneCount}/${habitOpenCount || habits.length} done`}>
              {habits.length ? habits.map((habit) => (
                <div className={`habit-row habit-row--enhanced ${habit.flexible ? 'is-flexible' : ''}`} key={habit.id}>
                  <button className={`task-check ${habit.completed ? 'task-check--done' : ''} ${habit.skipped ? 'is-skipped' : ''}`} onClick={() => onToggleHabit(habit.id)} aria-label={`${habit.completed ? 'Reopen' : 'Complete'} ${habit.title}`} />
                  <button className="habit-row__body" onClick={() => onOpenHabit(habit.id)}><span>{habit.title}</span><small>{habit.flexible ? 'Flexible this week' : habit.scheduleLabel}{habit.skipped ? ' · Rest day' : ''}</small></button>
                  <div className="habit-row__quick">
                    {habit.kind === 'duration' && !habit.completed && !habit.skipped ? <button onClick={() => onHabitIncrement(habit.id, 5)}>+5m</button> : null}
                    <span className="habit-row__progress">{habit.skipped ? 'Rest' : habit.progress ?? (habit.completed ? 'Done' : 'Open')}</span>
                    {!habit.flexible && !habit.completed ? <button className="habit-row__skip" onClick={() => onSkipHabit(habit.id)}>{habit.skipped ? 'Undo rest' : 'Rest'}</button> : null}
                  </div>
                </div>
              )) : <div className="empty-state">No habits due today.</div>}
            </Panel>
          </div>

          <aside className="view-stack daily-workflow-side">
            <Panel title="Focus now" meta={formatFocus(todayFocusSeconds)}>
              {activeFocus ? <div className="focus-now is-active">
                <span className="eyebrow">{activeFocus.status === 'paused' ? 'Paused session' : 'In progress'}</span>
                <strong>{activeFocus.title}</strong>
                <p>Keep the execution surface narrow. Resume the current session before choosing something else.</p>
                <Button variant="primary" onClick={() => onFocus(activeFocus.taskId)}>Resume focus</Button>
              </div> : suggestion ? <div className="focus-now">
                <span className="eyebrow">Suggested next action</span>
                <button className="focus-now__task" onClick={() => onOpen(suggestion.id)}>{suggestion.title}</button>
                <p>{suggestion.project ? `${suggestion.project} · ` : ''}{suggestion.durationMinutes ? formatMinutes(suggestion.durationMinutes) : 'No estimate'}{suggestion.activeBlockerCount ? ' · Blocked' : ''}</p>
                <Button variant="primary" onClick={() => onFocus(suggestion.id)}>Start focus</Button>
              </div> : <div className="daily-empty-prompt"><strong>No obvious next task.</strong><span>Capture work or plan the day before starting a focus session.</span><Button onClick={() => onFocus()}>Open Focus</Button></div>}
            </Panel>

            <Panel title="Next / Later" meta="Triage horizon">
              <div className="triage-lane">
                <div className="triage-lane__heading"><strong>Next</strong><span>Tomorrow · {nextTasks.length}</span></div>
                {nextTasks.length ? nextTasks.slice(0, 4).map((task) => <TriageTask key={task.id} task={task} onOpen={onOpen} actions={<><button onClick={() => onMoveDate(task.id, 'today')}>Today</button><button onClick={() => onMoveDate(task.id, 'later')}>Later</button></>} />) : <div className="triage-lane__empty">Tomorrow is clear.</div>}
              </div>
              <div className="triage-lane">
                <div className="triage-lane__heading"><strong>Later</strong><span>Unscheduled · {laterTasks.length}</span></div>
                {laterTasks.length ? laterTasks.slice(0, 4).map((task) => <TriageTask key={task.id} task={task} onOpen={onOpen} actions={<><button onClick={() => onMoveDate(task.id, 'today')}>Today</button><button onClick={() => onMoveDate(task.id, 'tomorrow')}>Next</button></>} />) : <div className="triage-lane__empty">No loose tasks waiting.</div>}
              </div>
              {(nextTasks.length > 4 || laterTasks.length > 4) ? <button className="text-action" onClick={onOpenPlanner}>Open full Planner →</button> : null}
            </Panel>

            <Panel title="Today's capacity" meta={planStatus === 'committed' ? 'Committed plan' : 'Draft plan'}>
              <div className="capacity-block">
                <ProgressRing value={formatMinutes(plannedMinutes)} label="Planned" percent={capacity ? (plannedMinutes / capacity) * 100 : 0} />
                <dl className="capacity-metrics">
                  <div><dt>Capacity</dt><dd>{formatMinutes(capacity)}</dd></div>
                  <div><dt>Remaining</dt><dd>{remaining >= 0 ? formatMinutes(remaining) : `−${formatMinutes(Math.abs(remaining))}`}</dd></div>
                  <div><dt>Completed</dt><dd>{completedCount} / {tasks.length}</dd></div>
                </dl>
              </div>
              <div className={`capacity-guidance ${remaining < 0 ? 'is-warning' : ''}`}>
                {remaining < 0 ? <><strong>Overcommitted by {formatMinutes(Math.abs(remaining))}.</strong><span>{optionalMinutes ? `Moving Optional work (${formatMinutes(optionalMinutes)}) is the cleanest first cut.` : 'Move lower-priority work before adding more.'}</span></> : <><strong>{remaining < 30 ? 'Day is nearly full.' : 'Capacity is realistic.'}</strong><span>{formatMinutes(Math.max(0, remaining))} remains uncommitted.</span></>}
              </div>
              <div className="panel-divider-title"><span>Schedule</span><em>Today</em></div>
              <div className="schedule-list">
                {schedule.length ? schedule.map((item) => (
                  <div className="schedule-row" key={item.id}>
                    <time>{item.time}</time><i /><span>{item.name}</span><em>{formatMinutes(item.durationMinutes)}</em>
                  </div>
                )) : <div className="empty-state">Nothing time-blocked yet.</div>}
              </div>
              <div className="capacity-footer">
                <p>{remaining >= 0 ? <><strong>Balanced.</strong> Leave margin for the unexpected.</> : <><strong>Needs adjustment.</strong> The plan is larger than the day.</>}</p>
                <Button variant="primary" onClick={onPlan}>{planStatus === 'committed' ? 'Review plan' : 'Plan day'}</Button>
              </div>
            </Panel>

            <Panel title="End-of-day wrap-up" meta="Close the loop">
              <div className="wrap-up-summary" aria-label="Today's summary">
                <div><strong>{completedCount}</strong><span>tasks done</span></div>
                <div><strong>{habitDoneCount}</strong><span>habits done</span></div>
                <div><strong>{formatFocus(todayFocusSeconds, true)}</strong><span>focused</span></div>
              </div>
              <label className="wrap-up-note">
                <span>What moved forward? What should you remember tomorrow?</span>
                <textarea value={wrapDraft} maxLength={1200} rows={4} onChange={(event) => { setWrapDraft(event.target.value); setWrapSaved(false) }} placeholder="One or two useful sentences are enough." />
              </label>
              <div className="wrap-up-actions">
                <Button onClick={onRollForward} disabled={!incomplete.length}>Move unfinished to tomorrow</Button>
                <Button variant="primary" onClick={() => void saveWrapUp()} disabled={wrapDraft.trim() === wrapUpNote.trim() && !wrapSaved}>{wrapSaved ? 'Saved' : 'Save note'}</Button>
              </div>
            </Panel>
          </aside>
        </div>
      </> : null}
    </>
  )
}

function TodayTask({ task, first, last, onToggle, onOpen, onBucket, onMoveOrder, onMoveDate, onFocus }: {
  task: TaskPreview
  first: boolean
  last: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onBucket: (id: string, bucket: DailyPlanBucket) => void
  onMoveOrder: (id: string, direction: -1 | 1) => void
  onMoveDate: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onFocus: (id?: string) => void
}) {
  const actions = task.completed ? undefined : (
    <details className="task-row-menu">
      <summary aria-label={`Plan ${task.title}`}>···</summary>
      <div className="task-row-menu__popover">
        <span className="eyebrow">Plan task</span>
        <label><span>Role today</span><select value={task.planningBucket ?? 'planned'} onChange={(event) => onBucket(task.id, event.target.value as DailyPlanBucket)}><option value="must">Must</option><option value="planned">Planned</option><option value="optional">Optional</option></select></label>
        <div className="task-row-menu__pair"><button disabled={first} onClick={() => onMoveOrder(task.id, -1)}>Move up</button><button disabled={last} onClick={() => onMoveOrder(task.id, 1)}>Move down</button></div>
        <button onClick={() => onMoveDate(task.id, 'tomorrow')}>Move to tomorrow</button>
        <button onClick={() => onFocus(task.id)}>Start focus</button>
        <button onClick={() => onMoveDate(task.id, 'later')}>Move to Later</button>
      </div>
    </details>
  )
  return <TaskRow task={task} onToggle={onToggle} onOpen={onOpen} actions={actions} />
}

function TriageTask({ task, onOpen, actions }: { task: TaskPreview; onOpen: (id: string) => void; actions: ReactNode }) {
  return <div className="triage-task">
    <button className="triage-task__title" onClick={() => onOpen(task.id)}><span>{task.title}</span><small>{task.project ?? (task.durationMinutes ? formatMinutes(task.durationMinutes) : 'No project')}</small></button>
    <div className="triage-task__actions">{actions}</div>
  </div>
}

export function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const remainder = safe % 60
  if (!hours) return `${remainder}m`
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function formatFocus(seconds: number, compact = false) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (!minutes) return compact ? '0m' : 'No focus logged yet'
  return compact ? formatMinutes(minutes) : `${formatMinutes(minutes)} focused today`
}
