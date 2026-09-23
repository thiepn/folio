import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import type { TaskPreview } from '../../types/ui'
import { reminderRepository } from '../../repositories/reminderRepository'
import { reminderService } from '../../services/reminderService'

type TriggerKind = 'planned' | 'deadline' | 'block-start' | 'exact'

function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
function datetimeLocalNow() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
function triggerLabel(reminder: Awaited<ReturnType<typeof reminderRepository.listForOwner>>[number]) {
  if (reminder.triggerType === 'absolute') return reminder.absoluteAt ? new Date(reminder.absoluteAt).toLocaleString() : 'Exact time'
  if (reminder.triggerType === 'time-block') {
    const minutes = Math.abs(reminder.offsetMinutes ?? 0)
    return `${minutes ? `${minutes}m ${(reminder.offsetMinutes ?? 0) < 0 ? 'before' : 'after'} ` : ''}calendar block ${reminder.blockEdge ?? 'start'}`
  }
  if (reminder.triggerType === 'task-date') {
    const days = reminder.dayOffset ?? 0
    const day = days === 0 ? 'on date' : days < 0 ? `${Math.abs(days)}d before` : `${days}d after`
    return `${reminder.taskDateField === 'deadline' ? 'Deadline' : 'Planned day'} · ${day} · ${minuteToTime(reminder.minuteOfDay ?? 540)}`
  }
  return reminder.triggerType
}

export function TaskReminderSection({ task }: { task: TaskPreview }) {
  const taskReminders = useLiveQuery(() => reminderRepository.listForOwner('task', task.id), [task.id], [])
  const seriesReminders = useLiveQuery(
    () => task.seriesId ? reminderRepository.listForOwner('series', task.seriesId) : Promise.resolve([]),
    [task.seriesId],
    [],
  )
  const reminders = useMemo(() => [...(taskReminders ?? []), ...(seriesReminders ?? [])], [taskReminders, seriesReminders])
  const [scope, setScope] = useState<'task' | 'series'>(task.seriesId ? 'task' : 'task')
  const [kind, setKind] = useState<TriggerKind>(task.deadline ? 'deadline' : 'planned')
  const [daysBefore, setDaysBefore] = useState(0)
  const [time, setTime] = useState('09:00')
  const [minutesBefore, setMinutesBefore] = useState(30)
  const [absolute, setAbsolute] = useState(datetimeLocalNow())
  const [persistent, setPersistent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!task.seriesId) setScope('task')
  }, [task.seriesId])

  async function add() {
    setError('')
    if (kind === 'planned' && !task.plannedDate) return setError('This task needs a planned date before a planned-day reminder can be anchored.')
    if (kind === 'deadline' && !task.deadline) return setError('This task needs a deadline before a deadline reminder can be anchored.')
    if (kind === 'exact' && !absolute) return setError('Choose an exact reminder time.')
    setSaving(true)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
      const ownerType = kind !== 'exact' && scope === 'series' && task.seriesId ? 'series' as const : 'task' as const
      const ownerId = ownerType === 'series' ? task.seriesId! : task.id
      if (kind === 'exact') {
        await reminderService.create({
          ownerType,
          ownerId,
          triggerType: 'absolute',
          absoluteAt: new Date(absolute).toISOString(),
          timeZone,
          persistent,
        })
      } else if (kind === 'block-start') {
        await reminderService.create({
          ownerType,
          ownerId,
          triggerType: 'time-block',
          blockEdge: 'start',
          offsetMinutes: -Math.max(0, minutesBefore),
          timeZone,
          persistent,
        })
      } else {
        await reminderService.create({
          ownerType,
          ownerId,
          triggerType: 'task-date',
          taskDateField: kind === 'deadline' ? 'deadline' : 'plannedDate',
          dayOffset: -Math.max(0, daysBefore),
          minuteOfDay: timeToMinute(time),
          timeZone,
          persistent,
        })
      }
      window.dispatchEvent(new Event('folio:reminder-refresh'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reminder could not be added.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="task-reminder-section">
      <div className="task-section-head"><div><div className="eyebrow">Reminders</div><span>{reminders.length ? `${reminders.length} configured` : 'No alerts configured'}</span></div></div>

      <div className="task-reminder-list">
        {reminders.map((reminder) => <div className="task-reminder-row" key={reminder.id}>
          <div>
            <strong>{triggerLabel(reminder)}</strong>
            <span>{reminder.ownerType === 'series' ? 'Entire recurring series' : 'This task'}{reminder.persistent ? ' · persistent' : ''}{!reminder.enabled ? ' · disabled' : ''}</span>
          </div>
          <div>
            <label className="mini-toggle"><input type="checkbox" checked={reminder.enabled} onChange={(event) => void reminderService.setEnabled(reminder.id, event.target.checked)} /><span>On</span></label>
            <button type="button" onClick={() => void reminderService.remove(reminder.id)} aria-label="Remove reminder">×</button>
          </div>
        </div>)}
      </div>

      <div className="task-reminder-builder">
        {task.seriesId && kind !== 'exact' ? <label className="field"><span>Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="task">This occurrence only</option><option value="series">Entire recurring series</option></select></label> : null}
        <label className="field"><span>Alert me</span><select value={kind} onChange={(event) => setKind(event.target.value as TriggerKind)}><option value="planned">Around planned day</option><option value="deadline">Around deadline</option><option value="block-start">Before calendar block</option><option value="exact">At exact date & time</option></select></label>

        {kind === 'planned' || kind === 'deadline' ? <div className="task-reminder-grid">
          <label className="field"><span>Days before</span><input type="number" min="0" max="3650" value={daysBefore} onChange={(event) => setDaysBefore(Number(event.target.value))} /></label>
          <label className="field"><span>Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        </div> : null}
        {kind === 'block-start' ? <label className="field"><span>Minutes before start</span><input type="number" min="0" max="43200" value={minutesBefore} onChange={(event) => setMinutesBefore(Number(event.target.value))} /></label> : null}
        {kind === 'exact' ? <label className="field"><span>Exact time</span><input type="datetime-local" value={absolute} onChange={(event) => setAbsolute(event.target.value)} /><small>An exact timestamp belongs to this occurrence only; use planned/deadline/block reminders for a recurring series.</small></label> : null}
        <label className="check-field"><input type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /><span>Keep system notification visible when supported</span></label>
        {error ? <div className="form-error">{error}</div> : null}
        <Button onClick={() => void add()} disabled={saving}>{saving ? 'Adding…' : 'Add reminder'}</Button>
      </div>
    </section>
  )
}
