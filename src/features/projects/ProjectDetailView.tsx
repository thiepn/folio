import { useMemo, useState, type CSSProperties } from 'react'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { Tabs } from '../../components/ui/Tabs'
import { TaskRow } from '../../components/ui/TaskRow'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { SchedulePreview, TaskPreview } from '../../types/ui'

type ProjectStyle = CSSProperties & { '--project-color': string }
type ProjectTab = 'tasks' | 'schedule' | 'activity'
type TaskFilter = 'open' | 'ready' | 'blocked' | 'completed' | 'all'
type TaskSort = 'manual' | 'priority' | 'deadline' | 'planned'

const tabs = [{ value: 'tasks', label: 'Tasks' }, { value: 'schedule', label: 'Schedule' }, { value: 'activity', label: 'Activity' }] as const

export function ProjectDetailView({
  project, unassigned = false, tasks, schedule, focusThisWeekSeconds = 0,
  onBack, onTaskOpen, onTaskToggle, onTaskMove, onTaskFocus, onAddTask, onEdit, onToggleFavorite, onArchive,
  onSetNextAction, onAddMilestone, onToggleMilestone, onRemoveMilestone,
}: {
  project?: ProjectSummary
  unassigned?: boolean
  tasks: TaskPreview[]
  schedule: SchedulePreview[]
  focusThisWeekSeconds?: number
  onBack: () => void
  onTaskOpen: (id: string) => void
  onTaskToggle: (id: string) => void
  onTaskMove: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onTaskFocus: (id: string) => void
  onAddTask: () => void
  onEdit?: () => void
  onToggleFavorite?: () => void
  onArchive?: () => void
  onSetNextAction?: (taskId?: string) => void
  onAddMilestone?: (title: string, dueDate?: string) => void
  onToggleMilestone?: (milestoneId: string) => void
  onRemoveMilestone?: (milestoneId: string) => void
}) {
  const [tab, setTab] = useState<ProjectTab>('tasks')
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [sort, setSort] = useState<TaskSort>('manual')
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDue, setMilestoneDue] = useState('')

  const openTasks = tasks.filter((task) => !task.completed && task.status !== 'cancelled')
  const completedTasks = tasks.filter((task) => task.completed)
  const taskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks])
  const projectSchedule = schedule.filter((block) => block.taskId && taskIds.has(block.taskId)).sort((a, b) => a.start.localeCompare(b.start))
  const nextAction = project?.nextActionTaskId ? tasks.find((task) => task.id === project.nextActionTaskId) : undefined

  const filteredTasks = useMemo(() => {
    const source = tasks.filter((task) => task.status !== 'cancelled').filter((task) => {
      if (filter === 'all') return true
      if (filter === 'completed') return task.completed
      if (task.completed) return false
      if (filter === 'ready') return !task.activeBlockerCount
      if (filter === 'blocked') return Boolean(task.activeBlockerCount)
      return true
    })
    return [...source].sort((a, b) => {
      if (sort === 'priority') {
        const rank = { critical: 0, high: 1, normal: 2 }
        return rank[a.priority] - rank[b.priority] || (a.planningOrder ?? 0) - (b.planningOrder ?? 0)
      }
      if (sort === 'deadline') return (a.deadline ?? '9999-99-99').localeCompare(b.deadline ?? '9999-99-99') || (a.planningOrder ?? 0) - (b.planningOrder ?? 0)
      if (sort === 'planned') return (a.plannedDate ?? '9999-99-99').localeCompare(b.plannedDate ?? '9999-99-99') || (a.planningOrder ?? 0) - (b.planningOrder ?? 0)
      return (a.planningOrder ?? 0) - (b.planningOrder ?? 0) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    })
  }, [tasks, filter, sort])

  const activity = useMemo(() => {
    const projectEvents = (project?.activity ?? []).map((entry) => ({ id: `project-${entry.id}`, at: entry.at, label: entry.label, kind: entry.kind as 'project' | 'milestone', taskId: undefined as string | undefined }))
    const taskEvents = tasks.map((task) => ({
      id: `task-${task.id}-${task.updatedAt}`,
      at: task.updatedAt ?? task.createdAt ?? '',
      label: `${task.completed ? 'Completed' : task.createdAt === task.updatedAt ? 'Created' : 'Updated'} · ${task.title}`,
      kind: 'task' as const,
      taskId: task.id,
    }))
    return [...projectEvents, ...taskEvents].filter((entry) => entry.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30)
  }, [project?.activity, tasks])

  function addMilestone(event: React.FormEvent) {
    event.preventDefault()
    if (!milestoneTitle.trim() || !onAddMilestone) return
    onAddMilestone(milestoneTitle.trim(), milestoneDue || undefined)
    setMilestoneTitle('')
    setMilestoneDue('')
  }

  return <>
    <div className="project-detail-head">
      <Button onClick={onBack}>← All projects</Button>
      <div className="project-detail-actions">
        {!unassigned && onToggleFavorite ? <Button onClick={onToggleFavorite}>{project?.favorite ? '★ Favorite' : '☆ Favorite'}</Button> : null}
        {!unassigned && onEdit ? <Button onClick={onEdit}>Edit</Button> : null}
        {!unassigned && onArchive ? <Button onClick={onArchive}>Archive</Button> : null}
        <Button variant="primary" icon="plus" onClick={onAddTask}>Add task</Button>
      </div>
    </div>

    <header className="project-hero project-hero--workflow" style={{ '--project-color': project?.color ?? 'var(--muted-2)' } as ProjectStyle}>
      <span className="project-hero__rule" />
      <div className="project-hero__eyebrow-row">
        <div className="kicker">{unassigned ? 'Organization' : project?.type === 'academic' ? 'Academic project' : 'Project'}</div>
        {!unassigned && project ? <span className={`project-status project-status--${project.status}`}>{formatStatus(project.status)}</span> : null}
      </div>
      <h1>{!unassigned && project?.icon ? <span className="project-hero__icon">{project.icon}</span> : null}{unassigned ? 'No project' : project?.name}</h1>
      <p>{unassigned ? 'Tasks that have not been assigned a project yet.' : project?.description || 'No project outcome has been written yet.'}</p>

      {!unassigned && project ? <div className="project-progress-block">
        <div><strong>{project.progressPercent}% complete</strong><span>{project.completedTaskCount} of {project.openTaskCount + project.completedTaskCount} tracked tasks done</span></div>
        <div className="project-progress-track" aria-label={`${project.progressPercent}% complete`}><span style={{ width: `${project.progressPercent}%` }} /></div>
      </div> : null}

      <div className="project-hero__stats">
        <div><strong>{openTasks.length}</strong><span>Open</span></div>
        <div><strong>{completedTasks.length}</strong><span>Completed</span></div>
        <div><strong>{formatFocus(focusThisWeekSeconds)}</strong><span>Focus this week</span></div>
        {!unassigned && project ? <>
          <div><strong>{project.deadline ? formatDate(project.deadline) : '—'}</strong><span>Project deadline</span></div>
          <div><strong>{project.milestoneTotal ? `${project.milestoneCompleteCount}/${project.milestoneTotal}` : '—'}</strong><span>Milestones</span></div>
        </> : null}
      </div>
    </header>

    {!unassigned && project ? <div className="project-workflow-overview">
      <section className="project-next-action">
        <span className="eyebrow">Next action</span>
        {nextAction || project.nextActionTitle ? <>
          <button className="project-next-action__task" onClick={() => project.nextActionTaskId && onTaskOpen(project.nextActionTaskId)}>
            <strong>{nextAction?.title ?? project.nextActionTitle}</strong>
            <span>{nextAction?.activeBlockerCount ? `Blocked by ${nextAction.activeBlockerCount}` : 'Ready to execute'}</span>
          </button>
          <div className="project-next-action__actions">
            {project.nextActionTaskId ? <Button variant="primary" disabled={Boolean(nextAction?.activeBlockerCount)} onClick={() => project.nextActionTaskId && onTaskFocus(project.nextActionTaskId)}>Focus</Button> : null}
            {onSetNextAction ? <Button onClick={() => onSetNextAction(undefined)}>Clear</Button> : null}
          </div>
        </> : <p>No next action yet. Mark one from the task menu or let Folio surface the first ready task.</p>}
      </section>

      <section className="project-context-card">
        <span className="eyebrow">Context</span>
        <p>{project.notes || 'No project notes yet.'}</p>
        <div>{project.type === 'academic' && project.examDate ? <span>Exam · {formatDate(project.examDate)}</span> : null}{project.weeklyTargetMinutes ? <span>Weekly target · {formatMinutes(project.weeklyTargetMinutes)}</span> : null}</div>
      </section>
    </div> : null}

    {!unassigned && project ? <Panel title="Milestones" meta={`${project.milestoneCompleteCount} / ${project.milestoneTotal} complete`}>
      <div className="project-milestones">
        {project.milestones.length ? [...project.milestones].sort((a, b) => a.sortOrder - b.sortOrder).map((milestone) => <div className={`project-milestone ${milestone.completedAt ? 'is-complete' : ''}`} key={milestone.id}>
          <button className={`task-check ${milestone.completedAt ? 'task-check--done' : ''}`} aria-label={`${milestone.completedAt ? 'Reopen' : 'Complete'} ${milestone.title}`} onClick={() => onToggleMilestone?.(milestone.id)} />
          <div><strong>{milestone.title}</strong><span>{milestone.dueDate ? `Due ${formatDate(milestone.dueDate)}` : 'No milestone date'}</span></div>
          <button className="project-milestone__remove" aria-label={`Remove ${milestone.title}`} onClick={() => onRemoveMilestone?.(milestone.id)}>×</button>
        </div>) : <div className="empty-state">No milestones yet. Add only meaningful checkpoints.</div>}
        {onAddMilestone ? <form className="project-milestone-add" onSubmit={addMilestone}><input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="Add milestone…" /><input type="date" value={milestoneDue} onChange={(event) => setMilestoneDue(event.target.value)} /><Button type="submit" disabled={!milestoneTitle.trim()}>Add</Button></form> : null}
      </div>
    </Panel> : null}

    <Tabs value={tab} tabs={tabs} onChange={setTab} />

    {tab === 'tasks' ? <div className="project-tab-stack">
      <div className="project-task-toolbar">
        <div className="project-task-filters">
          {(['open', 'ready', 'blocked', 'completed', 'all'] as TaskFilter[]).map((value) => <button key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}><option value="manual">Manual</option><option value="priority">Priority</option><option value="deadline">Deadline</option><option value="planned">Planned date</option></select></label>
      </div>
      <Panel title={filter === 'completed' ? 'Completed tasks' : filter === 'all' ? 'All tasks' : 'Project tasks'} meta={`${filteredTasks.length} shown`}>
        {filteredTasks.length ? filteredTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onTaskToggle} onOpen={onTaskOpen} actions={<ProjectTaskActions task={task} isNext={project?.nextActionTaskId === task.id} onMove={onTaskMove} onFocus={onTaskFocus} onNext={onSetNextAction} />} />) : <div className="empty-state">No tasks match this view.</div>}
      </Panel>
    </div> : null}

    {tab === 'schedule' ? <Panel title="Scheduled work" meta={`${projectSchedule.length} blocks`}>
      {projectSchedule.length ? <div className="project-schedule-list">{projectSchedule.map((block) => <div className="project-schedule-row" key={block.id}><time>{formatDateTime(block.start)}</time><strong>{block.name}</strong><span>{formatMinutes(block.durationMinutes)}</span></div>)}</div> : <div className="empty-state">No time blocks are linked to this project's tasks yet.</div>}
    </Panel> : null}

    {tab === 'activity' ? <Panel title="Project history" meta={`${activity.length} recent events`}>
      {activity.length ? <div className="project-activity-list">{activity.map((entry) => entry.taskId ? <button key={entry.id} onClick={() => onTaskOpen(entry.taskId!)}><span className={`activity-mark ${entry.kind === 'task' ? '' : 'is-complete'}`} /><div><strong>{entry.label}</strong><span>{formatActivityTime(entry.at)}</span></div></button> : <div className="project-activity-event" key={entry.id}><span className={`activity-mark ${entry.kind === 'milestone' ? 'is-complete' : ''}`} /><div><strong>{entry.label}</strong><span>{formatActivityTime(entry.at)}</span></div></div>)}</div> : <div className="empty-state">Project activity will appear as work changes.</div>}
    </Panel> : null}
  </>
}

function ProjectTaskActions({ task, isNext, onMove, onFocus, onNext }: {
  task: TaskPreview
  isNext: boolean
  onMove: (id: string, target: 'today' | 'tomorrow' | 'later') => void
  onFocus: (id: string) => void
  onNext?: (taskId?: string) => void
}) {
  if (task.completed) return isNext && onNext ? <Button onClick={() => onNext(undefined)}>Clear next</Button> : null
  return <details className="task-row-menu project-task-menu">
    <summary aria-label={`Actions for ${task.title}`}>···</summary>
    <div className="task-row-menu__popover">
      <span className="eyebrow">Quick action</span>
      {onNext ? <button onClick={() => onNext(isNext ? undefined : task.id)}>{isNext ? 'Clear next action' : 'Set as next action'}</button> : null}
      <button disabled={Boolean(task.activeBlockerCount)} onClick={() => onFocus(task.id)}>{task.activeBlockerCount ? 'Blocked' : 'Start focus'}</button>
      <button onClick={() => onMove(task.id, 'today')}>Move to Today</button>
      <button onClick={() => onMove(task.id, 'tomorrow')}>Move to Tomorrow</button>
      <button onClick={() => onMove(task.id, 'later')}>Move to Later</button>
    </div>
  </details>
}

function formatStatus(value: ProjectSummary['status']) { return value === 'on-hold' ? 'On hold' : value === 'completed' ? 'Completed' : 'Active' }
function formatFocus(seconds: number) { const minutes = Math.round(seconds / 60); return formatMinutes(minutes) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatActivityTime(value?: string) { return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—' }
