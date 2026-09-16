import { useEffect, useMemo, useState } from 'react'
import { addLocalDays, formatLocalDate, localDateRange } from '../../domain/date'
import { habitCurrentPause, habitHistoryStatus, habitPauseLabel, habitScheduleLabel, habitWeeklyTrend } from '../../domain/habit'
import type { HabitEntity, HabitEntryEntity, LocalDate } from '../../domain/models'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { HabitPreview } from '../../types/ui'

export function HabitDetailDrawer({ open, habit, preview, entries, today, onClose, onEdit, onArchive, onToggle, onIncrement, onSkip, onPause, onResume }: {
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
  onPause: (through?: LocalDate) => void
  onResume: () => void
}) {
  const [pauseThrough, setPauseThrough] = useState(addLocalDays(today, 7))
  useEffect(() => { if (open) setPauseThrough(addLocalDays(today, 7)) }, [open, today])
  if (!habit || !preview) return null
  const habitEntries = entries.filter((entry) => entry.habitId === habit.id)
  const entryMap = new Map(habitEntries.map((entry) => [entry.date, entry]))
  const dates = localDateRange(addLocalDays(today, -55), 56)
  const currentPause = habitCurrentPause(habit, today)
  const trend = useMemo(() => habitWeeklyTrend(habit, habitEntries, today, 8), [habit, habitEntries, today])
  return (
    <Drawer open={open} title={habit.title} onClose={onClose} className="habit-detail-overlay">
      <div className="habit-detail">
        <div className="habit-detail__intro">
          <div><span className="eyebrow">{habit.kind === 'duration' ? `${habit.target} min target` : 'Check habit'}</span><p>{habit.description || 'No description.'}</p></div>
          <Button onClick={onEdit}>Edit</Button>
        </div>

        <div className="habit-metrics habit-metrics--v16">
          <div><strong>{preview.streak ?? 0}</strong><span>{habit.schedule.type === 'times-per-week' ? 'week streak' : 'streak'}</span></div>
          <div><strong>{preview.weeklyPercent ?? 0}%</strong><span>this week</span></div>
          <div><strong>{preview.adherence4w ?? 0}%</strong><span>4-week adherence</span></div>
          <div><strong>{currentPause ? 'Paused' : 'Active'}</strong><span>{currentPause ? habitPauseLabel(habit, today) : 'rhythm state'}</span></div>
        </div>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Today</span><em>{currentPause && !preview.completed ? 'Paused' : !preview.scheduledToday ? 'Not scheduled' : preview.skipped ? 'Rest day' : preview.completed ? 'Complete' : preview.flexible ? 'Flexible' : 'Open'}</em></div>
          <div className="habit-today-control">
            <div><strong>{currentPause && !preview.completed ? 'Paused — no completion is expected today' : preview.skipped ? 'Rest day — streak preserved' : habit.kind === 'duration' ? `${preview.currentValue ?? 0} / ${habit.target} min` : preview.completed ? 'Done for today' : 'Not completed yet'}</strong><span>{habitScheduleLabel(habit)} · {preview.weeklyProgress}</span></div>
            {currentPause && !preview.completed ? <Button variant="primary" onClick={onResume}>Resume rhythm</Button> : preview.scheduledToday ? <div className="habit-action-row">
              {habit.kind === 'duration' && !preview.skipped ? <><Button onClick={() => onIncrement(5)}>+5m</Button><Button onClick={() => onIncrement(15)}>+15m</Button></> : null}
              <Button variant={preview.completed ? 'outline' : 'primary'} onClick={onToggle}>{preview.completed ? 'Reopen' : 'Complete'}</Button>
              {habit.schedule.type !== 'times-per-week' && !preview.completed ? <Button onClick={onSkip}>{preview.skipped ? 'Undo skip' : 'Skip today'}</Button> : null}
            </div> : <span className="habit-offday-note">This habit is intentionally off today. Its streak is evaluated only on scheduled days.</span>}
          </div>
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">8-week trend</span><em>Paused periods are neutral</em></div>
          <div className="habit-trend" aria-label="Habit weekly adherence trend">
            {trend.map((week) => <div className={`habit-trend__week ${week.neutral ? 'is-neutral' : ''}`} key={week.weekStart} title={`${formatLocalDate(week.weekStart, { month: 'short', day: 'numeric' })}: ${week.neutral ? 'paused/off' : `${week.completed}/${week.target} · ${week.percent}%`}`}>
              <div><i style={{ height: `${week.neutral ? 8 : Math.max(8, week.percent)}%` }} /></div>
              <span>{formatLocalDate(week.weekStart, { day: 'numeric' })}</span>
            </div>)}
          </div>
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Last 8 weeks</span><em>Rest and pause days do not break streaks</em></div>
          <div className="habit-history-grid habit-history-grid--v16" aria-label="Habit history">
            {dates.map((date) => {
              const status = habitHistoryStatus(habit, entryMap.get(date), date, today)
              return <div className={`habit-history-cell is-${status}`} title={`${formatLocalDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${status}`} key={date}><span>{Number(date.slice(-2))}</span></div>
            })}
          </div>
          <div className="habit-history-legend"><span><i className="is-complete" />Done</span><span><i className="is-skipped" />Rest</span><span><i className="is-paused" />Paused</span><span><i className="is-missed" />Missed</span></div>
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Rhythm lifecycle</span><em>{currentPause ? habitPauseLabel(habit, today) : 'Active'}</em></div>
          {currentPause ? <div className="habit-pause-control is-active"><div><strong>Pause is protecting this rhythm.</strong><span>{currentPause.endDate ? `No completion is expected through ${formatLocalDate(currentPause.endDate, { month: 'long', day: 'numeric' })}.` : 'No completion is expected until you resume it.'}</span></div><Button variant="primary" onClick={onResume}>Resume now</Button></div> : <div className="habit-pause-control">
            <div><strong>Pause without losing history</strong><span>Use a pause for travel, illness, exams, deloads, or any planned break. Paused dates stay neutral in streaks and adherence.</span></div>
            <label><span>Pause through</span><input type="date" min={today} value={pauseThrough} onChange={(event) => setPauseThrough(event.target.value)} /></label>
            <div><Button onClick={() => onPause(pauseThrough || undefined)}>Pause through date</Button><Button onClick={() => onPause(undefined)}>Pause indefinitely</Button></div>
          </div>}
        </section>

        <section className="habit-detail__section">
          <div className="section-title-row"><span className="eyebrow">Definition</span></div>
          <dl className="habit-definition">
            <div><dt>Schedule</dt><dd>{habitScheduleLabel(habit)}</dd></div>
            <div><dt>Tracking</dt><dd>{habit.kind === 'duration' ? `${habit.target} minutes` : 'Check once'}</dd></div>
            <div><dt>Capacity</dt><dd>{habit.countsTowardCapacity ? 'Remaining duration counts' : 'Does not reserve capacity'}</dd></div>
            <div><dt>Pause history</dt><dd>{habit.pauses?.length ?? 0} period{(habit.pauses?.length ?? 0) === 1 ? '' : 's'}</dd></div>
          </dl>
        </section>

        <div className="habit-detail__danger"><Button onClick={onArchive}>Archive habit</Button></div>
      </div>
    </Drawer>
  )
}
