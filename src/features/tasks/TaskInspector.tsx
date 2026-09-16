import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { localDateKey } from '../../domain/date'
import type { RecurringSeriesEntity } from '../../domain/models'
import { seriesSummary } from '../recurrence/recurrenceLogic'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskUpdateInput } from '../../repositories/taskRepository'
import type { TaskPreview } from '../../types/ui'

export function TaskInspector({ task, subtasks, projects, dependencyCandidates, series, focusSeconds = 0, onClose, onSave, onToggle, onToggleSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }: {
  task: TaskPreview | null
  subtasks: TaskPreview[]
  projects: ProjectSummary[]
  dependencyCandidates: TaskPreview[]
  series?: RecurringSeriesEntity | null
  focusSeconds?: number
  onClose: () => void
  onSave: (id: string, changes: TaskUpdateInput, scope?: 'this' | 'future' | 'entire') => Promise<void>
  onToggle: (id: string) => void
  onToggleSubtask: (id: string) => void
  onAddSubtask: (parentId: string, title: string) => Promise<void>
  onDeleteSubtask: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onProcessInbox: (id: string, options?: { plannedDate?: string; projectId?: string }) => void
  onOpenRecurrence: () => void
  onSkipOccurrence: (id: string) => void
  onSetSeriesStatus: (seriesId: string, status: 'active' | 'paused' | 'archived') => void
  onFocus: (taskId: string) => void
}) {
  return (
    <Drawer open={Boolean(task)} title="Task" onClose={onClose} className="task-drawer-overlay">
      {task ? <TaskInspectorForm key={`${task.id}:${task.updatedAt}:${series?.updatedAt ?? ''}`} {...{ task, subtasks, projects, dependencyCandidates, series, focusSeconds, onSave, onToggle, onToggleSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }} /> : null}
    </Drawer>
  )
}

function TaskInspectorForm({ task, subtasks, projects, dependencyCandidates, series, focusSeconds, onSave, onToggle, onToggleSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }: {
  task: TaskPreview
  subtasks: TaskPreview[]
  projects: ProjectSummary[]
  dependencyCandidates: TaskPreview[]
  series?: RecurringSeriesEntity | null
  focusSeconds: number
  onSave: (id: string, changes: TaskUpdateInput, scope?: 'this' | 'future' | 'entire') => Promise<void>
  onToggle: (id: string) => void
  onToggleSubtask: (id: string) => void
  onAddSubtask: (parentId: string, title: string) => Promise<void>
  onDeleteSubtask: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onProcessInbox: (id: string, options?: { plannedDate?: string; projectId?: string }) => void
  onOpenRecurrence: () => void
  onSkipOccurrence: (id: string) => void
  onSetSeriesStatus: (seriesId: string, status: 'active' | 'paused' | 'archived') => void
  onFocus: (taskId: string) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [projectId, setProjectId] = useState(task.projectId ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState(task.status)
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? '')
  const [deadline, setDeadline] = useState(task.deadline ?? '')
  const [estimate, setEstimate] = useState(String(task.durationMinutes ?? ''))
  const [blockedByTaskIds, setBlockedByTaskIds] = useState<string[]>(task.blockedByTaskIds ?? [])
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveScope, setSaveScope] = useState<'this' | 'future' | 'entire'>('this')
  const dirty = useMemo(() =>
    title.trim() !== task.title || description !== (task.description ?? '') || projectId !== (task.projectId ?? '') || priority !== task.priority || status !== task.status || plannedDate !== (task.plannedDate ?? '') || deadline !== (task.deadline ?? '') || estimate !== String(task.durationMinutes ?? '') || blockedByTaskIds.join('|') !== (task.blockedByTaskIds ?? []).join('|'),
    [title, description, projectId, priority, status, plannedDate, deadline, estimate, blockedByTaskIds, task])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && dirty) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(task.id, {
        title: title.trim(),
        description,
        projectId: projectId || null,
        priority,
        status,
        plannedDate: plannedDate || null,
        deadline: deadline || null,
        estimatedMinutes: estimate ? Number(estimate) : null,
        blockedByTaskIds: status === 'inbox' ? [] : blockedByTaskIds,
      }, series ? saveScope : 'this')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The task could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function addSubtask(event: React.FormEvent) {
    event.preventDefault()
    if (!subtaskTitle.trim()) return
    try {
      await onAddSubtask(task.id, subtaskTitle.trim())
      setSubtaskTitle('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The subtask could not be added.')
    }
  }

  return (
    <div className="task-editor">
      {task.status === 'inbox' ? (
        <div className="inbox-processing-strip">
          <div><strong>Inbox capture</strong><span>Give it a home when you are ready.</span></div>
          <div><Button onClick={() => onProcessInbox(task.id, { projectId: projectId || undefined })}>Move to to-do</Button><Button variant="primary" onClick={() => onProcessInbox(task.id, { plannedDate: localDateKey(), projectId: projectId || undefined })}>Plan today</Button></div>
        </div>
      ) : null}

      <div className={`recurrence-strip ${series ? 'is-series' : ''}`}>
        <div><span className="recurrence-glyph">↻</span><div><strong>{series ? seriesSummary(series) : 'Does not repeat'}</strong><span>{series ? `${series.status === 'active' ? 'Active series' : series.status} · occurrence ${task.recurrenceDate ?? task.plannedDate ?? ''}` : 'Turn this task into a recurring series when needed.'}</span></div></div>
        <div className="recurrence-strip__actions"><Button onClick={onOpenRecurrence}>{series ? 'Edit repeat' : 'Make recurring'}</Button>{series ? <><Button onClick={() => onSkipOccurrence(task.id)}>Skip this</Button>{series.status !== 'archived' ? <Button onClick={() => onSetSeriesStatus(series.id, series.status === 'active' ? 'paused' : 'active')}>{series.status === 'active' ? 'Pause' : 'Resume'}</Button> : null}{series.status !== 'archived' ? <Button onClick={() => onSetSeriesStatus(series.id, 'archived')}>End series</Button> : null}</> : null}</div>
      </div>

      <label className="task-title-field"><span>Task title</span><textarea rows={2} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field task-notes-field"><span>Notes</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, links, acceptance criteria, or anything useful when you return to this task." /></label>

      <section className="task-property-section">
        <div className="eyebrow">Properties</div>
        <div className="task-property-grid">
          <label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskPreview['status'])}><option value="inbox">Inbox</option><option value="todo">To do</option><option value="completed">Completed</option></select></label>
          <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPreview['priority'])}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label className="field"><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.archived ? ' (archived)' : ''}</option>)}</select></label>
          <label className="field"><span>Estimate</span><input type="number" min="1" max="1440" value={estimate} placeholder="Minutes" onChange={(event) => setEstimate(event.target.value)} /></label>
          <label className="field"><span>Planned day</span><input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
          <label className="field"><span>Hard deadline</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        </div>
      </section>


      {task.status !== 'inbox' ? <section className="task-dependency-section">
        <div className="task-section-head"><div><div className="eyebrow">Dependencies</div><span>{task.activeBlockerCount ? `Blocked by ${task.activeBlockerCount} unfinished prerequisite${task.activeBlockerCount === 1 ? '' : 's'}` : blockedByTaskIds.length ? 'All prerequisites complete' : 'No prerequisites'}</span></div></div>
        {task.blockedByTitles?.length ? <div className="dependency-warning"><strong>Not ready yet</strong><span>{task.blockedByTitles.join(' · ')}</span></div> : null}
        <details className="dependency-picker">
          <summary>{blockedByTaskIds.length ? `${blockedByTaskIds.length} prerequisite${blockedByTaskIds.length === 1 ? '' : 's'} selected` : 'Add prerequisite'}</summary>
          <div className="dependency-options">
            {dependencyCandidates.filter((candidate) => candidate.id !== task.id && !candidate.parentTaskId && candidate.status !== 'cancelled' && candidate.status !== 'inbox').map((candidate) => <label key={candidate.id}><input type="checkbox" checked={blockedByTaskIds.includes(candidate.id)} onChange={() => setBlockedByTaskIds((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span><strong>{candidate.title}</strong><small>{candidate.completed ? 'Completed' : candidate.project ?? 'No project'}</small></span></label>)}
            {!dependencyCandidates.some((candidate) => candidate.id !== task.id && !candidate.parentTaskId && candidate.status !== 'cancelled' && candidate.status !== 'inbox') ? <div className="empty-state">No other tasks are available as prerequisites.</div> : null}
          </div>
        </details>
      </section> : null}

      <section className="task-execution-section">
        <div className="task-section-head"><div><div className="eyebrow">Execution</div><span>Tracked across focus sessions</span></div>{task.status === 'todo' ? <Button variant="primary" disabled={Boolean(task.activeBlockerCount)} onClick={() => onFocus(task.id)}>{task.activeBlockerCount ? 'Blocked' : 'Start focus'}</Button> : null}</div>
        <div className="task-execution-metrics">
          <div><span>Focused</span><strong>{formatFocusMinutes(focusSeconds)}</strong></div>
          <div><span>Estimate</span><strong>{task.durationMinutes ? `${task.durationMinutes}m` : '—'}</strong></div>
          <div><span>{task.durationMinutes && focusSeconds / 60 > task.durationMinutes ? 'Over estimate' : 'Estimated remaining'}</span><strong>{task.durationMinutes ? formatEstimateDelta(task.durationMinutes, focusSeconds) : '—'}</strong></div>
        </div>
      </section>

      <section className="subtask-section">
        <div className="task-section-head"><div><div className="eyebrow">Subtasks</div><span>{subtasks.filter((item) => item.completed).length} / {subtasks.length} complete</span></div></div>
        <div className="subtask-list">
          {subtasks.map((subtask) => (
            <div className="subtask-row" key={subtask.id}>
              <button className={`task-check ${subtask.completed ? 'task-check--done' : ''}`} aria-label={subtask.completed ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`} onClick={() => onToggleSubtask(subtask.id)} />
              <span className={subtask.completed ? 'is-completed' : ''}>{subtask.title}</span>
              <button className="subtask-remove" aria-label={`Remove ${subtask.title}`} onClick={() => onDeleteSubtask(subtask.id)}>×</button>
            </div>
          ))}
          {!subtasks.length ? <div className="subtask-empty">Break larger work down only when it helps execution.</div> : null}
        </div>
        <form className="subtask-add" onSubmit={addSubtask}>
          <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Add a subtask…" />
          <Button type="submit" disabled={!subtaskTitle.trim()}>Add</Button>
        </form>
      </section>

      <section className="task-history-strip">
        <div><span>Rescheduled</span><strong>{task.rescheduleCount}×</strong></div>
        <div><span>Created</span><strong>{formatTimestamp(task.createdAt)}</strong></div>
        <div><span>Updated</span><strong>{formatTimestamp(task.updatedAt)}</strong></div>
      </section>

      {error ? <div className="form-error">{error}</div> : null}
      <div className="task-save-row task-save-row--scoped">
        {series ? <label className="task-save-scope"><span>Apply content changes to</span><select value={saveScope} onChange={(event) => setSaveScope(event.target.value as typeof saveScope)}><option value="this">This occurrence</option><option value="future">This and future</option><option value="entire">Entire series</option></select></label> : null}
        <div className="task-save-actions"><Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</Button><span>⌘/Ctrl + Enter</span></div>
      </div>

      <div className="task-danger-actions">
        <Button onClick={() => onToggle(task.id)}>{task.completed ? 'Reopen' : 'Complete'}</Button>
        <Button onClick={() => onDuplicate(task.id)}>Duplicate</Button>
        <Button onClick={() => onDelete(task.id)}>Move to trash</Button>
      </div>
    </div>
  )
}

function formatFocusMinutes(seconds: number) { const minutes = Math.round(seconds / 60); const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatEstimateDelta(estimateMinutes: number, focusSeconds: number) { const actual = Math.round(focusSeconds / 60); const delta = estimateMinutes - actual; return delta >= 0 ? `${delta}m` : `+${Math.abs(delta)}m` }

function formatTimestamp(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}
