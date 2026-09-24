import { useEffect, useState } from 'react'
import { addLocalDays, formatLocalDate, localDateKey, localDateRange } from '../../domain/date'
import { habitCurrentPause, habitHistoryStatus, habitPauseLabel, habitPausedForDate, habitScheduleLabel, habitWeeklyTrend } from '../../domain/habit'
import type { HabitEntity, HabitEntryEntity, LocalDate } from '../../domain/models'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { HabitPreview } from '../../types/ui'
import { HabitReminderSection } from '../reminders/HabitReminderSection'

function valueLabel(habit:HabitEntity,value:number){
  if(habit.kind==='duration') return `${value} min`
  if(habit.kind==='quantity') return `${value} ${habit.unit??'units'}`
  return value ? 'Done' : 'Open'
}
function targetLabel(habit:HabitEntity){
  if(habit.kind==='duration') return `${habit.target} minutes`
  if(habit.kind==='quantity') return `${habit.target} ${habit.unit??'units'}`
  return 'Check once'
}
function flexible(habit:HabitEntity){return habit.schedule.type==='times-per-week'||habit.schedule.type==='times-per-month'}

export function HabitDetailDrawer({ open, habit, preview, entries, today, groupName, onClose, onEdit, onArchive, onToggle, onIncrement, onSkip, onPause, onResume, onSetHistoryValue, onHistoryComplete, onHistorySkip, onHistoryClear, onSaveTemplate }: {
  open: boolean
  habit?: HabitEntity | null
  preview?: HabitPreview | null
  entries: HabitEntryEntity[]
  today: LocalDate
  groupName?: string
  onClose: () => void
  onEdit: () => void
  onArchive: () => void
  onToggle: () => void
  onIncrement: (value: number) => void
  onSkip: () => void
  onPause: (through?: LocalDate) => void
  onResume: () => void
  onSetHistoryValue: (date: LocalDate, value: number) => void
  onHistoryComplete: (date: LocalDate) => void
  onHistorySkip: (date: LocalDate) => void
  onHistoryClear: (date: LocalDate) => void
  onSaveTemplate: () => void
}) {
  const [pauseThrough, setPauseThrough] = useState(addLocalDays(today, 7))
  const [historyDate, setHistoryDate] = useState(today)
  const [historyValue, setHistoryValue] = useState('0')
  useEffect(() => { if (open) { setPauseThrough(addLocalDays(today, 7)); setHistoryDate(today) } }, [open, today])
  const habitEntries = habit ? entries.filter((entry) => entry.habitId === habit.id) : []
  const entryMap = new Map(habitEntries.map((entry) => [entry.date, entry]))
  const selectedEntry = entryMap.get(historyDate)
  useEffect(() => { setHistoryValue(String(selectedEntry?.status === 'skipped' ? 0 : selectedEntry?.value ?? 0)) }, [historyDate, selectedEntry?.updatedAt])
  if (!habit || !preview) return null

  const dates = localDateRange(addLocalDays(today, -83), 84)
  const currentPause = habitCurrentPause(habit, today)
  const trend = habitWeeklyTrend(habit, habitEntries, today, 12)
  const created = localDateKey(new Date(habit.createdAt))
  const historyEditable = historyDate >= created && historyDate <= today && !habitPausedForDate(habit, historyDate)
  const historyStatus = habitHistoryStatus(habit, selectedEntry, historyDate, today)

  const intro = habit.kind === 'check' ? 'Check habit' : habit.kind === 'duration' ? `${habit.target} min target` : `${habit.target} ${habit.unit ?? 'units'} target`

  return <Drawer open={open} title={habit.title} onClose={onClose} className="habit-detail-overlay">
    <div className="habit-detail habit-detail--v2">
      <div className="habit-detail__intro"><div><span className="eyebrow">{intro}</span><p>{habit.description || 'No description.'}</p><div className="habit-detail__identity"><i style={{background:habit.color??'var(--accent)'}}/><span>{groupName ?? 'Ungrouped'} · {habitScheduleLabel(habit)}</span></div></div><div className="habit-detail__intro-actions"><Button onClick={onSaveTemplate}>Save template</Button><Button onClick={onEdit}>Edit</Button></div></div>

      <div className="habit-metrics habit-metrics--v2">
        <div><strong>{preview.streak ?? 0}</strong><span>current streak</span></div>
        <div><strong>{preview.bestStreak ?? 0}</strong><span>best streak</span></div>
        <div><strong>{preview.periodPercent ?? 0}%</strong><span>this {preview.periodLabel ?? 'week'}</span></div>
        <div><strong>{preview.adherence90 ?? 0}%</strong><span>90-day adherence</span></div>
        <div><strong>{preview.lifetimeCompletions ?? 0}</strong><span>completions</span></div>
        <div><strong>{currentPause ? 'Paused' : 'Active'}</strong><span>{currentPause ? habitPauseLabel(habit, today) : 'rhythm state'}</span></div>
      </div>

      <section className="habit-detail__section">
        <div className="section-title-row"><span className="eyebrow">Today</span><em>{currentPause && !preview.completed ? 'Paused' : !preview.scheduledToday ? 'Not scheduled' : preview.skipped ? 'Rest day' : preview.completed ? 'Complete' : preview.flexible ? 'Flexible' : 'Open'}</em></div>
        <div className="habit-today-control">
          <div><strong>{currentPause && !preview.completed ? 'Paused — no completion is expected today' : preview.skipped ? 'Rest day — streak preserved' : habit.kind === 'check' ? (preview.completed ? 'Done for today' : 'Not completed yet') : `${valueLabel(habit, preview.currentValue ?? 0)} / ${targetLabel(habit)}`}</strong><span>{habitScheduleLabel(habit)} · {preview.periodProgress}</span></div>
          {currentPause && !preview.completed ? <Button variant="primary" onClick={onResume}>Resume rhythm</Button> : preview.scheduledToday ? <div className="habit-action-row">
            {habit.kind === 'duration' && !preview.skipped ? <><Button onClick={() => onIncrement(5)}>+5m</Button><Button onClick={() => onIncrement(15)}>+15m</Button></> : null}
            {habit.kind === 'quantity' && !preview.skipped ? <><Button onClick={() => onIncrement(1)}>+1</Button><Button onClick={() => onIncrement(5)}>+5</Button></> : null}
            <Button variant={preview.completed ? 'outline' : 'primary'} onClick={onToggle}>{preview.completed ? 'Reopen' : 'Complete'}</Button>
            {!flexible(habit) && !preview.completed ? <Button onClick={onSkip}>{preview.skipped ? 'Undo rest' : 'Rest today'}</Button> : null}
          </div> : <span className="habit-offday-note">This habit is intentionally off today. Its streak is evaluated only on scheduled days.</span>}
        </div>
      </section>

      <section className="habit-detail__section">
        <div className="section-title-row"><span className="eyebrow">12-week trend</span><em>Paused periods are neutral</em></div>
        <div className="habit-trend habit-trend--12" aria-label="Habit weekly adherence trend">{trend.map((week) => <div className={`habit-trend__week ${week.neutral ? 'is-neutral' : ''}`} key={week.weekStart} title={`${formatLocalDate(week.weekStart, { month: 'short', day: 'numeric' })}: ${week.neutral ? 'paused/off' : `${week.completed}/${week.target} · ${week.percent}%`}`}><div><i style={{ height: `${week.neutral ? 8 : Math.max(8, week.percent)}%` }} /></div><span>{formatLocalDate(week.weekStart, { day: 'numeric' })}</span></div>)}</div>
      </section>

      <section className="habit-detail__section">
        <div className="section-title-row"><span className="eyebrow">12-week heatmap</span><em>Select any date to edit its history</em></div>
        <div className="habit-history-grid habit-history-grid--v2" aria-label="Habit history">{dates.map((date) => {
          const status = habitHistoryStatus(habit, entryMap.get(date), date, today)
          return <button type="button" className={`habit-history-cell is-${status} ${historyDate===date?'is-selected':''}`} title={`${formatLocalDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${status}`} key={date} onClick={()=>setHistoryDate(date)}><span>{Number(date.slice(-2))}</span></button>
        })}</div>
        <div className="habit-history-legend"><span><i className="is-complete" />Done</span><span><i className="is-skipped" />Rest</span><span><i className="is-paused" />Paused</span><span><i className="is-missed" />Missed</span></div>
      </section>

      <section className="habit-detail__section habit-history-editor">
        <div className="section-title-row"><span className="eyebrow">Edit history</span><em>{formatLocalDate(historyDate, { weekday:'short', month:'short', day:'numeric' })} · {historyStatus}</em></div>
        <div className="habit-history-editor__row">
          <label><span>Date</span><input type="date" min={created} max={today} value={historyDate} onChange={(event)=>setHistoryDate(event.target.value)} /></label>
          {habit.kind !== 'check' ? <label><span>{habit.kind==='duration'?'Minutes':habit.unit??'Quantity'}</span><input type="number" min="0" max="1000000" value={historyValue} onChange={(event)=>setHistoryValue(event.target.value)} /></label> : null}
          <div className="habit-history-editor__actions">
            {habit.kind !== 'check' ? <Button disabled={!historyEditable} onClick={()=>onSetHistoryValue(historyDate,Math.max(0,Number(historyValue)||0))}>Save value</Button> : null}
            <Button disabled={!historyEditable} variant="primary" onClick={()=>onHistoryComplete(historyDate)}>Mark complete</Button>
            {!flexible(habit) ? <Button disabled={!historyEditable} onClick={()=>onHistorySkip(historyDate)}>Rest day</Button> : null}
            <Button disabled={!historyEditable || !selectedEntry} onClick={()=>onHistoryClear(historyDate)}>Clear</Button>
          </div>
        </div>
        {!historyEditable ? <p className="phase-note">Dates before creation, future dates, and paused dates are protected from historical edits.</p> : null}
      </section>

      <section className="habit-detail__section">
        <div className="section-title-row"><span className="eyebrow">Rhythm lifecycle</span><em>{currentPause ? habitPauseLabel(habit, today) : 'Active'}</em></div>
        {currentPause ? <div className="habit-pause-control is-active"><div><strong>Pause is protecting this rhythm.</strong><span>{currentPause.endDate ? `No completion is expected through ${formatLocalDate(currentPause.endDate, { month: 'long', day: 'numeric' })}.` : 'No completion is expected until you resume it.'}</span></div><Button variant="primary" onClick={onResume}>Resume now</Button></div> : <div className="habit-pause-control"><div><strong>Pause without losing history</strong><span>Travel, illness, exams, deloads, and planned breaks remain neutral in streak and adherence calculations.</span></div><label><span>Pause through</span><input type="date" min={today} value={pauseThrough} onChange={(event) => setPauseThrough(event.target.value)} /></label><div><Button onClick={() => onPause(pauseThrough || undefined)}>Pause through date</Button><Button onClick={() => onPause(undefined)}>Pause indefinitely</Button></div></div>}
      </section>

      <HabitReminderSection habit={habit} />

      <section className="habit-detail__section"><div className="section-title-row"><span className="eyebrow">Definition</span></div><dl className="habit-definition">
        <div><dt>Schedule</dt><dd>{habitScheduleLabel(habit)}</dd></div><div><dt>Tracking</dt><dd>{targetLabel(habit)}</dd></div><div><dt>Group</dt><dd>{groupName ?? 'Ungrouped'}</dd></div><div><dt>Capacity</dt><dd>{habit.countsTowardCapacity ? 'Remaining duration counts' : 'Does not reserve capacity'}</dd></div><div><dt>Pause history</dt><dd>{habit.pauses?.length ?? 0} period{(habit.pauses?.length ?? 0) === 1 ? '' : 's'}</dd></div>
      </dl></section>

      <div className="habit-detail__danger"><Button onClick={onArchive}>Archive habit</Button></div>
    </div>
  </Drawer>
}
