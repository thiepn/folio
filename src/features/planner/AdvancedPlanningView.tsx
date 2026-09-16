import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { TaskRow } from '../../components/ui/TaskRow'
import { formatLocalDate } from '../../domain/date'
import type { LocalDate, TaskPriority } from '../../domain/models'
import { useAdvancedPlanningData } from '../../hooks/useAdvancedPlanningData'
import type { UndoableMutation } from '../../services/undo'
import {
  BUILTIN_SAVED_VIEWS,
  filterTasksForSavedView,
  type SavedTaskView,
  type SavedViewBlockMode,
  type SavedViewDateMode,
  type SavedViewDeadlineMode,
  type SavedViewStatusMode,
} from './advancedPlanning'

type AdvancedTab = 'forecast' | 'views'

export function AdvancedPlanningView({ today, onOpenTask, onToggleTask, onSaveView, onDeleteView }: {
  today: LocalDate
  onOpenTask?: (id: string) => void
  onToggleTask?: (id: string) => void
  onSaveView: (view: Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<UndoableMutation>
  onDeleteView: (id: string) => Promise<UndoableMutation>
}) {
  const data = useAdvancedPlanningData(today)
  const [tab, setTab] = useState<AdvancedTab>('forecast')
  if (!data) return <div className="planner-loading">Loading planning forecast…</div>

  return (
    <div className="advanced-planning">
      <div className="advanced-planning__switch" role="tablist" aria-label="Advanced planning">
        <button className={tab === 'forecast' ? 'is-active' : ''} onClick={() => setTab('forecast')}>Forecast</button>
        <button className={tab === 'views' ? 'is-active' : ''} onClick={() => setTab('views')}>Saved views</button>
      </div>
      {tab === 'forecast' ? <ForecastPanel data={data} onOpenTask={onOpenTask} /> : null}
      {tab === 'views' ? <SavedViewsPanel data={data} today={today} onOpenTask={onOpenTask} onToggleTask={onToggleTask} onSaveView={onSaveView} onDeleteView={onDeleteView} /> : null}
    </div>
  )
}

function ForecastPanel({ data, onOpenTask }: { data: NonNullable<ReturnType<typeof useAdvancedPlanningData>>; onOpenTask?: (id: string) => void }) {
  const firstSixWeeks = data.forecast.weeks.slice(0, 6)
  const totalPlanned = firstSixWeeks.reduce((sum, week) => sum + week.plannedMinutes, 0)
  const totalCapacity = firstSixWeeks.reduce((sum, week) => sum + week.capacityMinutes, 0)
  const overloaded = firstSixWeeks.reduce((sum, week) => sum + week.overloadedDays, 0)
  return <div className="advanced-planning__stack">
    <section className="forecast-scoreband">
      <div><strong>{formatMinutes(totalPlanned)}</strong><span>planned · 6 weeks</span></div>
      <div><strong>{formatMinutes(totalCapacity)}</strong><span>capacity · 6 weeks</span></div>
      <div className={overloaded ? 'is-warning' : ''}><strong>{overloaded}</strong><span>overloaded days</span></div>
      <div><strong>{data.deadlinePressure.filter((item) => item.pressure !== 'watch').length}</strong><span>pressure deadlines</span></div>
    </section>

    <Panel title="Six-week workload" meta="Planned commitments vs available capacity">
      <div className="forecast-weeks">
        {firstSixWeeks.map((week) => {
          const ratio = week.capacityMinutes ? Math.min(1.25, week.plannedMinutes / week.capacityMinutes) : 0
          return <div className="forecast-week" key={week.start}>
            <div className="forecast-week__head"><strong>{formatLocalDate(week.start, { month: 'short', day: 'numeric' })}–{formatLocalDate(week.end, { month: 'short', day: 'numeric' })}</strong><span>{formatMinutes(week.plannedMinutes)} / {formatMinutes(week.capacityMinutes)}</span></div>
            <div className="forecast-week__bar"><span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
            <div className="forecast-week__meta">
              <span>{week.deadlineCount} deadlines</span>
              <span>{week.overloadedDays ? `${week.overloadedDays} overloaded` : 'No overloaded days'}</span>
              {week.unplannedDeadlineMinutes ? <span className="is-warning">{formatMinutes(week.unplannedDeadlineMinutes)} due work unplanned</span> : null}
            </div>
          </div>
        })}
      </div>
    </Panel>

    <Panel title="Deadline pressure" meta="Urgency and readiness are separate signals">
      {data.deadlinePressure.length ? <div className="deadline-pressure-list">{data.deadlinePressure.slice(0, 12).map((item) => <button key={item.id} onClick={() => onOpenTask?.(item.id)}>
        <span className={`pressure-mark pressure-mark--${item.pressure}`} />
        <div><strong>{item.title}</strong><span>{item.daysLeft < 0 ? `${Math.abs(item.daysLeft)}d overdue` : item.daysLeft === 0 ? 'Due today' : `${item.daysLeft}d left`} · {formatMinutes(item.estimatedMinutes || 0)}{item.blocked ? ' · Blocked' : item.plannedDate ? ` · Planned ${formatLocalDate(item.plannedDate)}` : ' · Unplanned'}</span></div>
        <b>{item.pressure.toUpperCase()}</b>
      </button>)}</div> : <div className="empty-state">No hard deadlines inside the next 30 days.</div>}
    </Panel>

    <Panel title="Project planning" meta="Backlog, readiness and academic pace">
      <div className="project-planning-table">
        {data.projectSummaries.map((project) => <div className="project-planning-row" key={project.id}>
          <div><strong>{project.name}</strong><span>{project.type === 'academic' && project.examDate ? `Exam ${formatLocalDate(project.examDate)}` : project.nextDeadline ? `Next due ${formatLocalDate(project.nextDeadline)}` : 'No hard deadline'}</span></div>
          <div><strong>{formatMinutes(project.backlogMinutes)}</strong><span>backlog</span></div>
          <div><strong>{project.unplannedTasks}</strong><span>unplanned</span></div>
          <div className={project.blockedTasks ? 'is-warning' : ''}><strong>{project.blockedTasks}</strong><span>blocked</span></div>
          {project.type === 'academic' ? <div><strong>{project.estimatedMinutesPerWeekToExam ? formatMinutes(project.estimatedMinutesPerWeekToExam) : '—'}</strong><span>backlog / week to exam{project.weeklyTargetMinutes ? ` · target ${formatMinutes(project.weeklyTargetMinutes)}` : ''}</span></div> : <div><strong>{project.dueNext30}</strong><span>due in 30d</span></div>}
        </div>)}
      </div>
    </Panel>
  </div>
}

const emptyDraft = (): Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '', query: '', projectIds: [], priorities: [], dateMode: 'all', deadlineMode: 'all', blockMode: 'all', statusMode: 'open',
})

function SavedViewsPanel({ data, today, onOpenTask, onToggleTask, onSaveView, onDeleteView }: {
  data: NonNullable<ReturnType<typeof useAdvancedPlanningData>>
  today: LocalDate
  onOpenTask?: (id: string) => void
  onToggleTask?: (id: string) => void
  onSaveView: (view: Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<UndoableMutation>
  onDeleteView: (id: string) => Promise<UndoableMutation>
}) {
  const [selectedId, setSelectedId] = useState(BUILTIN_SAVED_VIEWS[0].id)
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [error, setError] = useState('')
  const views = [...BUILTIN_SAVED_VIEWS, ...data.savedViews]
  const selected = views.find((item) => item.id === selectedId) ?? views[0]
  const filtered = useMemo(() => filterTasksForSavedView(data.tasks, selected, today), [data.tasks, selected, today])
  const previews = new Map(data.taskPreviews.map((task) => [task.id, task]))

  function togglePriority(priority: TaskPriority) {
    setDraft((current) => ({ ...current, priorities: current.priorities?.includes(priority) ? current.priorities.filter((item) => item !== priority) : [...(current.priorities ?? []), priority] }))
  }

  function startEdit(view: SavedTaskView) {
    setEditingId(view.id)
    setDraft({ name: view.name, query: view.query ?? '', projectIds: view.projectIds ?? [], priorities: view.priorities ?? [], dateMode: view.dateMode, deadlineMode: view.deadlineMode, blockMode: view.blockMode, statusMode: view.statusMode })
  }

  async function save() {
    try {
      setError('')
      await onSaveView({ ...draft, id: editingId })
      setDraft(emptyDraft())
      setEditingId(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save view.') }
  }

  return <div className="saved-views-layout">
    <aside className="saved-view-list">
      <div className="eyebrow">Perspectives</div>
      {views.map((view) => <button key={view.id} className={selected.id === view.id ? 'is-active' : ''} onClick={() => setSelectedId(view.id)}><strong>{view.name}</strong><span>{view.id.startsWith('builtin-') ? 'Built in' : 'Saved'}</span></button>)}
    </aside>
    <div className="saved-view-main">
      <div className="saved-view-head"><div><span className="eyebrow">Current view</span><h2>{selected.name}</h2><p>{filtered.length} matching task{filtered.length === 1 ? '' : 's'} · filters never change the underlying tasks.</p></div>{!selected.id.startsWith('builtin-') ? <div><Button onClick={() => startEdit(selected)}>Edit</Button><Button onClick={() => void onDeleteView(selected.id)}>Delete</Button></div> : null}</div>
      <Panel>{filtered.length ? filtered.map((entity) => { const task = previews.get(entity.id); return task ? <TaskRow key={task.id} task={task} onOpen={onOpenTask} onToggle={onToggleTask} /> : null }) : <div className="empty-state">No tasks match this view.</div>}</Panel>

      <details className="saved-view-editor" open={Boolean(editingId)}>
        <summary>{editingId ? 'Edit saved view' : 'Create saved view'}</summary>
        <div className="saved-view-form">
          <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Exam pressure" /></label>
          <label className="field"><span>Text contains</span><input value={draft.query ?? ''} onChange={(event) => setDraft({ ...draft, query: event.target.value })} placeholder="Optional" /></label>
          <label className="field"><span>Project</span><select value={draft.projectIds?.[0] ?? ''} onChange={(event) => setDraft({ ...draft, projectIds: event.target.value ? [event.target.value] : [] })}><option value="">Any project</option>{data.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <label className="field"><span>Planned date</span><select value={draft.dateMode} onChange={(event) => setDraft({ ...draft, dateMode: event.target.value as SavedViewDateMode })}><option value="all">Any</option><option value="today">Today</option><option value="next7">Next 7 days</option><option value="next30">Next 30 days</option><option value="overdue">Carryover</option><option value="unplanned">Unplanned</option></select></label>
          <label className="field"><span>Deadline</span><select value={draft.deadlineMode} onChange={(event) => setDraft({ ...draft, deadlineMode: event.target.value as SavedViewDeadlineMode })}><option value="all">Any</option><option value="overdue">Overdue</option><option value="next7">Next 7 days</option><option value="next30">Next 30 days</option><option value="none">No deadline</option></select></label>
          <label className="field"><span>Readiness</span><select value={draft.blockMode} onChange={(event) => setDraft({ ...draft, blockMode: event.target.value as SavedViewBlockMode })}><option value="all">Any</option><option value="ready">Ready</option><option value="blocked">Blocked</option></select></label>
          <label className="field"><span>Status</span><select value={draft.statusMode} onChange={(event) => setDraft({ ...draft, statusMode: event.target.value as SavedViewStatusMode })}><option value="open">Open</option><option value="completed">Completed</option><option value="all">All</option></select></label>
          <fieldset className="saved-view-priorities"><legend>Priority</legend>{(['normal','high','critical'] as TaskPriority[]).map((priority) => <label key={priority}><input type="checkbox" checked={draft.priorities?.includes(priority) ?? false} onChange={() => togglePriority(priority)} /> {priority}</label>)}</fieldset>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="saved-view-form__actions"><Button variant="primary" disabled={!draft.name.trim()} onClick={() => void save()}>{editingId ? 'Update view' : 'Save view'}</Button>{editingId ? <Button onClick={() => { setEditingId(undefined); setDraft(emptyDraft()) }}>Cancel</Button> : null}</div>
        </div>
      </details>
    </div>
  </div>
}

function formatMinutes(minutes: number) {
  if (!minutes) return '0m'
  const hours = Math.floor(minutes / 60), remainder = minutes % 60
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`
}
