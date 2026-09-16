import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { localDateKey } from '../../domain/date'
import type { RecurrenceFrequency, RecurringSeriesEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'

export interface RecurrenceEditorValue {
  startDate: string
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: number[]
  until?: string
  count?: number
  deadlineOffsetDays?: number
  startMinute?: number
  blockDurationMinutes?: number
}

export function RecurrenceEditorModal({ open, task, series, onClose, onCreate, onUpdate }: {
  open: boolean
  task: TaskPreview | null
  series?: RecurringSeriesEntity | null
  onClose: () => void
  onCreate: (taskId: string, value: RecurrenceEditorValue) => Promise<void>
  onUpdate: (taskId: string, scope: 'future' | 'entire', value: RecurrenceEditorValue) => Promise<void>
}) {
  const [startDate, setStartDate] = useState(localDateKey())
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('daily')
  const [interval, setInterval] = useState(1)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [endMode, setEndMode] = useState<'never' | 'date' | 'count'>('never')
  const [until, setUntil] = useState('')
  const [count, setCount] = useState(10)
  const [deadlineOffset, setDeadlineOffset] = useState('')
  const [startTime, setStartTime] = useState('')
  const [blockDuration, setBlockDuration] = useState('')
  const [scope, setScope] = useState<'future' | 'entire'>('future')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !task) return
    const current = series
    setStartDate(current?.startDate ?? task.recurrenceDate ?? task.plannedDate ?? localDateKey())
    setFrequency(current?.rule.frequency ?? 'daily')
    setInterval(current?.rule.interval ?? 1)
    setWeekdays(current?.rule.weekdays ?? [])
    setEndMode(current?.rule.until ? 'date' : current?.rule.count ? 'count' : 'never')
    setUntil(current?.rule.until ?? '')
    setCount(current?.rule.count ?? 10)
    setDeadlineOffset(current?.taskTemplate.deadlineOffsetDays === undefined ? '' : String(current.taskTemplate.deadlineOffsetDays))
    setStartTime(current?.taskTemplate.startMinute === undefined ? '' : minuteToTime(current.taskTemplate.startMinute))
    setBlockDuration(current?.taskTemplate.blockDurationMinutes === undefined ? '' : String(current.taskTemplate.blockDurationMinutes))
    setScope('future')
    setError('')
  }, [open, task, series])

  const summary = useMemo(() => {
    if (frequency === 'after-completion') return `Every ${interval} day${interval === 1 ? '' : 's'} after completion`
    if (frequency === 'daily') return interval === 1 ? 'Every day' : `Every ${interval} days`
    if (frequency === 'weekly') {
      const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return `${interval === 1 ? 'Every week' : `Every ${interval} weeks`}${weekdays.length ? ` · ${weekdays.map((day) => labels[day]).join(', ')}` : ''}`
    }
    if (frequency === 'monthly') return interval === 1 ? 'Every month' : `Every ${interval} months`
    return interval === 1 ? 'Every year' : `Every ${interval} years`
  }, [frequency, interval, weekdays])

  if (!task) return null

  function toggleWeekday(day: number) {
    setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())
  }

  async function submit() {
    if (saving || !task) return
    if (frequency === 'weekly' && !weekdays.length) {
      setError('Choose at least one weekday for a weekly series.')
      return
    }
    setSaving(true); setError('')
    const value: RecurrenceEditorValue = {
      startDate,
      frequency,
      interval: Math.max(1, interval),
      weekdays: frequency === 'weekly' ? weekdays : undefined,
      until: endMode === 'date' ? until || undefined : undefined,
      count: endMode === 'count' ? Math.max(1, count) : undefined,
      deadlineOffsetDays: deadlineOffset === '' ? undefined : Math.max(0, Number(deadlineOffset)),
      startMinute: startTime ? timeToMinute(startTime) : undefined,
      blockDurationMinutes: blockDuration ? Math.max(15, Number(blockDuration)) : undefined,
    }
    try {
      if (series) await onUpdate(task.id, scope, value)
      else await onCreate(task.id, value)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The recurrence could not be saved.')
    } finally { setSaving(false) }
  }

  return <Modal open={open} title={series ? 'Edit repeat' : 'Make recurring'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Saving…' : series ? 'Apply repeat changes' : 'Create series'}</Button></>}>
    <div className="recurrence-editor">
      <div className="recurrence-summary-line"><span className="recurrence-glyph">↻</span><div><strong>{summary}</strong><span>{endMode === 'date' && until ? `Ends ${until}` : endMode === 'count' ? `${count} occurrences` : 'No automatic end'}</span></div></div>
      {series ? <label className="field"><span>Apply repeat pattern to</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="future">This and future occurrences</option><option value="entire">Entire series</option></select></label> : null}
      <div className="form-grid">
        <label className="field"><span>Starts</span><input type="date" value={startDate} disabled={Boolean(series)} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="field"><span>Repeat</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="after-completion">After completion</option></select></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>{frequency === 'after-completion' ? 'Days after completion' : 'Every'}</span><input type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(Number(event.target.value))} /></label>
        <label className="field"><span>End</span><select value={endMode} onChange={(event) => setEndMode(event.target.value as typeof endMode)}><option value="never">Never</option><option value="date">On date</option><option value="count">After count</option></select></label>
      </div>
      {frequency === 'weekly' ? <div className="field"><span>On days</span><div className="weekday-selector">{['S','M','T','W','T','F','S'].map((label, day) => <button key={day} type="button" className={weekdays.includes(day) ? 'is-active' : ''} onClick={() => toggleWeekday(day)}>{label}</button>)}</div></div> : null}
      {endMode === 'date' ? <label className="field"><span>End date</span><input type="date" value={until} min={startDate} onChange={(event) => setUntil(event.target.value)} /></label> : null}
      {endMode === 'count' ? <label className="field"><span>Occurrences</span><input type="number" min="1" max="10000" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label> : null}
      <div className="section-label">Occurrence defaults</div>
      <div className="form-grid">
        <label className="field"><span>Deadline offset</span><input type="number" min="0" placeholder="Days after occurrence" value={deadlineOffset} onChange={(event) => setDeadlineOffset(event.target.value)} /></label>
        <label className="field"><span>Exact start</span><input type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
      </div>
      <label className="field"><span>Calendar block duration</span><input type="number" min="15" max="1440" placeholder="Defaults to task estimate" value={blockDuration} onChange={(event) => setBlockDuration(event.target.value)} /></label>
      <p className="form-help">Individual occurrences remain ordinary tasks. Moving or editing one occurrence does not rewrite the series unless you explicitly choose a series scope.</p>
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  </Modal>
}

function timeToMinute(value: string) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }
function minuteToTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
