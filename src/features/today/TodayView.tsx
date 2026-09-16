import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { TaskRow } from '../../components/ui/TaskRow'
import type { DailyPlanBucket } from '../../domain/models'
import type { HabitPreview, SchedulePreview, TaskPreview } from '../../types/ui'
import { plannedDayMinutes } from './planningLogic'

const bucketMeta: Record<DailyPlanBucket, { label: string; note: string }> = {
  must: { label: 'Must', note: 'Protect these first' },
  planned: { label: 'Planned', note: 'Committed work' },
  optional: { label: 'Optional', note: 'Only if capacity remains' },
}

export function TodayView({
  tasks, habits, schedule, capacity, planStatus, carryoverCount, deadlineCount,
  onAdd, onToggle, onToggleHabit, onHabitIncrement, onOpenHabit, onSkipHabit, onOpen, onPlan, onBucket, onMoveOrder, onMoveDate, onFocus,
}: {
  tasks: TaskPreview[]
  habits: HabitPreview[]
  schedule: SchedulePreview[]
  capacity: number
  planStatus: 'draft' | 'committed'
  carryoverCount: number
  deadlineCount: number
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
  onMoveDate: (id: string, target: 'tomorrow' | 'later') => void
  onFocus: (id: string) => void
}) {
  const plannedMinutes = plannedDayMinutes(tasks, habits)
  const remaining = capacity - plannedMinutes
  const incomplete = tasks.filter((task) => !task.completed)
  const optionalMinutes = incomplete.filter((task) => task.planningBucket === 'optional').reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0)
  const workspaceEmpty = !tasks.length && !habits.length && !schedule.length

  return (
    <>
      <PageHeader
        kicker={new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title="Today"
        subtitle="Protect the essentials, leave margin, then execute the day you actually have."
      />

      {workspaceEmpty ? <section className="workspace-start" aria-labelledby="workspace-start-title">
        <div>
          <span className="eyebrow">Fresh workspace</span>
          <h2 id="workspace-start-title">Start with what actually needs doing.</h2>
          <p>Capture one task, then add structure only when it earns its place. Projects, habits, planning, focus, and review can grow around real work.</p>
        </div>
        <div className="workspace-start__actions"><Button variant="primary" icon="plus" onClick={onAdd}>Add first task</Button><Button onClick={onPlan}>Set today’s capacity</Button></div>
      </section> : null}

      {!workspaceEmpty ? <>
      <div className={`day-status-strip ${planStatus === 'committed' ? 'is-committed' : ''}`}>
        <div>
          <span className="day-status-strip__mark" />
          <div><strong>{planStatus === 'committed' ? 'Day planned' : 'Planning still open'}</strong><small>{carryoverCount ? `${carryoverCount} carryover` : 'No carryover'} · {deadlineCount ? `${deadlineCount} deadline${deadlineCount === 1 ? '' : 's'} soon` : 'No urgent deadlines'}</small></div>
        </div>
        <Button variant={planStatus === 'committed' ? 'outline' : 'primary'} onClick={onPlan}>{planStatus === 'committed' ? 'Review plan' : 'Plan Day'}</Button>
      </div>

      <div className="today-grid">
        <div className="view-stack">
          {(['must', 'planned', 'optional'] as DailyPlanBucket[]).map((bucket) => {
            const items = tasks.filter((task) => (task.planningBucket ?? 'planned') === bucket)
            return (
              <Panel key={bucket} title={bucketMeta[bucket].label} meta={bucketMeta[bucket].note}>
                {items.length ? items.map((task, index) => (
                  <TodayTask key={task.id} task={task} first={index === 0} last={index === items.length - 1} onToggle={onToggle} onOpen={onOpen} onBucket={onBucket} onMoveOrder={onMoveOrder} onMoveDate={onMoveDate} onFocus={onFocus} />
                )) : <div className="empty-state">{bucket === 'optional' ? 'Nothing optional. Keep the day lean.' : `No ${bucketMeta[bucket].label.toLowerCase()} tasks yet.`}</div>}
              </Panel>
            )
          })}

          <Panel title="Habits" meta="Daily rhythm">
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

        <div className="view-stack">
          <Panel title="Today's capacity" meta={planStatus === 'committed' ? 'Committed plan' : 'Draft plan'}>
            <div className="capacity-block">
              <ProgressRing value={formatMinutes(plannedMinutes)} label="Planned" percent={capacity ? (plannedMinutes / capacity) * 100 : 0} />
              <dl className="capacity-metrics">
                <div><dt>Capacity</dt><dd>{formatMinutes(capacity)}</dd></div>
                <div><dt>Remaining</dt><dd>{remaining >= 0 ? formatMinutes(remaining) : `−${formatMinutes(Math.abs(remaining))}`}</dd></div>
                <div><dt>Completed</dt><dd>{tasks.filter((task) => task.completed).length} / {tasks.length}</dd></div>
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
              <p>{remaining >= 0 ? <><strong>Balanced.</strong> Keep some margin for the unexpected.</> : <><strong>Needs adjustment.</strong> The plan is larger than the day.</>}</p>
              <Button variant="primary" onClick={onPlan}>{planStatus === 'committed' ? 'Review Plan' : 'Plan Day'}</Button>
            </div>
          </Panel>
        </div>
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
  onMoveDate: (id: string, target: 'tomorrow' | 'later') => void
  onFocus: (id: string) => void
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

export function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const remainder = safe % 60
  if (!hours) return `${remainder}m`
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}
