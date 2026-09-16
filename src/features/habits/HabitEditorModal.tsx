import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { HabitEntity } from '../../domain/models'
import type { HabitCreateInput, HabitUpdateInput } from '../../repositories/habitRepository'

const DAYS = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' }, { value: 0, label: 'S' },
]

export function HabitEditorModal({ open, habit, onClose, onCreate, onUpdate }: {
  open: boolean
  habit?: HabitEntity | null
  onClose: () => void
  onCreate: (input: HabitCreateInput) => Promise<void>
  onUpdate: (id: string, input: HabitUpdateInput) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'check' | 'duration'>('check')
  const [target, setTarget] = useState(20)
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekdays' | 'selected-days' | 'times-per-week'>('daily')
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5])
  const [timesPerWeek, setTimesPerWeek] = useState(3)
  const [countsCapacity, setCountsCapacity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(habit?.title ?? '')
    setDescription(habit?.description ?? '')
    setKind(habit?.kind ?? 'check')
    setTarget(habit?.kind === 'duration' ? habit.target : 20)
    setScheduleType(habit?.schedule.type ?? 'daily')
    setWeekdays(habit?.schedule.weekdays ?? [1, 3, 5])
    setTimesPerWeek(habit?.schedule.timesPerWeek ?? 3)
    setCountsCapacity(habit?.countsTowardCapacity ?? false)
    setError('')
  }, [open, habit])

  function toggleDay(day: number) {
    setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    if (scheduleType === 'selected-days' && weekdays.length === 0) { setError('Choose at least one weekday.'); return }
    setSaving(true); setError('')
    const schedule = scheduleType === 'selected-days'
      ? { type: scheduleType, weekdays }
      : scheduleType === 'times-per-week'
        ? { type: scheduleType, timesPerWeek }
        : { type: scheduleType }
    const input = {
      title: title.trim(), description, kind,
      target: kind === 'check' ? 1 : Math.max(1, target),
      schedule,
      countsTowardCapacity: kind === 'duration' ? countsCapacity : false,
    } satisfies HabitCreateInput
    try {
      if (habit) await onUpdate(habit.id, input)
      else await onCreate(input)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The habit could not be saved.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || !title.trim()} onClick={() => document.getElementById('habit-editor-submit')?.click()}>{saving ? 'Saving…' : habit ? 'Save habit' : 'Create habit'}</Button></>}
    >
      <form className="form-stack habit-editor" onSubmit={submit}>
        <label className="field"><span>Name</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="French practice" /></label>
        <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context or definition of done." /></label>
        <div className="form-grid">
          <label className="field"><span>Tracking</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="check">Check once</option><option value="duration">Duration</option></select></label>
          {kind === 'duration' ? <label className="field"><span>Daily target</span><div className="field-with-suffix"><input type="number" min="1" max="1440" value={target} onChange={(event) => setTarget(Number(event.target.value))} /><em>min</em></div></label> : <div />}
        </div>
        <label className="field"><span>Schedule</span><select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as typeof scheduleType)}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="selected-days">Selected weekdays</option><option value="times-per-week">Flexible times per week</option></select></label>
        {scheduleType === 'selected-days' ? <div className="field"><span>Days</span><div className="weekday-picker">{DAYS.map((day, index) => <button type="button" key={`${day.value}-${index}`} className={weekdays.includes(day.value) ? 'is-active' : ''} onClick={() => toggleDay(day.value)}>{day.label}</button>)}</div></div> : null}
        {scheduleType === 'times-per-week' ? <label className="field"><span>Weekly target</span><div className="field-with-suffix"><input type="number" min="1" max="7" value={timesPerWeek} onChange={(event) => setTimesPerWeek(Math.min(7, Math.max(1, Number(event.target.value))))} /><em>times</em></div><small className="field-help">Flexible habits are offered during the week but do not reserve daily capacity until you start logging them that day.</small></label> : null}
        {kind === 'duration' ? <label className="check-field"><input type="checkbox" checked={countsCapacity} onChange={(event) => setCountsCapacity(event.target.checked)} /><span>Count remaining minutes toward daily capacity</span></label> : null}
        {error ? <div className="form-error">{error}</div> : null}
        <button id="habit-editor-submit" type="submit" hidden />
      </form>
    </Modal>
  )
}
