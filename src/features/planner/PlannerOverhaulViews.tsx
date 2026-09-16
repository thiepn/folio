import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { TaskRow } from '../../components/ui/TaskRow'
import { addLocalDays, formatLocalDate, startOfLocalMonth, weekdayShort } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import { plannerLoadLabel, suggestWeekBalance, suggestWeekPlacement, totalWeekCapacity, totalWeekPlanned, type PlannerDaySummary } from './plannerLogic'

interface TaskActions {
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
}

export function AgendaPlanner({ today, tasks, overdue, backlog, deadlineOnly, ...actions }: {
  today: LocalDate
  tasks: TaskPreview[]
  overdue: TaskPreview[]
  backlog: TaskPreview[]
  deadlineOnly: TaskPreview[]
} & TaskActions) {
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

  return <div className="planner-agenda">
    <PlannerLegend />
    {overdue.length ? <section className="planner-agenda__section">
      <AgendaHeading label="Carryover" detail={`${overdue.length} planned before today`} warning />
      <Panel>{overdue.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />)}</Panel>
    </section> : null}

    {grouped.map(([date, items]) => <section className="planner-agenda__section" key={date}>
      <AgendaHeading
        label={date === today ? 'Today' : date === addLocalDays(today, 1) ? 'Tomorrow' : weekdayShort(date)}
        detail={`${formatLocalDate(date, { month: 'long', day: 'numeric' })} · ${formatMinutes(items.filter((task) => !task.completed).reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0))}`}
      />
      <Panel>{items.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />)}</Panel>
    </section>)}

    {deadlineOnly.length ? <section className="planner-agenda__section">
      <AgendaHeading label="Due soon, not planned" detail={`${deadlineOnly.length} tasks need a work date`} warning />
      <Panel>{deadlineOnly.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />)}</Panel>
    </section> : null}

    <section className="planner-agenda__section">
      <AgendaHeading label="Later" detail={`${backlog.length} open tasks without a planned date`} />
      <Panel>{backlog.length ? backlog.slice(0, 20).map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />) : <div className="empty-state">Nothing waiting in Later.</div>}</Panel>
    </section>
  </div>
}

export function DayPlanner({ today, day, backlog, onPrevious, onNext, onToday, onOpenCalendar, onSetCapacity, onAddForDate, ...actions }: {
  today: LocalDate
  day: PlannerDaySummary
  backlog: TaskPreview[]
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onOpenCalendar: () => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
} & TaskActions) {
  const [capacityEdit, setCapacityEdit] = useState(false)
  const [capacityHours, setCapacityHours] = useState(String(Number((day.capacityMinutes / 60).toFixed(2))))
  const dueElsewhere = day.deadlines.filter((task) => task.plannedDate !== day.date)
  const openTasks = day.tasks.filter((task) => !task.completed)
  const completed = day.tasks.filter((task) => task.completed)
  const load = plannerLoadLabel(day)

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/task-id')
    if (id) actions.onMoveDate(id, day.date)
  }

  function saveCapacity() {
    const hours = Number(capacityHours)
    if (Number.isFinite(hours) && hours > 0) onSetCapacity(day.date, Math.round(hours * 60))
    setCapacityEdit(false)
  }

  return <div className="planner-day-workspace">
    <div className="planner-range-toolbar">
      <div className="planner-range-toolbar__nav"><button onClick={onPrevious}>←</button><Button variant="ghost" onClick={onToday}>Today</Button><button onClick={onNext}>→</button></div>
      <div><strong>{formatLocalDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}</strong><span>{day.date === today ? 'Today' : day.date < today ? 'Past day' : 'Future day'}</span></div>
      <div className="planner-range-toolbar__actions"><Button onClick={onOpenCalendar}>Exact time</Button>{onAddForDate ? <Button variant="primary" icon="plus" onClick={() => onAddForDate(day.date)}>Task</Button> : null}</div>
    </div>

    <div className={`planner-day-summary load-${load}`}>
      <Metric label="Planned work" value={formatMinutes(day.plannedMinutes)} />
      <Metric label="Capacity" value={formatMinutes(day.capacityMinutes)} />
      <Metric label={day.remainingMinutes < 0 ? 'Over capacity' : 'Capacity left'} value={formatMinutes(Math.abs(day.remainingMinutes))} warning={day.remainingMinutes < 0} />
      <Metric label="Due this day" value={String(day.dueOpenTasks)} warning={day.dueOpenTasks > 0} />
      <div className="planner-capacity-control">
        {capacityEdit ? <><input aria-label="Capacity hours" value={capacityHours} onChange={(event) => setCapacityHours(event.target.value)} /><button onClick={saveCapacity}>Save</button><button onClick={() => { onSetCapacity(day.date, undefined); setCapacityEdit(false) }}>Default</button></> : <button onClick={() => { setCapacityHours(String(Number((day.capacityMinutes / 60).toFixed(2)))); setCapacityEdit(true) }}>Edit capacity</button>}
      </div>
    </div>

    <PlannerLegend />
    <div className="planner-day-layout">
      <main className="planner-day-main" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <section><AgendaHeading label="Planned work" detail={`${openTasks.length} open · ${formatMinutes(day.taskMinutes)}`} />
          <Panel>{openTasks.length ? openTasks.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />) : <div className="planner-drop-empty"><strong>No work planned.</strong><span>Drag a task here or add one for this date.</span></div>}</Panel>
        </section>
        {dueElsewhere.length ? <section><AgendaHeading label="Deadline lane" detail="Due here, but planned elsewhere or not planned" warning />
          <Panel>{dueElsewhere.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />)}</Panel>
        </section> : null}
        {day.habits.length ? <section><AgendaHeading label="Capacity habits" detail={`${formatMinutes(day.habitMinutes)} remaining`} />
          <Panel>{day.habits.map((habit) => <div className="planner-habit-row" key={habit.id}><strong>{habit.title}</strong><span>{habit.completed ? 'Done' : habit.progress ?? 'Due'}</span></div>)}</Panel>
        </section> : null}
        {completed.length ? <section><AgendaHeading label="Completed" detail={`${completed.length}`} /><Panel>{completed.map((task) => <PlannerTaskCard key={task.id} task={task} today={today} {...actions} />)}</Panel></section> : null}
      </main>
      <BacklogSidebar backlog={backlog} today={today} targetDate={day.date} {...actions} />
    </div>
  </div>
}

export function WeekPlannerV14({ today, weekStart, days, backlog, dueBacklog, onPrevious, onNext, onCurrent, onSetCapacity, onAddForDate, ...actions }: {
  today: LocalDate
  weekStart: LocalDate
  days: PlannerDaySummary[]
  backlog: TaskPreview[]
  dueBacklog: TaskPreview[]
  onPrevious: () => void
  onNext: () => void
  onCurrent: () => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
} & TaskActions) {
  const weekEnd = addLocalDays(weekStart, 6)
  const planned = totalWeekPlanned(days)
  const capacity = totalWeekCapacity(days)
  const overloaded = days.filter((day) => day.remainingMinutes < 0).length
  const suggestion = suggestWeekBalance(days, today)
  const dueSuggestions = dueBacklog.map((task) => ({ task, placement: suggestWeekPlacement(task, days, today) })).filter((item) => item.placement)

  function drop(event: DragEvent<HTMLElement>, date: LocalDate) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/task-id')
    if (id) actions.onMoveDate(id, date)
  }

  return <div className="planner-week-v14">
    <div className="planner-range-toolbar">
      <div className="planner-range-toolbar__nav"><button onClick={onPrevious}>←</button><Button variant="ghost" onClick={onCurrent}>This week</Button><button onClick={onNext}>→</button></div>
      <div><strong>{formatWeekRange(weekStart, weekEnd)}</strong><span>Monday–Sunday</span></div>
      <div className="planner-week-metrics"><span><b>{formatMinutes(planned)}</b> planned</span><span><b>{formatMinutes(capacity)}</b> capacity</span><span className={overloaded ? 'is-warning' : ''}><b>{overloaded}</b> overloaded</span></div>
    </div>

    {dueSuggestions.length ? <section className="planner-week-decisions">
      <AgendaHeading label="Plan this week" detail={`${dueSuggestions.length} due task${dueSuggestions.length === 1 ? '' : 's'} still have no work date`} warning />
      <div>{dueSuggestions.slice(0, 6).map(({ task, placement }) => placement ? <article key={task.id}><button onClick={() => actions.onOpen?.(task.id)}><strong>{task.title}</strong><span>Due {formatShortDate(task.deadline)} · {task.durationMinutes ? formatMinutes(task.durationMinutes) : 'No estimate'}</span></button><span>→ {weekdayShort(placement.suggestedDate)}</span><Button onClick={() => actions.onMoveDate(task.id, placement.suggestedDate)}>Plan</Button></article> : null)}</div>
    </section> : null}

    {suggestion ? <div className="week-balance-note"><div><span className="eyebrow">Balance suggestion</span><strong>Move {suggestion.taskTitle} to {weekdayShort(suggestion.toDate)}.</strong><p>{suggestion.reason} It frees {formatMinutes(suggestion.minutes)} on {weekdayShort(suggestion.fromDate)}.</p></div><Button variant="outline" onClick={() => actions.onMoveDate(suggestion.taskId, suggestion.toDate)}>Apply move</Button></div> : <div className="week-balance-note is-balanced"><div><span className="eyebrow">Week balance</span><strong>{overloaded ? 'No simple move resolves the overload.' : 'No overloaded day needs attention.'}</strong></div></div>}

    <PlannerLegend />
    <div className="planner-week-shell">
      <div className="week-grid week-grid--planner week-grid--v14">
        {days.map((day) => <WeekDayV14 key={day.date} day={day} today={today} weekDates={days.map((item) => item.date)} onSetCapacity={onSetCapacity} onAddForDate={onAddForDate} onDrop={drop} {...actions} />)}
      </div>
      <BacklogSidebar backlog={backlog} today={today} targetDate={weekStart} {...actions} />
    </div>
  </div>
}

export function MonthPlanner({ today, anchorDate, days, backlog, onPrevious, onNext, onCurrent, onOpenDay, onAddForDate, ...actions }: {
  today: LocalDate
  anchorDate: LocalDate
  days: PlannerDaySummary[]
  backlog: TaskPreview[]
  onPrevious: () => void
  onNext: () => void
  onCurrent: () => void
  onOpenDay: (date: LocalDate) => void
  onAddForDate?: (date: LocalDate) => void
} & TaskActions) {
  const monthKey = startOfLocalMonth(anchorDate).slice(0, 7)
  const monthLabel = formatLocalDate(startOfLocalMonth(anchorDate), { month: 'long', year: 'numeric' })
  const monthPlanned = days.filter((day) => day.date.startsWith(monthKey)).reduce((sum, day) => sum + day.plannedMinutes, 0)
  const monthDue = days.filter((day) => day.date.startsWith(monthKey)).reduce((sum, day) => sum + day.dueOpenTasks, 0)
  const overloaded = days.filter((day) => day.date.startsWith(monthKey) && day.remainingMinutes < 0).length

  function drop(event: DragEvent<HTMLElement>, date: LocalDate) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/task-id')
    if (id) actions.onMoveDate(id, date)
  }

  return <div className="planner-month-workspace">
    <div className="planner-range-toolbar">
      <div className="planner-range-toolbar__nav"><button onClick={onPrevious}>←</button><Button variant="ghost" onClick={onCurrent}>This month</Button><button onClick={onNext}>→</button></div>
      <div><strong>{monthLabel}</strong><span>Workload and deadline map</span></div>
      <div className="planner-week-metrics"><span><b>{formatMinutes(monthPlanned)}</b> planned</span><span><b>{monthDue}</b> due</span><span className={overloaded ? 'is-warning' : ''}><b>{overloaded}</b> overloaded days</span></div>
    </div>
    <PlannerLegend />
    <div className="planner-month-shell">
      <div className="planner-month-grid">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <div className="planner-month-weekday" key={day}>{day}</div>)}
        {days.map((day) => {
          const outside = !day.date.startsWith(monthKey)
          const load = plannerLoadLabel(day)
          const open = day.tasks.filter((task) => !task.completed)
          return <article key={day.date} className={`planner-month-day load-${load} ${outside ? 'is-outside' : ''} ${day.date === today ? 'is-today' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day.date)}>
            <header><button onClick={() => onOpenDay(day.date)}><span>{formatLocalDate(day.date, { day: 'numeric' })}</span>{day.date === today ? <em>Today</em> : null}</button>{onAddForDate ? <button className="planner-month-add" aria-label={`Add task for ${day.date}`} onClick={() => onAddForDate(day.date)}>＋</button> : null}</header>
            <div className="planner-month-load"><span style={{ width: `${day.capacityMinutes ? Math.min(100, Math.round(day.plannedMinutes / day.capacityMinutes * 100)) : 0}%` }} /></div>
            <div className="planner-month-meta"><span>{open.length ? `${open.length} · ${formatMinutes(day.taskMinutes)}` : 'Open'}</span>{day.dueOpenTasks ? <strong>{day.dueOpenTasks} due</strong> : null}</div>
            <div className="planner-month-tasks">{open.slice(0, 2).map((task) => <button key={task.id} onClick={() => actions.onOpen?.(task.id)} title={task.title}>{task.title}</button>)}{open.length > 2 ? <span>+{open.length - 2} more</span> : null}</div>
          </article>
        })}
      </div>
      <BacklogSidebar backlog={backlog} today={today} targetDate={anchorDate} {...actions} />
    </div>
  </div>
}

function WeekDayV14({ day, today, weekDates, onSetCapacity, onAddForDate, onDrop, ...actions }: {
  day: PlannerDaySummary
  today: LocalDate
  weekDates: LocalDate[]
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
  onDrop: (event: DragEvent<HTMLElement>, date: LocalDate) => void
} & TaskActions) {
  const [editingCapacity, setEditingCapacity] = useState(false)
  const [capacityHours, setCapacityHours] = useState(String(Number((day.capacityMinutes / 60).toFixed(2))))
  const overloaded = day.remainingMinutes < 0
  const ratio = day.capacityMinutes ? Math.min(100, Math.round(day.plannedMinutes / day.capacityMinutes * 100)) : 100

  function saveCapacity() {
    const hours = Number(capacityHours)
    if (Number.isFinite(hours) && hours > 0) onSetCapacity(day.date, Math.round(hours * 60))
    setEditingCapacity(false)
  }

  return <article className={`week-day week-day--planner week-day--v14 ${day.date === today ? 'is-today' : ''} ${overloaded ? 'is-overloaded' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, day.date)}>
    <header className="week-day__head"><div><span>{weekdayShort(day.date)}</span><strong>{formatLocalDate(day.date, { day: 'numeric' })}</strong></div><span className={`plan-state plan-state--${day.planStatus}`}>{day.planStatus}</span></header>
    <div className="week-load"><div className="week-load__bar"><span style={{ width: `${ratio}%` }} /></div><div className="week-load__meta"><strong className={overloaded ? 'is-warning' : ''}>{formatMinutes(day.plannedMinutes)}</strong><span>/ {formatMinutes(day.capacityMinutes)}</span></div></div>
    {day.dueOpenTasks ? <div className="week-deadline-lane">{day.dueOpenTasks} due</div> : null}
    <div className="week-day__body">{day.tasks.length ? day.tasks.map((task) => <WeekTask key={task.id} task={task} day={day.date} today={today} weekDates={weekDates} {...actions} />) : <div className="week-day__empty">Drop work here</div>}</div>
    <footer className="week-day__footer"><div>{overloaded ? <strong className="is-warning">Over {formatMinutes(Math.abs(day.remainingMinutes))}</strong> : <span>{formatMinutes(day.remainingMinutes)} free</span>}{day.habitMinutes ? <small>+ {formatMinutes(day.habitMinutes)} habits</small> : null}</div><div className="week-day__footer-actions">{editingCapacity ? <span className="week-capacity-edit"><input value={capacityHours} onChange={(event) => setCapacityHours(event.target.value)} aria-label="Capacity hours" /><button onClick={saveCapacity}>Save</button><button onClick={() => { onSetCapacity(day.date, undefined); setEditingCapacity(false) }}>Default</button></span> : <button onClick={() => { setCapacityHours(String(Number((day.capacityMinutes / 60).toFixed(2)))); setEditingCapacity(true) }}>Capacity</button>}{onAddForDate ? <button onClick={() => onAddForDate(day.date)}>＋</button> : null}</div></footer>
  </article>
}

function WeekTask({ task, day, today, weekDates, ...actions }: { task: TaskPreview; day: LocalDate; today: LocalDate; weekDates: LocalDate[] } & TaskActions) {
  return <div className={`week-task week-task--v14 ${task.completed ? 'is-completed' : ''}`} draggable={!task.completed} onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move' }} onKeyDown={(event) => taskKeyboardMove(event, task, actions.onMoveDate, today)} tabIndex={0}>
    <button className="week-task__main" onClick={() => actions.onOpen?.(task.id)}><span className={`week-task__bucket bucket--${task.planningBucket ?? 'planned'}`} /><span>{task.title}</span><em>{task.durationMinutes ? formatMinutes(task.durationMinutes) : '—'}</em></button>
    <div className="planner-task-dates"><span>P {formatShortDate(task.plannedDate)}</span>{task.deadline ? <strong className={task.deadline < today && !task.completed ? 'is-warning' : ''}>D {formatShortDate(task.deadline)}</strong> : null}</div>
    <div className="week-task__actions"><button onClick={() => actions.onToggle?.(task.id)}>{task.completed ? '↶' : '✓'}</button>{!task.completed ? <details><summary>•••</summary><div className="week-task__menu">{weekDates.filter((date) => date !== day).map((date) => <button key={date} onClick={() => actions.onMoveDate(task.id, date)}>{weekdayShort(date)}</button>)}<button onClick={() => actions.onMoveDate(task.id, undefined)}>Later</button></div></details> : null}</div>
  </div>
}

function BacklogSidebar({ backlog, today, targetDate, ...actions }: { backlog: TaskPreview[]; today: LocalDate; targetDate: LocalDate } & TaskActions) {
  const [query, setQuery] = useState('')
  const visible = backlog.filter((task) => !query.trim() || `${task.title} ${task.project ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30)
  return <aside className="planner-backlog">
    <header><div><span className="eyebrow">Unscheduled</span><strong>Backlog</strong></div><span>{backlog.length}</span></header>
    <p>No planned work date. Deadlines remain visible separately.</p>
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter backlog…" aria-label="Filter planner backlog" />
    <div className="planner-backlog__list">{visible.length ? visible.map((task) => <div className="planner-backlog-card" key={task.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move' }} tabIndex={0} onKeyDown={(event) => taskKeyboardMove(event, task, actions.onMoveDate, today)}><button onClick={() => actions.onOpen?.(task.id)}><strong>{task.title}</strong><span>{task.project ?? 'No project'}</span></button><div>{task.deadline ? <strong>Due {formatShortDate(task.deadline)}</strong> : <span>No deadline</span>}<button onClick={() => actions.onMoveDate(task.id, targetDate)}>Plan</button></div></div>) : <div className="empty-state">No matching unscheduled tasks.</div>}</div>
    <small>Drag onto a day. Keyboard: Shift+←/→ moves one day; Shift+Backspace returns a task to Later.</small>
  </aside>
}

function PlannerTaskCard({ task, today, ...actions }: { task: TaskPreview; today: LocalDate } & TaskActions) {
  return <div className="planner-task-card" draggable={!task.completed} onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move' }} tabIndex={0} onKeyDown={(event) => taskKeyboardMove(event, task, actions.onMoveDate, today)}>
    <TaskRow task={task} onToggle={actions.onToggle} onOpen={actions.onOpen} />
    <div className="planner-task-semantics"><span><b>Planned</b> {task.plannedDate ? formatShortDate(task.plannedDate) : 'Later'}</span><span className={task.deadline && task.deadline < today && !task.completed ? 'is-warning' : ''}><b>Deadline</b> {task.deadline ? formatShortDate(task.deadline) : 'None'}</span>{task.activeBlockerCount ? <span className="is-warning"><b>Blocked</b> {task.activeBlockerCount}</span> : null}</div>
    {!task.completed ? <details className="planner-task-menu"><summary aria-label={`Reschedule ${task.title}`}>•••</summary><div><button onClick={() => actions.onMoveDate(task.id, today)}>Today</button><button onClick={() => actions.onMoveDate(task.id, addLocalDays(today, 1))}>Tomorrow</button><button onClick={() => actions.onMoveDate(task.id, undefined)}>Later</button></div></details> : null}
  </div>
}

function taskKeyboardMove(event: KeyboardEvent<HTMLElement>, task: TaskPreview, onMoveDate: (id: string, date?: LocalDate) => void, today: LocalDate) {
  if (!event.shiftKey || task.completed) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const base = task.plannedDate ?? today
    onMoveDate(task.id, addLocalDays(base, event.key === 'ArrowLeft' ? -1 : 1))
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    onMoveDate(task.id, undefined)
  }
}

function PlannerLegend() {
  return <div className="planner-legend"><span><i className="planner-legend__planned" />Planned = intended work date</span><span><i className="planner-legend__deadline" />Deadline = must be finished by</span><span>Drag to change only the planned date.</span></div>
}

function AgendaHeading({ label, detail, warning = false }: { label: string; detail: string; warning?: boolean }) {
  return <div className={`planner-section-heading ${warning ? 'is-warning' : ''}`}><strong>{label}</strong><span>{detail}</span></div>
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={warning ? 'is-warning' : ''}><span>{label}</span><strong>{value}</strong></div>
}

function formatWeekRange(start: LocalDate, end: LocalDate) {
  const startMonth = formatLocalDate(start, { month: 'short' })
  const endMonth = formatLocalDate(end, { month: 'short' })
  const startDay = formatLocalDate(start, { day: 'numeric' })
  const endDay = formatLocalDate(end, { day: 'numeric' })
  return startMonth === endMonth ? `${startMonth} ${startDay}–${endDay}` : `${startMonth} ${startDay} – ${endMonth} ${endDay}`
}

function formatShortDate(value?: string) {
  return value ? formatLocalDate(value, { month: 'short', day: 'numeric' }) : '—'
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}
