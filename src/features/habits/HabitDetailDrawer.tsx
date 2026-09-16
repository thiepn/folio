import { addLocalDays, formatLocalDate, localDateRange } from '../../domain/date'
import { habitHistoryStatus, habitScheduleLabel } from '../../domain/habit'
import type { HabitEntity, HabitEntryEntity, LocalDate } from '../../domain/models'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { HabitPreview } from '../../types/ui'

export function HabitDetailDrawer({ open, habit, preview, entries, today, onClose, onEdit, onArchive, onToggle, onIncrement, onSkip }: {
  open: boolean
  habit?: HabitEntity | null
  preview?: HabitPreview | null
  entries: HabitEntryEntity[]
  today: LocalDate
  onClose: () => void
  onEdit: () => void
  onArchive: () => void
  onToggle: () => void
  onIncrement: (minutes: number) => void
  onSkip: () => void
}) {
  if (!habit || !preview) return null
  const habitEntries = entries.filter((entry) => entry.habitId === habit.id)
  const entryMap = new Map(habitEntries.map((entry) => [entry.date, entry]))
  const dates = localDateRange(addLocalDays(today, -27), 28)
  return (
    <Drawer open={open} title={habit.title} onClose={onClose} className="habit-detail-overlay">
      <div className="habit-detail">
        <div className="habit-detail__intro">
          <div><span className="eyebrow">{habit.kind === 'duration' ? `${habit.target} min target` : 'Check habit'}</span><p>{habit.description || 'No description.'}</p></div>
          <Button onClick={onEdit}>Edit</Button>
        </div>

        <div className="habit-metrics">
          <div><strong>{preview.streak ?? 0}</strong><span>{habit.schedule.type === 'times-per-week' ? 'week streak' : 'streak'}</span></div>
          <div><strong>{preview.weeklyPercent ?? 0}%</strong><span>this week</span></div>
          <div><strong>{preview.adherence4w ?? 0}%</strong><span>4-week adherence</span></div>
        </div>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Today</span><em>{!preview.scheduledToday ? 'Not scheduled' : preview.skipped ? 'Rest day' : preview.completed ? 'Complete' : preview.flexible ? 'Flexible' : 'Open'}</em></div>
          <div className="habit-today-control">
            <div><strong>{preview.skipped ? 'Rest day — streak preserved' : habit.kind === 'duration' ? `${preview.currentValue ?? 0} / ${habit.target} min` : preview.completed ? 'Done for today' : 'Not completed yet'}</strong><span>{habitScheduleLabel(habit)} · {preview.weeklyProgress}</span></div>
            {preview.scheduledToday ? <div className="habit-action-row">
              {habit.kind === 'duration' && !preview.skipped ? <><Button onClick={() => onIncrement(5)}>+5m</Button><Button onClick={() => onIncrement(15)}>+15m</Button></> : null}
              <Button variant={preview.completed ? 'outline' : 'primary'} onClick={onToggle}>{preview.completed ? 'Reopen' : 'Complete'}</Button>
              {habit.schedule.type !== 'times-per-week' && !preview.completed ? <Button onClick={onSkip}>{preview.skipped ? 'Undo skip' : 'Skip today'}</Button> : null}
            </div> : <span className="habit-offday-note">This habit is intentionally off today. Its streak is evaluated only on scheduled days.</span>}
          </div>
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Last 4 weeks</span><em>Rest days are neutral</em></div>
          <div className="habit-history-grid" aria-label="Habit history">
            {dates.map((date) => {
              const status = habitHistoryStatus(habit, entryMap.get(date), date, today)
              return <div className={`habit-history-cell is-${status}`} title={`${formatLocalDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${status}`} key={date}><span>{Number(date.slice(-2))}</span></div>
            })}
          </div>
          <div className="habit-history-legend"><span><i className="is-complete" />Done</span><span><i className="is-skipped" />Rest</span><span><i className="is-missed" />Missed</span></div>
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Definition</span></div>
          <dl className="habit-definition">
            <div><dt>Schedule</dt><dd>{habitScheduleLabel(habit)}</dd></div>
            <div><dt>Tracking</dt><dd>{habit.kind === 'duration' ? `${habit.target} minutes` : 'Check once'}</dd></div>
            <div><dt>Capacity</dt><dd>{habit.countsTowardCapacity ? 'Remaining duration counts' : 'Does not reserve capacity'}</dd></div>
          </dl>
        </section>

        <div className="habit-detail__danger"><Button onClick={onArchive}>Archive habit</Button></div>
      </div>
    </Drawer>
  )
}
