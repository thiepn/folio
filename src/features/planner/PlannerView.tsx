import { useMemo, useState, type DragEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { Tabs } from '../../components/ui/Tabs'
import { TaskRow } from '../../components/ui/TaskRow'
import { addLocalDays, formatLocalDate, startOfLocalWeek, weekdayShort } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import { usePlannerData } from '../../hooks/usePlannerData'
import type { TaskPreview } from '../../types/ui'
import { suggestWeekBalance, totalWeekCapacity, totalWeekPlanned, type PlannerDaySummary } from './plannerLogic'
import { CalendarView } from './CalendarView'
import { AdvancedPlanningView } from './AdvancedPlanningView'
import type { SavedTaskView } from './advancedPlanning'
import type { UndoableMutation } from '../../services/undo'

type PlannerTab = 'upcoming' | 'week' | 'calendar' | 'advanced'

interface PlannerViewProps {
  today: LocalDate
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onCreateEvent: (title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onUpdateBlock: (id: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onUpdateEvent: (id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  onDeleteBlock: (id: string) => void | Promise<void>
  onSaveSavedView: (view: Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<UndoableMutation>
  onDeleteSavedView: (id: string) => Promise<UndoableMutation>
}

export function PlannerView({ today, onToggle, onOpen, onMoveDate, onSetCapacity, onAddForDate, onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock, onSaveSavedView, onDeleteSavedView }: PlannerViewProps) {
  const [tab, setTab] = useState<PlannerTab>('upcoming')
  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek(today))
  const data = usePlannerData(weekStart, today)

  return (
    <>
      <PageHeader
        kicker="See the load before you commit"
        title="Planner"
        subtitle="Upcoming is chronological. Week balances workload. Calendar assigns exact time. Forecast looks beyond the immediate week."
      />
      <Tabs<PlannerTab>
        value={tab}
        tabs={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'week', label: 'Week' },
          { value: 'calendar', label: 'Calendar' },
          { value: 'advanced', label: 'Forecast' },
        ]}
        onChange={setTab}
      />
      {!data ? <PlannerLoading /> : null}
      {data && tab === 'upcoming' ? (
        <Upcoming
          today={today}
          tasks={data.upcoming}
          overdue={data.overdue}
          unplanned={data.unplanned}
          deadlineOnly={data.deadlineOnly}
          onToggle={onToggle}
          onOpen={onOpen}
          onMoveDate={onMoveDate}
        />
      ) : null}
      {data && tab === 'week' ? (
        <WeekPlanner
          today={today}
          weekStart={weekStart}
          days={data.days}
          onPrevious={() => setWeekStart(addLocalDays(weekStart, -7))}
          onNext={() => setWeekStart(addLocalDays(weekStart, 7))}
          onCurrent={() => setWeekStart(startOfLocalWeek(today))}
          onToggle={onToggle}
          onOpen={onOpen}
          onMoveDate={onMoveDate}
          onSetCapacity={onSetCapacity}
          onAddForDate={onAddForDate}
        />
      ) : null}
      {tab === 'advanced' ? <AdvancedPlanningView today={today} onOpenTask={onOpen} onToggleTask={onToggle} onSaveView={onSaveSavedView} onDeleteView={onDeleteSavedView} /> : null}
      {tab === 'calendar' ? (
        <CalendarView
          today={today}
          onOpenTask={onOpen}
          onCreateTaskBlock={onCreateTaskBlock}
          onCreateEvent={onCreateEvent}
          onUpdateBlock={onUpdateBlock}
          onUpdateEvent={onUpdateEvent}
          onResizeBlock={onResizeBlock}
          onDeleteBlock={onDeleteBlock}
        />
      ) : null}
    </>
  )
}

function PlannerLoading() {
  return <div className="planner-loading">Loading planner…</div>
}

function Upcoming({
  today, tasks, overdue, unplanned, deadlineOnly, onToggle, onOpen, onMoveDate,
}: {
  today: LocalDate
  tasks: TaskPreview[]
  overdue: TaskPreview[]
  unplanned: TaskPreview[]
  deadlineOnly: TaskPreview[]
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<LocalDate, TaskPreview[]>()
    for (const task of tasks) {
      if (!task.plannedDate) continue
      const list = map.get(task.plannedDate) ?? []
      list.push(task)
      map.set(task.plannedDate, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [tasks])

  return (
    <div className="upcoming-list planner-upcoming">
      {overdue.length ? (
        <section>
          <div className="date-label date-label--warning">Carryover · {overdue.length}</div>
          <Panel>
            {overdue.map((task) => (
              <UpcomingTask key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} onMoveDate={onMoveDate} />
            ))}
          </Panel>
        </section>
      ) : null}

      {grouped.map(([date, items]) => (
        <section key={date}>
          <div className="upcoming-date-head">
            <div>
              <div className="date-label">{date === today ? 'Today' : date === addLocalDays(today, 1) ? 'Tomorrow' : weekdayShort(date)}</div>
              <strong>{formatLocalDate(date, { month: 'long', day: 'numeric' })}</strong>
            </div>
            <span>{formatMinutes(items.filter((task) => !task.completed).reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0))}</span>
          </div>
          <Panel>{items.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpen} />)}</Panel>
        </section>
      ))}

      {deadlineOnly.length ? (
        <section>
          <div className="date-label">Due soon · not yet planned</div>
          <Panel>
            {deadlineOnly.map((task) => (
              <UpcomingTask key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} onMoveDate={onMoveDate} />
            ))}
          </Panel>
        </section>
      ) : null}

      <section>
        <div className="date-label">Later · no planned day</div>
        <Panel>
          {unplanned.length
            ? unplanned.filter((task) => task.status !== 'inbox').slice(0, 12).map((task) => (
                <UpcomingTask key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} onMoveDate={onMoveDate} />
              ))
            : <div className="empty-state">Nothing waiting in Later.</div>}
        </Panel>
      </section>
    </div>
  )
}

function UpcomingTask({ task, today, onToggle, onOpen, onMoveDate }: {
  task: TaskPreview
  today: LocalDate
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
}) {
  return (
    <div className="planner-task-wrap">
      <TaskRow task={task} onToggle={onToggle} onOpen={onOpen} />
      {!task.completed ? (
        <details className="planner-task-menu">
          <summary aria-label={`Move ${task.title}`}>•••</summary>
          <div>
            <button onClick={() => onMoveDate(task.id, today)}>Today</button>
            <button onClick={() => onMoveDate(task.id, addLocalDays(today, 1))}>Tomorrow</button>
            <button onClick={() => onMoveDate(task.id, undefined)}>Later</button>
          </div>
        </details>
      ) : null}
    </div>
  )
}

function WeekPlanner({
  today, weekStart, days, onPrevious, onNext, onCurrent, onToggle, onOpen, onMoveDate, onSetCapacity, onAddForDate,
}: {
  today: LocalDate
  weekStart: LocalDate
  days: PlannerDaySummary[]
  onPrevious: () => void
  onNext: () => void
  onCurrent: () => void
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
}) {
  const weekEnd = addLocalDays(weekStart, 6)
  const planned = totalWeekPlanned(days)
  const capacity = totalWeekCapacity(days)
  const overloaded = days.filter((day) => day.remainingMinutes < 0).length
  const suggestion = suggestWeekBalance(days, today)

  function drop(event: DragEvent<HTMLElement>, date: LocalDate) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/task-id')
    if (id) onMoveDate(id, date)
  }

  return (
    <div className="week-planner">
      <div className="week-toolbar">
        <div className="week-toolbar__nav">
          <button onClick={onPrevious} aria-label="Previous week">←</button>
          <Button variant="ghost" onClick={onCurrent}>This week</Button>
          <button onClick={onNext} aria-label="Next week">→</button>
        </div>
        <div className="week-toolbar__range">
          <strong>{formatWeekRange(weekStart, weekEnd)}</strong>
          <span>Monday–Sunday</span>
        </div>
        <div className="week-toolbar__summary">
          <span><b>{formatMinutes(planned)}</b> planned</span>
          <span><b>{formatMinutes(capacity)}</b> capacity</span>
          <span className={overloaded ? 'is-warning' : ''}><b>{overloaded}</b> overloaded</span>
        </div>
      </div>

      {suggestion ? (
        <div className="week-balance-note">
          <div>
            <span className="eyebrow">Balance suggestion</span>
            <strong>Move {suggestion.taskTitle} to {weekdayShort(suggestion.toDate)}.</strong>
            <p>{suggestion.reason} It frees {formatMinutes(suggestion.minutes)} on {weekdayShort(suggestion.fromDate)}.</p>
          </div>
          <Button variant="outline" onClick={() => onMoveDate(suggestion.taskId, suggestion.toDate)}>Apply move</Button>
        </div>
      ) : (
        <div className="week-balance-note is-balanced">
          <div><span className="eyebrow">Week balance</span><strong>{overloaded ? 'No simple move resolves the overload.' : 'No overloaded day needs attention.'}</strong></div>
        </div>
      )}

      <div className="week-grid week-grid--planner">
        {days.map((day) => (
          <WeekDay
            key={day.date}
            day={day}
            today={today}
            weekDates={days.map((item) => item.date)}
            onToggle={onToggle}
            onOpen={onOpen}
            onMoveDate={onMoveDate}
            onSetCapacity={onSetCapacity}
            onAddForDate={onAddForDate}
            onDrop={drop}
          />
        ))}
      </div>
    </div>
  )
}

function WeekDay({ day, today, weekDates, onToggle, onOpen, onMoveDate, onSetCapacity, onAddForDate, onDrop }: {
  day: PlannerDaySummary
  today: LocalDate
  weekDates: LocalDate[]
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
  onDrop: (event: DragEvent<HTMLElement>, date: LocalDate) => void
}) {
  const [editingCapacity, setEditingCapacity] = useState(false)
  const [capacityHours, setCapacityHours] = useState(() => String(Number((day.capacityMinutes / 60).toFixed(2))))
  const overloaded = day.remainingMinutes < 0
  const ratio = day.capacityMinutes ? Math.min(100, Math.round(day.plannedMinutes / day.capacityMinutes * 100)) : 100

  function saveCapacity() {
    const hours = Number(capacityHours)
    if (Number.isFinite(hours) && hours > 0) onSetCapacity(day.date, Math.round(hours * 60))
    setEditingCapacity(false)
  }

  return (
    <article
      className={`week-day week-day--planner ${day.date === today ? 'is-today' : ''} ${overloaded ? 'is-overloaded' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, day.date)}
    >
      <header className="week-day__head">
        <div><span>{weekdayShort(day.date)}</span><strong>{formatLocalDate(day.date, { day: 'numeric' })}</strong></div>
        <span className={`plan-state plan-state--${day.planStatus}`}>{day.planStatus}</span>
      </header>

      <div className="week-load">
        <div className="week-load__bar"><span style={{ width: `${ratio}%` }} /></div>
        <div className="week-load__meta">
          <strong className={overloaded ? 'is-warning' : ''}>{formatMinutes(day.plannedMinutes)}</strong>
          <span>/ {formatMinutes(day.capacityMinutes)}</span>
        </div>
      </div>

      <div className="week-day__body">
        {day.tasks.length ? day.tasks.map((task) => (
          <div
            className={`week-task ${task.completed ? 'is-completed' : ''}`}
            key={task.id}
            draggable={!task.completed}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/task-id', task.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <button className="week-task__main" onClick={() => onOpen?.(task.id)}>
              <span className={`week-task__bucket bucket--${task.planningBucket ?? 'planned'}`} />
              <span>{task.title}</span>
              <em>{task.durationMinutes ? formatMinutes(task.durationMinutes) : '—'}</em>
            </button>
            <div className="week-task__actions">
              <button onClick={() => onToggle?.(task.id)}>{task.completed ? '↶' : '✓'}</button>
              {!task.completed ? (
                <details>
                  <summary>•••</summary>
                  <div className="week-task__menu">
                    {weekDates.filter((date) => date !== day.date).map((date) => <button key={date} onClick={() => onMoveDate(task.id, date)}>{weekdayShort(date)}</button>)}
                    <button onClick={() => onMoveDate(task.id, undefined)}>Later</button>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        )) : <div className="week-day__empty">Open capacity</div>}
      </div>

      <footer className="week-day__footer">
        <div>
          {overloaded ? <strong className="is-warning">Over {formatMinutes(Math.abs(day.remainingMinutes))}</strong> : <span>{formatMinutes(day.remainingMinutes)} free</span>}
          {day.habitMinutes ? <small>+ {formatMinutes(day.habitMinutes)} habits</small> : null}
        </div>
        <div className="week-day__footer-actions">
          {editingCapacity ? (
            <span className="week-capacity-edit">
              <input value={capacityHours} onChange={(event) => setCapacityHours(event.target.value)} aria-label="Capacity hours" />
              <button onClick={saveCapacity}>Save</button>
              <button onClick={() => { onSetCapacity(day.date, undefined); setEditingCapacity(false) }}>Default</button>
            </span>
          ) : <button onClick={() => { setCapacityHours(String(Number((day.capacityMinutes / 60).toFixed(2)))); setEditingCapacity(true) }}>Capacity</button>}
          {onAddForDate ? <button onClick={() => onAddForDate(day.date)}>＋</button> : null}
        </div>
      </footer>
    </article>
  )
}

function formatWeekRange(start: LocalDate, end: LocalDate) {
  const startMonth = formatLocalDate(start, { month: 'short' })
  const endMonth = formatLocalDate(end, { month: 'short' })
  const startDay = formatLocalDate(start, { day: 'numeric' })
  const endDay = formatLocalDate(end, { day: 'numeric' })
  return startMonth === endMonth ? `${startMonth} ${startDay}–${endDay}` : `${startMonth} ${startDay} – ${endMonth} ${endDay}`
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}
