import { useEffect, useMemo, useRef, useState } from 'react'
import { addLocalDays, localDateKey } from '../../domain/date'
import type { ProjectSummary } from '../../repositories/projectRepository'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { CaptureCreateRequest } from '../../services/captureService'
import {
  CAPTURE_SYNTAX_EXAMPLES,
  parseQuickCapture,
  parseQuickCaptureBatch,
  type ParsedCapture,
  type ParsedRecurrence,
  type ParsedReminder,
} from './parser'

function requestFromParsed(parsed: ParsedCapture, description = ''): CaptureCreateRequest {
  return {
    input: {
      title: parsed.title,
      description,
      projectId: parsed.status === 'inbox' ? undefined : parsed.projectId,
      priority: parsed.priority,
      status: parsed.status,
      plannedDate: parsed.status === 'todo' ? parsed.plannedDate : undefined,
      deadline: parsed.deadline,
      estimatedMinutes: parsed.estimatedMinutes,
      tags: parsed.tags,
    },
    schedule: parsed.status === 'todo' && parsed.plannedDate && parsed.startMinute !== undefined
      ? { date: parsed.plannedDate, startMinute: parsed.startMinute, durationMinutes: parsed.estimatedMinutes }
      : undefined,
    recurrence: parsed.status === 'todo' ? parsed.recurrence : undefined,
    reminders: parsed.status === 'todo' ? parsed.reminders : [],
  }
}

export function QuickAddModal({ open, projects, defaultStatus = 'todo', defaultProjectId = '', defaultPlannedDate, onClose, onCreate, onCreateBatch, onImport }: {
  open: boolean
  projects: ProjectSummary[]
  defaultStatus?: 'todo' | 'inbox'
  defaultProjectId?: string
  defaultPlannedDate?: string
  onClose: () => void
  onCreate: (request: CaptureCreateRequest) => Promise<void>
  onCreateBatch: (requests: CaptureCreateRequest[]) => Promise<void>
  onImport?: () => void
}) {
  const today = localDateKey()
  const captureRef = useRef<HTMLTextAreaElement>(null)
  const [capture, setCapture] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal')
  const [status, setStatus] = useState<'todo' | 'inbox'>(defaultStatus)
  const initialPlannedDate = defaultPlannedDate ?? today
  const [plannedDate, setPlannedDate] = useState(initialPlannedDate)
  const [deadline, setDeadline] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState(30)
  const [startMinute, setStartMinute] = useState<number | undefined>(undefined)
  const [tagsText, setTagsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const defaults = useMemo(() => ({
    status: defaultStatus,
    projectId: defaultProjectId,
    plannedDate: initialPlannedDate,
    estimatedMinutes: 30,
    priority: 'normal' as const,
    today,
  }), [defaultStatus, defaultProjectId, initialPlannedDate, today])

  const lineBreak = String.fromCharCode(10)
  const carriageReturn = String.fromCharCode(13)
  const firstLine = capture.includes(lineBreak)
    ? capture.slice(0, capture.indexOf(lineBreak)).split(carriageReturn).join('')
    : capture
  const parsed = useMemo(() => parseQuickCapture(firstLine, projects, defaults), [firstLine, projects, defaults])
  const batch = useMemo(() => parseQuickCaptureBatch(capture, projects, defaults), [capture, projects, defaults])
  const batchMode = batch.length > 1

  useEffect(() => {
    if (!open) return
    setCapture('')
    setDetailsOpen(false)
    setHelpOpen(false)
    setDescription('')
    setError('')
    setStatus(defaultStatus)
    setProjectId(defaultProjectId)
    setPriority('normal')
    setPlannedDate(initialPlannedDate)
    setDeadline('')
    setEstimatedMinutes(30)
    setStartMinute(undefined)
    setTagsText('')
    setTitle('')
    requestAnimationFrame(() => captureRef.current?.focus())
  }, [open, defaultStatus, defaultProjectId, initialPlannedDate])

  useEffect(() => {
    if (!open || batchMode) return
    setTitle(parsed.title)
    setStatus(parsed.status)
    setProjectId(parsed.projectId ?? '')
    setPriority(parsed.priority)
    setPlannedDate(parsed.plannedDate ?? initialPlannedDate)
    setDeadline(parsed.deadline ?? '')
    setEstimatedMinutes(parsed.estimatedMinutes)
    setStartMinute(parsed.startMinute)
    setTagsText(parsed.tags.join(', '))
  }, [capture, open, batchMode]) // Parser rehydrates details only when capture changes.

  function currentSingleRequest(): CaptureCreateRequest {
    const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 50)
    return {
      input: {
        title: title.trim(),
        description,
        projectId: status === 'inbox' ? undefined : (projectId || undefined),
        priority,
        status,
        plannedDate: status === 'todo' && plannedDate ? plannedDate : undefined,
        deadline: deadline || undefined,
        estimatedMinutes,
        tags,
      },
      schedule: status === 'todo' && plannedDate && startMinute !== undefined
        ? { date: plannedDate, startMinute, durationMinutes: estimatedMinutes }
        : undefined,
      recurrence: status === 'todo' ? parsed.recurrence : undefined,
      reminders: status === 'todo' ? parsed.reminders : [],
    }
  }

  async function create(closeAfter: boolean) {
    if (saving) return
    if (batchMode) {
      const valid = batch.filter((item) => item.title.trim())
      if (!valid.length) return
      setSaving(true)
      setError('')
      try {
        await onCreateBatch(valid.map((item) => requestFromParsed(item)))
        if (closeAfter) onClose()
        else {
          setCapture('')
          setDetailsOpen(false)
          requestAnimationFrame(() => captureRef.current?.focus())
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The task list could not be created.')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onCreate(currentSingleRequest())
      if (closeAfter) onClose()
      else {
        setCapture('')
        setDescription('')
        setDetailsOpen(false)
        requestAnimationFrame(() => captureRef.current?.focus())
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The task could not be created.')
    } finally {
      setSaving(false)
    }
  }

  function onCaptureKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return
    event.preventDefault()
    void create(!(event.ctrlKey || event.metaKey))
  }

  const canCreate = batchMode ? batch.some((item) => item.title.trim()) : Boolean(title.trim())
  const addLabel = batchMode ? `Add ${batch.filter((item) => item.title.trim()).length} tasks` : 'Add task'

  return (
    <Modal
      open={open}
      title="Quick add"
      onClose={onClose}
      footer={<>
        <span className="quick-add-footer-hint"><kbd>Enter</kbd> add · <kbd>Shift ↵</kbd> new line · <kbd>Ctrl ↵</kbd> keep adding</span>
        {onImport ? <button type="button" className="text-action quick-import-action" onClick={onImport}>Import plan</button> : null}
        <Button disabled={saving || !canCreate} onClick={() => void create(false)}>Add & continue</Button>
        <Button variant="primary" disabled={saving || !canCreate} onClick={() => void create(true)}>{saving ? 'Saving…' : addLabel}</Button>
      </>}
    >
      <div className="quick-add quick-add--v2">
        <div className="quick-capture-block">
          <label className="quick-capture-label" htmlFor="quick-capture-input">Capture</label>
          <textarea
            ref={captureRef}
            id="quick-capture-input"
            className="quick-capture-input quick-capture-input--v2"
            rows={batchMode ? Math.min(8, Math.max(3, batch.length)) : 2}
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={onCaptureKeyDown}
            placeholder="Finish Analysis sheet tomorrow at 2pm for 90m p1 ~Analysis #exam remind 30m before"
            autoComplete="off"
            spellCheck
          />
          <div className="quick-capture-actions">
            {!batchMode ? <button type="button" className="text-action" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Hide details' : 'Details'}</button> : <span className="capture-batch-label">{batch.length} lines detected</span>}
            <button type="button" className="text-action" onClick={() => setHelpOpen((value) => !value)}>{helpOpen ? 'Hide syntax' : 'Syntax'}</button>
          </div>
        </div>

        {capture.trim() ? (batchMode ? <BatchLedger items={batch} /> : <ParseLedger parsed={parsed} />) : <div className="capture-intro">
          <span className="capture-intro__mark" />
          <p>Write naturally. Folio recognizes dates, times, duration, priority, project, tags, recurrence and reminders locally. Paste multiple lines to capture a list.</p>
        </div>}

        {helpOpen ? <div className="capture-syntax">
          <div className="section-label">Natural capture + power syntax</div>
          <div className="capture-syntax-grid">
            {CAPTURE_SYNTAX_EXAMPLES.map((item) => <div key={item.syntax}><code>{item.syntax}</code><span>{item.meaning}</span></div>)}
          </div>
          <p><code>~Project</code> is the preferred project selector. Legacy <code>#Project</code> still selects a uniquely matching project; other <code>#words</code> become task tags. Ambiguous project matches are warned rather than guessed.</p>
        </div> : null}

        {detailsOpen && !batchMode ? <div className="quick-details">
          <div className="section-label">Structured details</div>
          <div className="form-stack">
            <label className="field"><span>Task</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" /></label>
            <label className="field"><span>Notes</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context, links or instructions" /></label>
            <div className="form-grid">
              <label className="field"><span>Type</span><select value={status} onChange={(event) => setStatus(event.target.value as 'todo' | 'inbox')}><option value="todo">To-do</option><option value="inbox">Inbox capture</option></select></label>
              <label className="field"><span>Project</span><select value={projectId} disabled={status === 'inbox'} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            </div>
            <label className="field"><span>Tags</span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="exam, deep-work" /></label>
            <div className="form-grid">
              <label className="field"><span>Planned day</span><input type="date" disabled={status === 'inbox'} value={plannedDate} min={addLocalDays(today, -365)} onChange={(event) => setPlannedDate(event.target.value)} /></label>
              <label className="field"><span>Hard deadline</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Estimate</span><select value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(Number(event.target.value))}>{[10,15,20,30,45,60,90,120,180,240].map((value) => <option key={value} value={value}>{formatMinutes(value)}</option>)}</select></label>
              <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Exact start</span><input type="time" step="300" disabled={status === 'inbox'} value={startMinute === undefined ? '' : minuteToTime(startMinute)} onChange={(event) => setStartMinute(event.target.value ? timeToMinute(event.target.value) : undefined)} /></label>
              <div className="field"><span>Scheduling</span><div className="quick-time-note">{startMinute === undefined ? 'No clock block' : `${minuteToTime(startMinute)} · ${formatMinutes(estimatedMinutes)} block`}</div></div>
            </div>
            <div className="form-grid">
              <div className="field"><span>Repeat</span><div className="quick-time-note">{parsed.recurrence ? formatRecurrence(parsed.recurrence) : 'Does not repeat'}</div></div>
              <div className="field"><span>Reminders</span><div className="quick-time-note">{parsed.reminders.length ? parsed.reminders.map(formatReminder).join(' · ') : 'None'}</div></div>
            </div>
          </div>
        </div> : null}

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </Modal>
  )
}

function BatchLedger({ items }: { items: ParsedCapture[] }) {
  const warnings = items.reduce((sum, item) => sum + item.warnings.length, 0)
  return <div className="capture-batch-preview">
    <div className="capture-batch-preview__head"><div><span className="eyebrow">Multi-task capture</span><strong>{items.length} tasks</strong></div><span>{warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : 'Ready'}</span></div>
    <div className="capture-batch-preview__list">
      {items.map((item, index) => <div className="capture-batch-row" key={`${index}-${item.raw}`}>
        <span>{index + 1}</span>
        <div><strong>{item.title || 'Untitled task'}</strong><small>{[
          item.status === 'inbox' ? 'Inbox' : formatDate(item.plannedDate),
          item.projectName,
          item.tags.length ? item.tags.map((tag) => `#${tag}`).join(' ') : undefined,
          item.recurrence ? formatRecurrence(item.recurrence) : undefined,
          item.reminders.length ? `${item.reminders.length} reminder${item.reminders.length === 1 ? '' : 's'}` : undefined,
        ].filter(Boolean).join(' · ')}</small></div>
        {item.warnings.length ? <b title={item.warnings.map((warning) => warning.message).join('\n')}>!</b> : null}
      </div>)}
    </div>
  </div>
}

function ParseLedger({ parsed }: { parsed: ParsedCapture }) {
  return <div className="parse-ledger" aria-live="polite">
    <div className="parse-ledger__title"><span>Interpreted as</span><strong>{parsed.title || 'Untitled task'}</strong></div>
    <div className="parse-ledger__fields">
      <LedgerItem label="Type" value={parsed.status === 'inbox' ? 'Inbox' : 'To-do'} />
      <LedgerItem label="Plan" value={parsed.status === 'inbox' ? 'Unplanned' : formatDate(parsed.plannedDate)} />
      <LedgerItem label="Estimate" value={formatMinutes(parsed.estimatedMinutes)} />
      <LedgerItem label="Time" value={parsed.startMinute === undefined ? 'None' : minuteToTime(parsed.startMinute)} />
      <LedgerItem label="Priority" value={capitalize(parsed.priority)} tone={parsed.priority === 'critical' ? 'danger' : parsed.priority === 'high' ? 'accent' : undefined} />
      <LedgerItem label="Project" value={parsed.projectName ?? 'No project'} />
      <LedgerItem label="Tags" value={parsed.tags.length ? parsed.tags.map((tag) => `#${tag}`).join(' ') : 'None'} />
      <LedgerItem label="Deadline" value={parsed.deadline ? formatDate(parsed.deadline) : 'None'} />
      <LedgerItem label="Repeat" value={parsed.recurrence ? formatRecurrence(parsed.recurrence) : 'None'} />
      <LedgerItem label="Reminders" value={parsed.reminders.length ? String(parsed.reminders.length) : 'None'} />
    </div>
    {parsed.recognized.length ? <div className="recognized-tokens">
      {parsed.recognized.map((token, index) => <div className="recognized-token" key={`${token.kind}-${token.source}-${index}`}><code>{token.source}</code><span>{token.label}</span></div>)}
    </div> : null}
    {parsed.warnings.length ? <div className="capture-warnings">
      {parsed.warnings.map((warning) => <div key={`${warning.code}-${warning.message}`}><span>!</span><p>{warning.message}</p></div>)}
    </div> : null}
  </div>
}

function LedgerItem({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'danger' }) {
  return <div className="parse-ledger__field"><span>{label}</span><strong className={tone ? `is-${tone}` : undefined}>{value}</strong></div>
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}
function formatDate(date?: string) {
  if (!date) return 'None'
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day, 12))
}
function timeToMinute(value: string) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }
function minuteToTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
function formatRecurrence(value: ParsedRecurrence) {
  if (value.frequency === 'after-completion') return `Every ${value.interval} ${value.afterCompletionUnit ?? 'day'}${value.interval === 1 ? '' : 's'} after completion`
  if (value.frequency === 'daily') return value.interval === 1 ? 'Daily' : `Every ${value.interval} days`
  if (value.frequency === 'weekly') { const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return `${value.interval === 1 ? 'Weekly' : `Every ${value.interval} weeks`}${value.weekdays?.length ? ` · ${value.weekdays.map((day)=>labels[day]).join(', ')}` : ''}` }
  if (value.frequency === 'monthly') {
    const base = value.interval === 1 ? 'Monthly' : `Every ${value.interval} months`
    if (value.monthlyMode === 'last-day') return `${base} · last day`
    if (value.monthlyMode === 'ordinal-weekday') return `${base} · ${value.ordinal === -1 ? 'last' : value.ordinal} weekday`
    return value.monthDays?.length ? `${base} · day ${value.monthDays.join(', ')}` : base
  }
  return value.interval === 1 ? 'Yearly' : `Every ${value.interval} years`
}
function formatReminder(value: ParsedReminder) {
  if (value.kind === 'absolute') return `${formatDate(value.date)} ${value.minuteOfDay === undefined ? '' : minuteToTime(value.minuteOfDay)}`.trim()
  if (value.kind === 'time-block') return `${Math.abs(value.offsetMinutes ?? 0)}m before start`
  return value.taskDateField === 'deadline'
    ? `${Math.abs(value.dayOffset ?? 0)}d before deadline · ${minuteToTime(value.minuteOfDay ?? 540)}`
    : `planned day · ${minuteToTime(value.minuteOfDay ?? 540)}`
}
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
