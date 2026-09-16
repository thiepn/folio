import { useEffect, useMemo, useRef, useState } from 'react'
import { addLocalDays, localDateKey } from '../../domain/date'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskCreateInput } from '../../repositories/taskRepository'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { CAPTURE_SYNTAX_EXAMPLES, parseQuickCapture, type ParsedRecurrence } from './parser'

export function QuickAddModal({ open, projects, defaultStatus = 'todo', defaultProjectId = '', defaultPlannedDate, onClose, onCreate, onImport }: {
  open: boolean
  projects: ProjectSummary[]
  defaultStatus?: 'todo' | 'inbox'
  defaultProjectId?: string
  defaultPlannedDate?: string
  onClose: () => void
  onCreate: (input: TaskCreateInput, schedule?: { date: string; startMinute: number; durationMinutes: number }, recurrence?: ParsedRecurrence) => Promise<void>
  onImport?: () => void
}) {
  const today = localDateKey()
  const captureRef = useRef<HTMLInputElement>(null)
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const parsed = useMemo(() => parseQuickCapture(capture, projects, {
    status: defaultStatus,
    projectId: defaultProjectId,
    plannedDate: initialPlannedDate,
    estimatedMinutes: 30,
    priority: 'normal',
    today,
  }), [capture, projects, defaultStatus, defaultProjectId, initialPlannedDate, today])

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
    setTitle('')
    requestAnimationFrame(() => captureRef.current?.focus())
  }, [open, defaultStatus, defaultProjectId, initialPlannedDate, today])

  useEffect(() => {
    if (!open) return
    setTitle(parsed.title)
    setStatus(parsed.status)
    setProjectId(parsed.projectId ?? '')
    setPriority(parsed.priority)
    setPlannedDate(parsed.plannedDate ?? initialPlannedDate)
    setDeadline(parsed.deadline ?? '')
    setEstimatedMinutes(parsed.estimatedMinutes)
    setStartMinute(parsed.startMinute)
  }, [capture, open]) // Parser intentionally rehydrates fields only when the capture line changes.

  async function create(closeAfter: boolean) {
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onCreate({
        title: title.trim(),
        description,
        projectId: status === 'inbox' ? undefined : (projectId || undefined),
        priority,
        status,
        plannedDate: status === 'todo' && plannedDate ? plannedDate : undefined,
        deadline: deadline || undefined,
        estimatedMinutes,
      }, status === 'todo' && plannedDate && startMinute !== undefined ? { date: plannedDate, startMinute, durationMinutes: estimatedMinutes } : undefined, status === 'todo' ? parsed.recurrence : undefined)
      if (closeAfter) {
        onClose()
      } else {
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

  function onCaptureKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    void create(!(event.ctrlKey || event.metaKey))
  }

  return (
    <Modal
      open={open}
      title="Quick add"
      onClose={onClose}
      footer={<>
        <span className="quick-add-footer-hint"><kbd>Enter</kbd> add · <kbd>Ctrl ↵</kbd> keep adding</span>
        {onImport ? <button type="button" className="text-action quick-import-action" onClick={onImport}>Import plan</button> : null}
        <Button disabled={saving || !title.trim()} onClick={() => void create(false)}>Add & continue</Button>
        <Button variant="primary" disabled={saving || !title.trim()} onClick={() => void create(true)}>{saving ? 'Saving…' : 'Add task'}</Button>
      </>}
    >
      <div className="quick-add">
        <div className="quick-capture-block">
          <label className="quick-capture-label" htmlFor="quick-capture-input">Capture</label>
          <input
            ref={captureRef}
            id="quick-capture-input"
            className="quick-capture-input"
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={onCaptureKeyDown}
            placeholder="Finish Analysis sheet tomorrow 90m !high #Analysis"
            autoComplete="off"
            spellCheck
          />
          <div className="quick-capture-actions">
            <button type="button" className="text-action" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Hide details' : 'Details'}</button>
            <button type="button" className="text-action" onClick={() => setHelpOpen((value) => !value)}>{helpOpen ? 'Hide syntax' : 'Syntax'}</button>
          </div>
        </div>

        {capture.trim() ? <ParseLedger parsed={parsed} /> : <div className="capture-intro">
          <span className="capture-intro__mark" />
          <p>Type the task naturally, then add only the small structured hints you need. Nothing is sent to a server.</p>
        </div>}

        {helpOpen ? <div className="capture-syntax">
          <div className="section-label">Capture syntax</div>
          <div className="capture-syntax-grid">
            {CAPTURE_SYNTAX_EXAMPLES.map((item) => <div key={item.syntax}><code>{item.syntax}</code><span>{item.meaning}</span></div>)}
          </div>
          <p>Project names may be abbreviated when the match is unique. Use <code>#&quot;Analysis III&quot;</code> for an exact multi-word project.</p>
        </div> : null}

        {detailsOpen ? <div className="quick-details">
          <div className="section-label">Structured details</div>
          <div className="form-stack">
            <label className="field"><span>Task</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" /></label>
            <label className="field"><span>Notes</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context, links or instructions" /></label>
            <div className="form-grid">
              <label className="field"><span>Type</span><select value={status} onChange={(event) => setStatus(event.target.value as 'todo' | 'inbox')}><option value="todo">To-do</option><option value="inbox">Inbox capture</option></select></label>
              <label className="field"><span>Project</span><select value={projectId} disabled={status === 'inbox'} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Planned day</span><input type="date" disabled={status === 'inbox'} value={plannedDate} min={addLocalDays(today, -365)} onChange={(event) => setPlannedDate(event.target.value)} /></label>
              <label className="field"><span>Hard deadline</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Estimate</span><select value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(Number(event.target.value))}>{[10,15,20,30,45,60,90,120,180].map((value) => <option key={value} value={value}>{formatMinutes(value)}</option>)}</select></label>
              <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Exact start</span><input type="time" step="900" disabled={status === 'inbox'} value={startMinute === undefined ? '' : minuteToTime(startMinute)} onChange={(event) => setStartMinute(event.target.value ? timeToMinute(event.target.value) : undefined)} /></label>
              <div className="field"><span>Scheduling</span><div className="quick-time-note">{startMinute === undefined ? 'No clock block' : `${minuteToTime(startMinute)} · ${formatMinutes(estimatedMinutes)} block`}</div></div>
            </div>
            <div className="form-grid">
              <div className="field"><span>Repeat</span><div className="quick-time-note">{parsed.recurrence ? formatRecurrence(parsed.recurrence) : 'Does not repeat'}</div></div>
              <div className="field"><span>Series end</span><div className="quick-time-note">{parsed.recurrence?.until ? `Until ${formatDate(parsed.recurrence.until)}` : parsed.recurrence?.count ? `${parsed.recurrence.count} times` : 'No end'}</div></div>
            </div>
          </div>
        </div> : null}

        {error ? <div className="form-error">{error}</div> : null}
      </div>
    </Modal>
  )
}

function ParseLedger({ parsed }: { parsed: ReturnType<typeof parseQuickCapture> }) {
  return <div className="parse-ledger" aria-live="polite">
    <div className="parse-ledger__title">
      <span>Interpreted as</span>
      <strong>{parsed.title || 'Untitled task'}</strong>
    </div>
    <div className="parse-ledger__fields">
      <LedgerItem label="Type" value={parsed.status === 'inbox' ? 'Inbox' : 'To-do'} />
      <LedgerItem label="Plan" value={parsed.status === 'inbox' ? 'Unplanned' : formatDate(parsed.plannedDate)} />
      <LedgerItem label="Estimate" value={formatMinutes(parsed.estimatedMinutes)} />
      <LedgerItem label="Time" value={parsed.startMinute === undefined ? 'None' : minuteToTime(parsed.startMinute)} />
      <LedgerItem label="Priority" value={capitalize(parsed.priority)} tone={parsed.priority === 'critical' ? 'danger' : parsed.priority === 'high' ? 'accent' : undefined} />
      <LedgerItem label="Project" value={parsed.projectName ?? 'No project'} />
      <LedgerItem label="Deadline" value={parsed.deadline ? formatDate(parsed.deadline) : 'None'} />
      <LedgerItem label="Repeat" value={parsed.recurrence ? formatRecurrence(parsed.recurrence) : 'None'} />
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
  if (value.frequency === 'after-completion') return `Every ${value.interval}d after completion`
  if (value.frequency === 'daily') return value.interval === 1 ? 'Daily' : `Every ${value.interval} days`
  if (value.frequency === 'weekly') { const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return value.weekdays?.length ? `Weekly · ${value.weekdays.map((day)=>labels[day]).join(', ')}` : (value.interval === 1 ? 'Weekly' : `Every ${value.interval} weeks`) }
  if (value.frequency === 'monthly') return value.interval === 1 ? 'Monthly' : `Every ${value.interval} months`
  return value.interval === 1 ? 'Yearly' : `Every ${value.interval} years`
}
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
