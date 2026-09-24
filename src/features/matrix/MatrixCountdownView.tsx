import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { formatLocalDate } from '../../domain/date'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskPreview } from '../../types/ui'
import {
  buildCountdown,
  buildMatrix,
  countdownLabel,
  countdownWindow,
  matrixHorizonDate,
  type CountdownKind,
  type MatrixQuadrant,
} from './matrixCountdownLogic'

type ViewMode = 'matrix' | 'countdown'
type CountdownRange = 7 | 30 | 90 | 365 | 'all'
type CountdownFilter = CountdownKind | 'all'

const tabs = [{ value: 'matrix', label: 'Matrix' }, { value: 'countdown', label: 'Countdown' }] as const

const quadrantMeta: Record<MatrixQuadrant, { title: string; eyebrow: string; description: string; action: string }> = {
  do: { title: 'Do now', eyebrow: 'Important + urgent', description: 'Protect attention for work that matters and has real time pressure.', action: 'Execute' },
  schedule: { title: 'Schedule', eyebrow: 'Important + not urgent', description: 'Important work that still has enough runway to plan deliberately.', action: 'Protect time' },
  delegate: { title: 'Quick / delegate', eyebrow: 'Urgent + normal priority', description: 'Time-sensitive work that should not consume disproportionate attention.', action: 'Resolve efficiently' },
  later: { title: 'Later / reconsider', eyebrow: 'Not urgent + normal priority', description: 'Low-pressure work. Keep only what still deserves future capacity.', action: 'Review scope' },
}

function TaskCard({ row, onOpenTask, onSetImportant, onPlanToday, onComplete }: {
  row: ReturnType<typeof buildMatrix>['tasks'][number]
  onOpenTask: (id: string) => void
  onSetImportant: (id: string, important: boolean) => void
  onPlanToday: (id: string) => void
  onComplete: (id: string) => void
}) {
  const task = row.task
  return <article className={'matrix-task-card priority-' + task.priority + (task.activeBlockerCount ? ' is-blocked' : '')}>
    <button className="matrix-task-card__main" onClick={() => onOpenTask(task.id)}>
      <div className="matrix-task-card__title"><strong>{task.title}</strong>{task.priority === 'critical' ? <em>Critical</em> : task.priority === 'high' ? <em>Important</em> : null}</div>
      <span>{[task.project, row.urgencyReason, task.durationMinutes ? task.durationMinutes + 'm' : null].filter(Boolean).join(' · ') || 'No deadline or project context'}</span>
      {task.activeBlockerCount ? <small>Blocked by {task.blockedByTitles?.join(', ') || task.activeBlockerCount + ' task(s)'}</small> : null}
    </button>
    <div className="matrix-task-card__actions">
      <button onClick={() => onSetImportant(task.id, !row.important)}>{row.important ? 'Set normal' : 'Mark important'}</button>
      {task.plannedDate !== undefined && task.plannedDate === new Date().toISOString().slice(0, 10) ? null : <button onClick={() => onPlanToday(task.id)}>Today</button>}
      <button onClick={() => onComplete(task.id)}>Done</button>
    </div>
  </article>
}

function MatrixPanel({ tasks, projects, today, onOpenTask, onOpenProject, onSetImportant, onPlanToday, onComplete }: {
  tasks: TaskPreview[]
  projects: ProjectSummary[]
  today: string
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onSetImportant: (id: string, important: boolean) => void
  onPlanToday: (id: string) => void
  onComplete: (id: string) => void
}) {
  const [horizon, setHorizon] = useState(7)
  const [query, setQuery] = useState('')
  const snapshot = useMemo(() => buildMatrix(tasks, today, horizon), [tasks, today, horizon])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return snapshot.quadrants
    const result = { do: [], schedule: [], delegate: [], later: [] } as typeof snapshot.quadrants
    for (const key of Object.keys(result) as MatrixQuadrant[]) {
      result[key] = snapshot.quadrants[key].filter((row) => [row.task.title, row.task.project, ...(row.task.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(needle))
    }
    return result
  }, [snapshot, query])

  const projectPressure = projects
    .filter((project) => !project.archived && project.status !== 'completed')
    .map((project) => ({ project, pressure: snapshot.tasks.filter((row) => row.task.projectId === project.id && row.urgent).length }))
    .filter((row) => row.pressure)
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, 5)

  return <>
    <section className="matrix-toolbar">
      <div><span className="eyebrow">Urgency horizon</span><div className="matrix-horizon">{[1, 3, 7, 14].map((days) => <button key={days} className={horizon === days ? 'is-active' : ''} onClick={() => setHorizon(days)}>{days === 1 ? 'Today' : days + ' days'}</button>)}</div><small>Urgent means due by {formatLocalDate(matrixHorizonDate(today, horizon), { month: 'short', day: 'numeric' })}, overdue, or already planned.</small></div>
      <label className="matrix-search"><span>Filter matrix</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Task, project, tag…" /></label>
    </section>

    <section className="matrix-summary">
      <div className="is-do"><strong>{snapshot.counts.do}</strong><span>Do now</span></div>
      <div className="is-schedule"><strong>{snapshot.counts.schedule}</strong><span>Schedule</span></div>
      <div className="is-delegate"><strong>{snapshot.counts.delegate}</strong><span>Quick / delegate</span></div>
      <div className="is-later"><strong>{snapshot.counts.later}</strong><span>Later</span></div>
    </section>

    {projectPressure.length ? <section className="matrix-pressure-strip"><span>Urgent project pressure</span>{projectPressure.map(({ project, pressure }) => <button key={project.id} onClick={() => onOpenProject(project.id)}><i style={{ background: project.color ?? 'var(--muted-2)' }} /><strong>{project.name}</strong><em>{pressure}</em></button>)}</section> : null}

    <div className="matrix-grid">
      {(Object.keys(quadrantMeta) as MatrixQuadrant[]).map((key) => {
        const meta = quadrantMeta[key]
        const rows = filtered[key]
        return <section className={'matrix-quadrant matrix-quadrant--' + key} key={key}>
          <header><div><span>{meta.eyebrow}</span><h2>{meta.title}</h2></div><strong>{rows.length}</strong></header>
          <p>{meta.description}</p>
          <div className="matrix-quadrant__body">{rows.map((row) => <TaskCard key={row.task.id} row={row} onOpenTask={onOpenTask} onSetImportant={onSetImportant} onPlanToday={onPlanToday} onComplete={onComplete} />)}{!rows.length ? <div className="matrix-empty">No tasks in this quadrant.</div> : null}</div>
          <footer>{meta.action}</footer>
        </section>
      })}
    </div>
  </>
}

function CountdownPanel({ tasks, projects, today, onOpenTask, onOpenProject }: {
  tasks: TaskPreview[]
  projects: ProjectSummary[]
  today: string
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
}) {
  const snapshot = useMemo(() => buildCountdown(tasks, projects, today), [tasks, projects, today])
  const [range, setRange] = useState<CountdownRange>(90)
  const [kind, setKind] = useState<CountdownFilter>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return countdownWindow(snapshot.items, range)
      .filter((item) => kind === 'all' || item.kind === kind)
      .filter((item) => !needle || [item.title, item.context, item.kind].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [snapshot, range, kind, query])

  function open(item: (typeof snapshot.items)[number]) {
    if (item.kind === 'task') onOpenTask(item.ownerId)
    else onOpenProject(item.ownerId)
  }

  return <>
    <section className="countdown-hero">
      <div><span className="eyebrow">Nearest upcoming</span>{snapshot.nearest ? <><strong>{countdownLabel(snapshot.nearest)}</strong><h2>{snapshot.nearest.title}</h2><p>{snapshot.nearest.context} · {formatLocalDate(snapshot.nearest.date, { weekday: 'short', month: 'short', day: 'numeric' })}</p><Button onClick={() => open(snapshot.nearest!)}>Open</Button></> : <><strong>—</strong><h2>No dated deadlines</h2><p>Add task or project deadlines to build the countdown.</p></>}</div>
      <div className="countdown-pressure"><div className="is-overdue"><strong>{snapshot.counts.overdue}</strong><span>Overdue</span></div><div className="is-today"><strong>{snapshot.counts.today}</strong><span>Today</span></div><div className="is-week"><strong>{snapshot.counts.week}</strong><span>Next 7d</span></div><div className="is-month"><strong>{snapshot.counts.month}</strong><span>8–30d</span></div></div>
    </section>

    <section className="countdown-toolbar">
      <div className="countdown-ranges">{([7, 30, 90, 365, 'all'] as CountdownRange[]).map((value) => <button key={String(value)} className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{value === 'all' ? 'All' : value + 'd'}</button>)}</div>
      <select value={kind} onChange={(event) => setKind(event.target.value as CountdownFilter)}><option value="all">All types</option><option value="task">Tasks</option><option value="project">Projects</option><option value="exam">Exams</option><option value="milestone">Milestones</option></select>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter countdown…" />
    </section>

    <div className="countdown-list">
      {visible.map((item) => <button key={item.id} className={'countdown-card band-' + item.band + (item.critical ? ' is-critical' : '')} onClick={() => open(item)}>
        <i style={{ background: item.color ?? (item.kind === 'task' ? 'var(--accent)' : 'var(--muted-2)') }} />
        <div><span>{item.kind.replace('-', ' ')}</span><strong>{item.title}</strong><small>{item.context ?? item.kind}</small></div>
        <time>{formatLocalDate(item.date, { weekday: 'short', month: 'short', day: 'numeric', year: item.daysRemaining > 300 ? 'numeric' : undefined })}</time>
        <em>{countdownLabel(item)}</em>
      </button>)}
      {!visible.length ? <div className="countdown-empty">No countdown items match this range and filter.</div> : null}
    </div>
  </>
}

export function MatrixCountdownView(props: {
  tasks: TaskPreview[]
  projects: ProjectSummary[]
  today: string
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onSetImportant: (id: string, important: boolean) => void
  onPlanToday: (id: string) => void
  onComplete: (id: string) => void
}) {
  const [mode, setMode] = useState<ViewMode>('matrix')
  return <div className="matrix-countdown-view">
    <PageHeader kicker="Decide by pressure and importance" title="Matrix & countdown" subtitle="Separate urgency from importance, then keep hard deadlines and approaching milestones visible before they become emergencies." />
    <Tabs<ViewMode> value={mode} tabs={tabs} onChange={setMode} label="Matrix and countdown views" />
    {mode === 'matrix' ? <MatrixPanel {...props} /> : <CountdownPanel tasks={props.tasks} projects={props.projects} today={props.today} onOpenTask={props.onOpenTask} onOpenProject={props.onOpenProject} />}
  </div>
}
