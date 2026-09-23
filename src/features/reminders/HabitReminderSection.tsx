import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import type { HabitEntity } from '../../domain/models'
import { reminderRepository } from '../../repositories/reminderRepository'
import { reminderService } from '../../services/reminderService'

function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function HabitReminderSection({ habit }: { habit: HabitEntity }) {
  const reminders = useLiveQuery(() => reminderRepository.listForOwner('habit', habit.id), [habit.id], [])
  const [time, setTime] = useState('19:00')
  const [persistent, setPersistent] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setError('')
    if (habit.schedule.type === 'times-per-week') {
      setError('Flexible times-per-week habits do not have fixed due days. Use a daily planning reminder instead.')
      return
    }
    try {
      await reminderService.create({
        ownerType: 'habit',
        ownerId: habit.id,
        triggerType: 'habit-time',
        minuteOfDay: timeToMinute(time),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
        persistent,
      })
      window.dispatchEvent(new Event('folio:reminder-refresh'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Habit reminder could not be added.')
    }
  }

  return (
    <section className="habit-detail__section habit-reminder-section">
      <div className="section-title-row"><span className="eyebrow">Reminders</span><em>{reminders?.length ?? 0} configured</em></div>
      <div className="habit-reminder-list">
        {reminders?.map((reminder) => <div key={reminder.id}>
          <div><strong>{minuteToTime(reminder.minuteOfDay ?? 1140)}</strong><span>{reminder.persistent ? 'Persistent · ' : ''}{reminder.enabled ? 'Active' : 'Disabled'}</span></div>
          <div>
            <label className="mini-toggle"><input type="checkbox" checked={reminder.enabled} onChange={(event) => void reminderService.setEnabled(reminder.id, event.target.checked)} /><span>On</span></label>
            <button type="button" aria-label="Remove habit reminder" onClick={() => void reminderService.remove(reminder.id)}>×</button>
          </div>
        </div>)}
      </div>
      <div className="habit-reminder-add">
        <label className="field"><span>Reminder time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={habit.schedule.type === 'times-per-week'} /></label>
        <label className="check-field"><input type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /><span>Persistent notification</span></label>
        <Button onClick={() => void add()} disabled={habit.schedule.type === 'times-per-week'}>Add reminder</Button>
      </div>
      {habit.schedule.type === 'times-per-week' ? <p className="phase-note">This habit has a flexible weekly target rather than scheduled days, so Folio does not invent arbitrary reminder days.</p> : null}
      {error ? <div className="form-error">{error}</div> : null}
    </section>
  )
}
