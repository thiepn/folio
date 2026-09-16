import { useMemo, useState, type CSSProperties } from 'react'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { Tabs } from '../../components/ui/Tabs'
import { TaskRow } from '../../components/ui/TaskRow'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { SchedulePreview, TaskPreview } from '../../types/ui'

type ProjectStyle = CSSProperties & { '--project-color': string }

type ProjectTab = 'tasks' | 'schedule' | 'activity'
const tabs = [{ value: 'tasks', label: 'Tasks' }, { value: 'schedule', label: 'Schedule' }, { value: 'activity', label: 'Activity' }] as const

export function ProjectDetailView({ project, unassigned = false, tasks, schedule, focusThisWeekSeconds = 0, onBack, onTaskOpen, onTaskToggle, onAddTask, onEdit, onToggleFavorite, onArchive }: {
  project?: ProjectSummary
  unassigned?: boolean
  tasks: TaskPreview[]
  schedule: SchedulePreview[]
  focusThisWeekSeconds?: number
  onBack: () => void
  onTaskOpen: (id: string) => void
  onTaskToggle: (id: string) => void
  onAddTask: () => void
  onEdit?: () => void
  onToggleFavorite?: () => void
  onArchive?: () => void
}) {
  const [tab, setTab] = useState<ProjectTab>('tasks')
  const openTasks = tasks.filter((task) => !task.completed && task.status !== 'cancelled')
  const completedTasks = tasks.filter((task) => task.completed)
  const taskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks])
  const projectSchedule = schedule.filter((block) => block.taskId && taskIds.has(block.taskId)).sort((a, b) => a.start.localeCompare(b.start))
  const activity = [...tasks].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 20)

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
    <header className="project-hero" style={{ '--project-color': project?.color ?? 'var(--muted-2)' } as ProjectStyle}>
      <span className="project-hero__rule" />
      <div className="kicker">{unassigned ? 'Organization' : project?.type === 'academic' ? 'Academic project' : 'Project'}</div>
      <h1>{!unassigned && project?.icon ? <span className="project-hero__icon">{project.icon}</span> : null}{unassigned ? 'No project' : project?.name}</h1>
      <p>{unassigned ? 'Tasks that have not been assigned a project yet.' : project?.description || 'No project description.'}</p>
      <div className="project-hero__stats">
        <div><strong>{openTasks.length}</strong><span>Open</span></div>
        <div><strong>{completedTasks.length}</strong><span>Completed</span></div>
        <div><strong>{formatFocus(focusThisWeekSeconds)}</strong><span>Focus this week</span></div>
        {project?.type === 'academic' ? <>
          <div><strong>{project.examDate ? formatDate(project.examDate) : '—'}</strong><span>Exam</span></div>
          <div><strong>{project.weeklyTargetMinutes ? formatMinutes(project.weeklyTargetMinutes) : '—'}</strong><span>Weekly target</span></div>
        </> : <div><strong>{project?.nextDeadline ? formatDate(project.nextDeadline) : '—'}</strong><span>Next deadline</span></div>}
      </div>
    </header>
    <Tabs value={tab} tabs={tabs} onChange={setTab} />
    {tab === 'tasks' ? <div className="project-tab-stack">
      <Panel title="Open" meta={`${openTasks.length} tasks`}>{openTasks.length ? openTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onTaskToggle} onOpen={onTaskOpen} />) : <div className="empty-state">No open tasks in this project.</div>}</Panel>
      {completedTasks.length ? <Panel title="Completed" meta={`${completedTasks.length} tasks`}>{completedTasks.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} onToggle={onTaskToggle} onOpen={onTaskOpen} />)}</Panel> : null}
    </div> : null}
    {tab === 'schedule' ? <Panel title="Scheduled work" meta={`${projectSchedule.length} blocks`}>
      {projectSchedule.length ? <div className="project-schedule-list">{projectSchedule.map((block) => <div className="project-schedule-row" key={block.id}><time>{formatDateTime(block.start)}</time><strong>{block.name}</strong><span>{formatMinutes(block.durationMinutes)}</span></div>)}</div> : <div className="empty-state">No time blocks are linked to this project's tasks yet.</div>}
    </Panel> : null}
    {tab === 'activity' ? <Panel title="Recent activity" meta="Foundation">
      {activity.length ? <div className="project-activity-list">{activity.map((task) => <button key={task.id} onClick={() => onTaskOpen(task.id)}><span className={`activity-mark ${task.completed ? 'is-complete' : ''}`} /><div><strong>{task.completed ? 'Completed' : task.createdAt === task.updatedAt ? 'Created' : 'Updated'} · {task.title}</strong><span>{formatActivityTime(task.updatedAt)}</span></div></button>)}</div> : <div className="empty-state">Project activity will appear as tasks change.</div>}
    </Panel> : null}
  </>
}

function formatFocus(seconds: number) { const minutes = Math.round(seconds / 60); return formatMinutes(minutes) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatActivityTime(value?: string) { return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—' }
