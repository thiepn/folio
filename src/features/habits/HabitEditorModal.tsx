import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { HabitEntity, HabitGroupEntity, HabitKind, HabitScheduleType } from '../../domain/models'
import type { HabitCreateInput, HabitUpdateInput } from '../../repositories/habitRepository'

const DAYS = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' }, { value: 0, label: 'S' },
]

export function HabitEditorModal({ open, habit, groups, onClose, onCreate, onUpdate }: {
  open: boolean
  habit?: HabitEntity | null
  groups: HabitGroupEntity[]
  onClose: () => void
  onCreate: (input: HabitCreateInput) => Promise<void>
  onUpdate: (id: string, input: HabitUpdateInput) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<HabitKind>('check')
  const [target, setTarget] = useState(20)
  const [unit, setUnit] = useState('units')
  const [color, setColor] = useState('#4169FF')
  const [groupId, setGroupId] = useState('')
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>('daily')
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5])
  const [timesPerWeek, setTimesPerWeek] = useState(3)
  const [timesPerMonth, setTimesPerMonth] = useState(8)
  const [countsCapacity, setCountsCapacity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(habit?.title ?? '')
    setDescription(habit?.description ?? '')
    setKind(habit?.kind ?? 'check')
    setTarget(habit?.kind === 'check' ? 20 : habit?.target ?? 20)
    setUnit(habit?.unit ?? 'units')
    setColor(habit?.color ?? '#4169FF')
    setGroupId(habit?.groupId ?? '')
    setScheduleType(habit?.schedule.type ?? 'daily')
    setWeekdays(habit?.schedule.weekdays ?? [1, 3, 5])
    setTimesPerWeek(habit?.schedule.timesPerWeek ?? 3)
    setTimesPerMonth(habit?.schedule.timesPerMonth ?? 8)
    setCountsCapacity(habit?.countsTowardCapacity ?? false)
    setError('')
  }, [open, habit])

  function toggleDay(day: number) { setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    if (scheduleType === 'selected-days' && weekdays.length === 0) { setError('Choose at least one weekday.'); return }
    if (kind === 'quantity' && !unit.trim()) { setError('Quantity habits need a unit such as pages, glasses, or reps.'); return }
    setSaving(true); setError('')
    const schedule = scheduleType === 'selected-days'
      ? { type: scheduleType, weekdays }
      : scheduleType === 'times-per-week'
        ? { type: scheduleType, timesPerWeek }
        : scheduleType === 'times-per-month'
          ? { type: scheduleType, timesPerMonth }
          : { type: scheduleType }
    const input = {
      title: title.trim(), description, kind,
      target: kind === 'check' ? 1 : Math.max(1, Math.round(target)),
      unit: kind === 'quantity' ? unit.trim() : undefined,
      color,
      groupId: groupId || undefined,
      schedule,
      countsTowardCapacity: kind === 'duration' ? countsCapacity : false,
    } satisfies HabitCreateInput
    try {
      if (habit) await onUpdate(habit.id, input)
      else await onCreate(input)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The habit could not be saved.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || !title.trim()} onClick={() => document.getElementById('habit-editor-submit')?.click()}>{saving ? 'Saving…' : habit ? 'Save habit' : 'Create habit'}</Button></>}>
      <form className="form-stack habit-editor habit-editor--v2" onSubmit={submit}>
        <label className="field"><span>Name</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="French practice" /></label>
        <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context or definition of done." /></label>
        <div className="form-grid">
          <label className="field"><span>Tracking</span><select value={kind} onChange={(event) => setKind(event.target.value as HabitKind)}><option value="check">Check once</option><option value="quantity">Quantity</option><option value="duration">Duration</option></select></label>
          {kind !== 'check' ? <label className="field"><span>{kind === 'duration' ? 'Target minutes' : 'Target quantity'}</span><div className="field-with-suffix"><input type="number" min="1" max="100000" value={target} onChange={(event) => setTarget(Number(event.target.value))} /><em>{kind === 'duration' ? 'min' : unit || 'units'}</em></div></label> : <div />}
        </div>
        {kind === 'quantity' ? <label className="field"><span>Unit</span><input value={unit} maxLength={40} onChange={(event) => setUnit(event.target.value)} placeholder="pages, glasses, reps…" /></label> : null}
        <div className="form-grid">
          <label className="field"><span>Group</span><select value={groupId} onChange={(event)=>setGroupId(event.target.value)}><option value="">Ungrouped</option>{groups.map((group)=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label className="field habit-color-field"><span>Color</span><input type="color" value={color} onChange={(event)=>setColor(event.target.value)} /></label>
        </div>
        <label className="field"><span>Schedule</span><select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as HabitScheduleType)}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="selected-days">Selected weekdays</option><option value="times-per-week">Flexible times per week</option><option value="times-per-month">Flexible times per month</option></select></label>
        {scheduleType === 'selected-days' ? <div className="field"><span>Days</span><div className="weekday-picker">{DAYS.map((day, index) => <button type="button" key={`${day.value}-${index}`} className={weekdays.includes(day.value) ? 'is-active' : ''} onClick={() => toggleDay(day.value)}>{day.label}</button>)}</div></div> : null}
        {scheduleType === 'times-per-week' ? <label className="field"><span>Weekly frequency</span><div className="field-with-suffix"><input type="number" min="1" max="7" value={timesPerWeek} onChange={(event) => setTimesPerWeek(Math.min(7, Math.max(1, Number(event.target.value))))} /><em>times</em></div><small className="field-help">Flexible habits can be completed on any day. Reminder prompt days are configured separately.</small></label> : null}
        {scheduleType === 'times-per-month' ? <label className="field"><span>Monthly frequency</span><div className="field-with-suffix"><input type="number" min="1" max="31" value={timesPerMonth} onChange={(event) => setTimesPerMonth(Math.min(31, Math.max(1, Number(event.target.value))))} /><em>times</em></div><small className="field-help">Monthly frequency goals are evaluated across calendar months and remain neutral during pauses.</small></label> : null}
        {kind === 'duration' ? <label className="check-field"><input type="checkbox" checked={countsCapacity} onChange={(event) => setCountsCapacity(event.target.checked)} /><span>Count remaining minutes toward daily capacity</span></label> : null}
        {error ? <div className="form-error">{error}</div> : null}
        <button id="habit-editor-submit" type="submit" hidden />
      </form>
    </Modal>
  )
}
