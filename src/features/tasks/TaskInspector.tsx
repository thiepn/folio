import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { localDateKey } from '../../domain/date'
import type { ListEntity, RecurringSeriesEntity, SectionEntity, TagEntity } from '../../domain/models'
import { seriesSummary } from '../recurrence/recurrenceLogic'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskUpdateInput } from '../../repositories/taskRepository'
import type { TaskPreview } from '../../types/ui'
import { TaskReminderSection } from '../reminders/TaskReminderSection'
import { MarkdownEditor } from '../content/MarkdownEditor'
import { AttachmentPanel } from '../content/AttachmentPanel'
import { noteService } from '../../services/noteService'

type SaveScope = 'this' | 'future' | 'entire'
type ChecklistItem = NonNullable<TaskPreview['checklist']>[number]
type CommentItem = NonNullable<TaskPreview['comments']>[number]

function parseTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 50)
}

export function TaskInspector({ task, subtasks, projects, lists, sections, tags: knownTags, dependencyCandidates, series, focusSeconds = 0, onClose, onSave, onToggle, onToggleSubtask, onOpenSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }: {
  task: TaskPreview | null
  subtasks: TaskPreview[]
  projects: ProjectSummary[]
  lists: ListEntity[]
  sections: SectionEntity[]
  tags: TagEntity[]
  dependencyCandidates: TaskPreview[]
  series?: RecurringSeriesEntity | null
  focusSeconds?: number
  onClose: () => void
  onSave: (id: string, changes: TaskUpdateInput, scope?: SaveScope) => Promise<void>
  onToggle: (id: string) => void
  onToggleSubtask: (id: string) => void
  onOpenSubtask: (id: string) => void
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
      {task ? <TaskInspectorForm key={task.id + ':' + task.updatedAt + ':' + (series?.updatedAt ?? '')} {...{ task, subtasks, projects, lists, sections, knownTags, dependencyCandidates, series, focusSeconds, onSave, onToggle, onToggleSubtask, onOpenSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }} /> : null}
    </Drawer>
  )
}

function TaskInspectorForm({ task, subtasks, projects, lists, sections, knownTags, dependencyCandidates, series, focusSeconds, onSave, onToggle, onToggleSubtask, onOpenSubtask, onAddSubtask, onDeleteSubtask, onDuplicate, onDelete, onProcessInbox, onOpenRecurrence, onSkipOccurrence, onSetSeriesStatus, onFocus }: {
  task: TaskPreview
  subtasks: TaskPreview[]
  projects: ProjectSummary[]
  lists: ListEntity[]
  sections: SectionEntity[]
  knownTags: TagEntity[]
  dependencyCandidates: TaskPreview[]
  series?: RecurringSeriesEntity | null
  focusSeconds: number
  onSave: (id: string, changes: TaskUpdateInput, scope?: SaveScope) => Promise<void>
  onToggle: (id: string) => void
  onToggleSubtask: (id: string) => void
  onOpenSubtask: (id: string) => void
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
  const [listId, setListId] = useState(task.listId ?? '')
  const [sectionId, setSectionId] = useState(task.sectionId ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState(task.status)
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? '')
  const [deadline, setDeadline] = useState(task.deadline ?? '')
  const [timelineStart, setTimelineStart] = useState(task.timelineStart ?? '')
  const [timelineEnd, setTimelineEnd] = useState(task.timelineEnd ?? '')
  const [timelineMilestone, setTimelineMilestone] = useState(Boolean(task.timelineMilestone))
  const [estimate, setEstimate] = useState(String(task.durationMinutes ?? ''))
  const [tags, setTags] = useState((task.tags ?? []).join(', '))
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist ?? [])
  const [progressMode, setProgressMode] = useState<'auto' | 'manual'>(task.progressMode ?? 'auto')
  const [progressPercent, setProgressPercent] = useState(task.progressPercent ?? 0)
  const [sourceUrl, setSourceUrl] = useState(task.sourceUrl ?? '')
  const [location, setLocation] = useState(task.location ?? '')
  const [pinned, setPinned] = useState(Boolean(task.pinned))
  const [comments, setComments] = useState<CommentItem[]>(task.comments ?? [])
  const [blockedByTaskIds, setBlockedByTaskIds] = useState<string[]>(task.blockedByTaskIds ?? [])
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [checklistTitle, setChecklistTitle] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [contentMessage, setContentMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveScope, setSaveScope] = useState<SaveScope>('this')

  const autoProgress = useMemo(() => {
    if (status === 'completed') return 100
    const units = subtasks.length + checklist.length
    if (!units) return 0
    const done = subtasks.filter((item) => item.completed).length + checklist.filter((item) => item.completed).length
    return Math.round((done / units) * 100)
  }, [status, subtasks, checklist])

  const dirty = useMemo(() => {
    const currentTags = parseTags(tags)
    return title.trim() !== task.title
      || description !== (task.description ?? '')
      || projectId !== (task.projectId ?? '')
      || listId !== (task.listId ?? '')
      || sectionId !== (task.sectionId ?? '')
      || priority !== task.priority
      || status !== task.status
      || plannedDate !== (task.plannedDate ?? '')
      || deadline !== (task.deadline ?? '')
      || timelineStart !== (task.timelineStart ?? '')
      || timelineEnd !== (task.timelineEnd ?? '')
      || timelineMilestone !== Boolean(task.timelineMilestone)
      || estimate !== String(task.durationMinutes ?? '')
      || currentTags.join('|') !== (task.tags ?? []).join('|')
      || JSON.stringify(checklist) !== JSON.stringify(task.checklist ?? [])
      || progressMode !== (task.progressMode ?? 'auto')
      || progressPercent !== (task.progressPercent ?? 0)
      || sourceUrl !== (task.sourceUrl ?? '')
      || location !== (task.location ?? '')
      || pinned !== Boolean(task.pinned)
      || JSON.stringify(comments) !== JSON.stringify(task.comments ?? [])
      || blockedByTaskIds.join('|') !== (task.blockedByTaskIds ?? []).join('|')
  }, [title, description, projectId, listId, sectionId, priority, status, plannedDate, deadline, timelineStart, timelineEnd, timelineMilestone, estimate, tags, checklist, progressMode, progressPercent, sourceUrl, location, pinned, comments, blockedByTaskIds, task])

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

  async function save(): Promise<boolean> {
    if (!title.trim() || saving) return false
    setSaving(true)
    setError('')
    try {
      await onSave(task.id, {
        title: title.trim(),
        description,
        projectId: projectId || null,
        listId: listId || null,
        sectionId: listId && sectionId ? sectionId : null,
        priority,
        status,
        plannedDate: plannedDate || null,
        deadline: deadline || null,
        timelineStart: timelineStart || null,
        timelineEnd: timelineStart ? (timelineMilestone ? timelineStart : (timelineEnd || timelineStart)) : null,
        timelineMilestone: timelineStart ? timelineMilestone : false,
        estimatedMinutes: estimate ? Number(estimate) : null,
        tags: parseTags(tags),
        checklist,
        progressMode,
        progressPercent: progressMode === 'manual' ? progressPercent : 0,
        sourceUrl: sourceUrl.trim() || null,
        location: location.trim() || null,
        pinned,
        comments,
        blockedByTaskIds: status === 'inbox' || task.parentTaskId ? [] : blockedByTaskIds,
      }, series ? saveScope : 'this')
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The task could not be saved.')
      return false
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
      setError(reason instanceof Error ? reason.message : 'The nested task could not be added.')
    }
  }

  function addChecklistItem(event: React.FormEvent) {
    event.preventDefault()
    const text = checklistTitle.trim()
    if (!text) return
    const now = new Date().toISOString()
    setChecklist((items) => [...items, { id: crypto.randomUUID(), text, completed: false, sortOrder: items.length, createdAt: now, updatedAt: now }])
    setChecklistTitle('')
  }

  function toggleChecklistItem(id: string) {
    const now = new Date().toISOString()
    setChecklist((items) => items.map((item) => item.id === id ? { ...item, completed: !item.completed, completedAt: !item.completed ? now : undefined, updatedAt: now } : item))
  }

  function updateChecklistText(id: string, text: string) {
    const now = new Date().toISOString()
    setChecklist((items) => items.map((item) => item.id === id ? { ...item, text, updatedAt: now } : item))
  }

  function addComment(event: React.FormEvent) {
    event.preventDefault()
    const body = commentBody.trim()
    if (!body) return
    const now = new Date().toISOString()
    setComments((items) => [...items, { id: crypto.randomUUID(), body, createdAt: now, updatedAt: now }])
    setCommentBody('')
  }

  async function createStandaloneNote() {
    setError(''); setContentMessage('')
    try {
      if (dirty && !(await save())) return
      const note = await noteService.createFromTask(task.id)
      setContentMessage(`Created standalone note “${note.title}” with this task's attachments.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The note could not be created.')
    }
  }

  const visibleProgress = progressMode === 'auto' ? autoProgress : progressPercent

  return (
    <div className="task-editor task-editor--v2">
      {task.status === 'inbox' ? (
        <div className="inbox-processing-strip">
          <div><strong>Inbox capture</strong><span>Give it a home when you are ready.</span></div>
          <div><Button onClick={() => onProcessInbox(task.id, { projectId: projectId || undefined })}>Move to to-do</Button><Button variant="primary" onClick={() => onProcessInbox(task.id, { plannedDate: localDateKey(), projectId: projectId || undefined })}>Plan today</Button></div>
        </div>
      ) : null}

      {!task.parentTaskId ? (
        <div className={'recurrence-strip ' + (series ? 'is-series' : '')}>
          <div><span className="recurrence-glyph">↻</span><div><strong>{series ? seriesSummary(series) : 'Does not repeat'}</strong><span>{series ? (series.status === 'active' ? 'Active series' : series.status) + ' · occurrence ' + (task.recurrenceDate ?? task.plannedDate ?? '') : 'Turn this task into a recurring series when needed.'}</span></div></div>
          <div className="recurrence-strip__actions"><Button onClick={onOpenRecurrence}>{series ? 'Edit repeat' : 'Make recurring'}</Button>{series ? <><Button onClick={() => onSkipOccurrence(task.id)}>Skip this</Button>{series.status !== 'archived' ? <Button onClick={() => onSetSeriesStatus(series.id, series.status === 'active' ? 'paused' : 'active')}>{series.status === 'active' ? 'Pause' : 'Resume'}</Button> : null}{series.status !== 'archived' ? <Button onClick={() => onSetSeriesStatus(series.id, 'archived')}>End series</Button> : null}</> : null}</div>
        </div>
      ) : <div className="nested-task-strip"><strong>Nested task</strong><span>This task can contain its own child tasks.</span></div>}

      <div className="task-v2-title-row">
        <label className="task-title-field"><span>Task title</span><textarea rows={2} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="task-pin-toggle"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>Pin</span></label>
      </div>
      <section className="task-rich-content-section">
        <div className="task-section-head"><div><div className="eyebrow">Rich content</div><span>Markdown content stays part of the task and is indexed for search.</span></div><Button onClick={() => void createStandaloneNote()}>Task → standalone note</Button></div>
        <MarkdownEditor value={description} onChange={setDescription} label="Task notes · Markdown" placeholder="Context, acceptance criteria, research, links, code, or an embedded checklist." />
        <AttachmentPanel ownerType="task" ownerId={task.id} />
        {contentMessage ? <div className="note-message">{contentMessage}</div> : null}
      </section>

      <section className="task-property-section">
        <div className="eyebrow">Properties</div>
        <div className="task-property-grid">
          <label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskPreview['status'])}><option value="inbox">Inbox</option><option value="todo">To do</option><option value="completed">Completed</option></select></label>
          <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPreview['priority'])}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label className="field"><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.archived ? ' (archived)' : ''}</option>)}</select></label>
          <label className="field"><span>List</span><select value={listId} onChange={(event) => { setListId(event.target.value); setSectionId('') }}><option value="">No list</option>{lists.filter((list)=>!list.archived).map((list)=><option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          <label className="field"><span>Section</span><select value={sectionId} disabled={!listId} onChange={(event)=>setSectionId(event.target.value)}><option value="">No section</option>{sections.filter((section)=>section.listId===listId&&!section.archived).map((section)=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <label className="field"><span>Estimate</span><input type="number" min="1" max="1440" value={estimate} placeholder="Minutes" onChange={(event) => setEstimate(event.target.value)} /></label>
          <label className="field"><span>Planned day</span><input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
          <label className="field"><span>Hard deadline</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          <label className="field"><span>Timeline start</span><input type="date" value={timelineStart} onChange={(event) => { const next=event.target.value; setTimelineStart(next); if(!next){setTimelineEnd('');setTimelineMilestone(false)} else if(timelineMilestone){setTimelineEnd(next)} }} /></label>
          <label className="field"><span>Timeline end</span><input type="date" value={timelineEnd} min={timelineStart||undefined} disabled={!timelineStart||timelineMilestone} onChange={(event) => setTimelineEnd(event.target.value)} /></label>
          <label className="check-field task-timeline-milestone"><input type="checkbox" checked={timelineMilestone} disabled={!timelineStart} onChange={(event) => { setTimelineMilestone(event.target.checked); if(event.target.checked&&timelineStart)setTimelineEnd(timelineStart) }} /><span>Timeline milestone</span></label>
        </div>
      </section>

      <section className="task-v2-context-section">
        <div className="task-section-head"><div><div className="eyebrow">Context</div><span>Keep execution details with the task.</span></div></div>
        <label className="field"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="university, deep-work, admin" /><small>Comma-separated names are resolved into the global tag registry.</small></label>
        <div className="task-property-grid">
          <label className="field"><span>URL</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
          <label className="field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Library, campus, home…" /></label>
        </div>
        {parseTags(tags).length ? <div className="task-tag-list">{parseTags(tags).map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
        {knownTags.length ? <div className="task-known-tags"><span>Known tags</span><div>{knownTags.filter((tag)=>!tag.archived).slice(0,18).map((tag)=>{const selected=parseTags(tags).some((value)=>value.toLowerCase()===tag.name.toLowerCase());return <button type="button" className={selected?'is-selected':''} key={tag.id} onClick={()=>{const current=parseTags(tags);const next=selected?current.filter((value)=>value.toLowerCase()!==tag.name.toLowerCase()):[...current,tag.name];setTags(next.join(', '))}}>{'#'+tag.name}</button>})}</div></div>:null}
      </section>

      <section className="task-v2-progress-section">
        <div className="task-section-head"><div><div className="eyebrow">Progress</div><span>{visibleProgress}% complete</span></div></div>
        <div className="task-progress-bar" aria-label={'Task progress ' + visibleProgress + '%'}><span style={{ width: visibleProgress + '%' }} /></div>
        <div className="task-progress-controls">
          <label><input type="radio" name="progress-mode" checked={progressMode === 'auto'} onChange={() => setProgressMode('auto')} /> Auto from checklist and nested tasks</label>
          <label><input type="radio" name="progress-mode" checked={progressMode === 'manual'} onChange={() => setProgressMode('manual')} /> Manual</label>
        </div>
        {progressMode === 'manual' ? <label className="field"><span>Manual progress</span><input type="range" min="0" max="100" step="5" value={progressPercent} onChange={(event) => setProgressPercent(Number(event.target.value))} /></label> : null}
      </section>

      <section className="task-v2-checklist-section">
        <div className="task-section-head"><div><div className="eyebrow">Checklist</div><span>{checklist.filter((item) => item.completed).length} / {checklist.length} complete</span></div></div>
        <div className="task-checklist">
          {checklist.map((item) => (
            <div className="task-checklist-row" key={item.id}>
              <input type="checkbox" checked={item.completed} onChange={() => toggleChecklistItem(item.id)} aria-label={'Toggle checklist item ' + item.text} />
              <input className={item.completed ? 'is-completed' : ''} value={item.text} onChange={(event) => updateChecklistText(item.id, event.target.value)} />
              <button type="button" aria-label={'Remove checklist item ' + item.text} onClick={() => setChecklist((items) => items.filter((entry) => entry.id !== item.id))}>×</button>
            </div>
          ))}
        </div>
        <form className="subtask-add" onSubmit={addChecklistItem}>
          <input value={checklistTitle} onChange={(event) => setChecklistTitle(event.target.value)} placeholder="Add checklist item…" />
          <Button type="submit" disabled={!checklistTitle.trim()}>Add</Button>
        </form>
      </section>

      {task.status !== 'inbox' && !task.parentTaskId ? <section className="task-dependency-section">
        <div className="task-section-head"><div><div className="eyebrow">Dependencies</div><span>{task.activeBlockerCount ? 'Blocked by ' + task.activeBlockerCount + ' unfinished prerequisite' + (task.activeBlockerCount === 1 ? '' : 's') : blockedByTaskIds.length ? 'All prerequisites complete' : 'No prerequisites'}</span></div></div>
        {task.blockedByTitles?.length ? <div className="dependency-warning"><strong>Not ready yet</strong><span>{task.blockedByTitles.join(' · ')}</span></div> : null}
        <details className="dependency-picker">
          <summary>{blockedByTaskIds.length ? blockedByTaskIds.length + ' prerequisite' + (blockedByTaskIds.length === 1 ? '' : 's') + ' selected' : 'Add prerequisite'}</summary>
          <div className="dependency-options">
            {dependencyCandidates.filter((candidate) => candidate.id !== task.id && !candidate.parentTaskId && candidate.status !== 'cancelled' && candidate.status !== 'inbox').map((candidate) => <label key={candidate.id}><input type="checkbox" checked={blockedByTaskIds.includes(candidate.id)} onChange={() => setBlockedByTaskIds((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span><strong>{candidate.title}</strong><small>{candidate.completed ? 'Completed' : candidate.project ?? 'No project'}</small></span></label>)}
            {!dependencyCandidates.some((candidate) => candidate.id !== task.id && !candidate.parentTaskId && candidate.status !== 'cancelled' && candidate.status !== 'inbox') ? <div className="empty-state">No other tasks are available as prerequisites.</div> : null}
          </div>
        </details>
      </section> : null}

      <TaskReminderSection task={task} />

      <section className="task-execution-section">
        <div className="task-section-head"><div><div className="eyebrow">Execution</div><span>Tracked across focus sessions</span></div>{task.status === 'todo' ? <Button variant="primary" disabled={Boolean(task.activeBlockerCount)} onClick={() => onFocus(task.id)}>{task.activeBlockerCount ? 'Blocked' : 'Start focus'}</Button> : null}</div>
        <div className="task-execution-metrics">
          <div><span>Focused</span><strong>{formatFocusMinutes(focusSeconds)}</strong></div>
          <div><span>Estimate</span><strong>{task.durationMinutes ? task.durationMinutes + 'm' : '—'}</strong></div>
          <div><span>{task.durationMinutes && focusSeconds / 60 > task.durationMinutes ? 'Over estimate' : 'Estimated remaining'}</span><strong>{task.durationMinutes ? formatEstimateDelta(task.durationMinutes, focusSeconds) : '—'}</strong></div>
        </div>
      </section>

      <section className="subtask-section">
        <div className="task-section-head"><div><div className="eyebrow">Nested tasks</div><span>{subtasks.filter((item) => item.completed).length} / {subtasks.length} complete · unlimited depth</span></div></div>
        <div className="subtask-list">
          {subtasks.map((subtask) => (
            <div className="subtask-row" key={subtask.id}>
              <button className={'task-check ' + (subtask.completed ? 'task-check--done' : '')} aria-label={subtask.completed ? 'Reopen ' + subtask.title : 'Complete ' + subtask.title} onClick={() => onToggleSubtask(subtask.id)} />
              <button type="button" className={'subtask-open ' + (subtask.completed ? 'is-completed' : '')} onClick={() => onOpenSubtask(subtask.id)}><span>{subtask.title}</span>{subtask.subtaskTotal ? <small>{subtask.subtaskCompleted}/{subtask.subtaskTotal} children</small> : null}</button>
              <button className="subtask-remove" aria-label={'Remove ' + subtask.title} onClick={() => onDeleteSubtask(subtask.id)}>×</button>
            </div>
          ))}
          {!subtasks.length ? <div className="subtask-empty">Break larger work down to any depth when it helps execution.</div> : null}
        </div>
        <form className="subtask-add" onSubmit={addSubtask}>
          <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Add a nested task…" />
          <Button type="submit" disabled={!subtaskTitle.trim()}>Add</Button>
        </form>
      </section>

      <section className="task-v2-comments-section">
        <div className="task-section-head"><div><div className="eyebrow">Comments</div><span>{comments.length ? comments.length + ' note' + (comments.length === 1 ? '' : 's') : 'Lightweight decision log'}</span></div></div>
        <div className="task-comment-list">
          {comments.map((comment) => <article key={comment.id}><p>{comment.body}</p><footer><span>{formatTimestampDetailed(comment.createdAt)}</span><button type="button" onClick={() => setComments((items) => items.filter((item) => item.id !== comment.id))}>Delete</button></footer></article>)}
        </div>
        <form className="task-comment-add" onSubmit={addComment}>
          <textarea rows={3} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Add context, a decision, or a handoff note…" />
          <Button type="submit" disabled={!commentBody.trim()}>Add comment</Button>
        </form>
      </section>

      <section className="task-v2-activity-section">
        <div className="task-section-head"><div><div className="eyebrow">Activity</div><span>Latest lifecycle events</span></div></div>
        <div className="task-activity-list">
          {(task.activity ?? []).slice(-8).reverse().map((entry) => <div key={entry.id}><span>{entry.label}</span><time>{formatTimestampDetailed(entry.at)}</time></div>)}
          {!task.activity?.length ? <div className="subtask-empty">No activity recorded yet.</div> : null}
        </div>
      </section>

      <section className="task-history-strip">
        <div><span>Rescheduled</span><strong>{task.rescheduleCount}×</strong></div>
        <div><span>Created</span><strong>{formatTimestamp(task.createdAt)}</strong></div>
        <div><span>Updated</span><strong>{formatTimestamp(task.updatedAt)}</strong></div>
      </section>

      {error ? <div className="form-error">{error}</div> : null}
      <div className="task-save-row task-save-row--scoped">
        {series ? <label className="task-save-scope"><span>Apply content changes to</span><select value={saveScope} onChange={(event) => setSaveScope(event.target.value as SaveScope)}><option value="this">This occurrence</option><option value="future">This and future</option><option value="entire">Entire series</option></select></label> : null}
        <div className="task-save-actions"><Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</Button><span>⌘/Ctrl + Enter</span></div>
      </div>

      <div className="task-danger-actions">
        <Button onClick={() => onToggle(task.id)}>{task.completed ? 'Reopen' : 'Complete'}</Button>
        <Button onClick={() => onDuplicate(task.id)}>Duplicate tree</Button>
        <Button onClick={() => onDelete(task.id)}>Move to trash</Button>
      </div>
    </div>
  )
}

function formatFocusMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm'
}

function formatEstimateDelta(estimateMinutes: number, focusSeconds: number) {
  const actual = Math.round(focusSeconds / 60)
  const delta = estimateMinutes - actual
  return delta >= 0 ? delta + 'm' : '+' + Math.abs(delta) + 'm'
}

function formatTimestamp(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatTimestampDetailed(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
