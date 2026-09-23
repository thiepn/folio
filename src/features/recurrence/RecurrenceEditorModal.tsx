import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { localDateKey, localDateToDate } from '../../domain/date'
import type {
  CompletionIntervalUnit,
  MonthlyRecurrenceMode,
  RecurrenceFrequency,
  RecurrenceOrdinal,
  RecurringSeriesEntity,
} from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import { previewOccurrenceDates, seriesSummary } from './recurrenceLogic'

export interface RecurrenceEditorValue {
  startDate: string
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: number[]
  monthlyMode?: MonthlyRecurrenceMode
  monthDays?: number[]
  ordinal?: RecurrenceOrdinal
  weekday?: number
  yearMonths?: number[]
  afterCompletionUnit?: CompletionIntervalUnit
  until?: string
  count?: number
  deadlineOffsetDays?: number
  startMinute?: number
  blockDurationMinutes?: number
}

const weekdayOptions = [
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' },
]
const monthLabels = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2026, index, 1, 12)))

function parseDayList(value: string) {
  return [...new Set(value.split(',').map((part) => Number(part.trim())).filter((day) => Number.isInteger(day) && day >= 1 && day <= 31))].sort((a, b) => a - b)
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
  const [monthlyMode, setMonthlyMode] = useState<MonthlyRecurrenceMode>('days')
  const [monthDaysText, setMonthDaysText] = useState('')
  const [ordinal, setOrdinal] = useState<RecurrenceOrdinal>(1)
  const [weekday, setWeekday] = useState(1)
  const [yearMonths, setYearMonths] = useState<number[]>([])
  const [afterCompletionUnit, setAfterCompletionUnit] = useState<CompletionIntervalUnit>('day')
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
    const anchor = current?.startDate ?? task.recurrenceDate ?? task.plannedDate ?? localDateKey()
    const anchorDate = localDateToDate(anchor)
    const configuredDays = current?.rule.monthDays?.length
      ? current.rule.monthDays
      : current?.rule.monthDay
        ? [current.rule.monthDay]
        : [anchorDate.getDate()]

    setStartDate(anchor)
    setFrequency(current?.rule.frequency ?? 'daily')
    setInterval(current?.rule.interval ?? 1)
    setWeekdays(current?.rule.weekdays ?? [anchorDate.getDay()])
    setMonthlyMode(current?.rule.monthlyMode ?? 'days')
    setMonthDaysText(configuredDays.join(', '))
    setOrdinal(current?.rule.ordinal ?? 1)
    setWeekday(current?.rule.weekday ?? anchorDate.getDay())
    setYearMonths(current?.rule.yearMonths?.length ? current.rule.yearMonths : [anchorDate.getMonth() + 1])
    setAfterCompletionUnit(current?.rule.afterCompletionUnit ?? 'day')
    setEndMode(current?.rule.until ? 'date' : current?.rule.count ? 'count' : 'never')
    setUntil(current?.rule.until ?? '')
    setCount(current?.rule.count ?? 10)
    setDeadlineOffset(current?.taskTemplate.deadlineOffsetDays === undefined ? '' : String(current.taskTemplate.deadlineOffsetDays))
    setStartTime(current?.taskTemplate.startMinute === undefined ? '' : minuteToTime(current.taskTemplate.startMinute))
    setBlockDuration(current?.taskTemplate.blockDurationMinutes === undefined ? '' : String(current.taskTemplate.blockDurationMinutes))
    setScope('future')
    setError('')
  }, [open, task, series])

  const monthDays = useMemo(() => parseDayList(monthDaysText), [monthDaysText])
  const timezone = series?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local'

  const previewSeries = useMemo<RecurringSeriesEntity | null>(() => {
    if (!task || !startDate) return null
    const now = new Date().toISOString()
    return {
      id: series?.id ?? 'preview',
      title: task.title,
      timezone,
      status: 'active',
      startDate,
      rule: {
        frequency,
        interval: Math.max(1, interval),
        weekdays: frequency === 'weekly' ? weekdays : undefined,
        monthlyMode,
        monthDays: frequency === 'monthly' || frequency === 'yearly' ? monthDays : undefined,
        ordinal: frequency === 'monthly' && monthlyMode === 'ordinal-weekday' ? ordinal : undefined,
        weekday: frequency === 'monthly' && monthlyMode === 'ordinal-weekday' ? weekday : undefined,
        yearMonths: frequency === 'yearly' ? yearMonths : undefined,
        afterCompletionUnit,
        until: endMode === 'date' ? until || undefined : undefined,
        count: endMode === 'count' ? Math.max(1, count) : undefined,
      },
      taskTemplate: series?.taskTemplate ?? {
        title: task.title,
        description: task.description ?? '',
        projectId: task.projectId,
        priority: task.priority,
        estimatedMinutes: task.durationMinutes,
        tags: task.tags ?? [],
        checklist: (task.checklist ?? []).map((item) => item.text),
        sourceUrl: task.sourceUrl,
        location: task.location,
        pinned: Boolean(task.pinned),
      },
      exceptions: series?.exceptions ?? {},
      createdAt: series?.createdAt ?? now,
      updatedAt: now,
    }
  }, [task, series, timezone, startDate, frequency, interval, weekdays, monthlyMode, monthDays, ordinal, weekday, yearMonths, afterCompletionUnit, endMode, until, count])

  const previewDates = useMemo(() => previewSeries ? previewOccurrenceDates(previewSeries, 6) : [], [previewSeries])
  const summary = previewSeries ? seriesSummary(previewSeries) : ''

  if (!task) return null

  function toggleWeekday(day: number) {
    setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b))
  }

  function toggleYearMonth(month: number) {
    setYearMonths((current) => current.includes(month) ? current.filter((value) => value !== month) : [...current, month].sort((a, b) => a - b))
  }

  async function submit() {
    if (saving || !task) return
    if (!startDate) return setError('Choose a series start date.')
    if (frequency === 'weekly' && !weekdays.length) return setError('Choose at least one weekday for a weekly series.')
    if ((frequency === 'monthly' || frequency === 'yearly') && monthlyMode === 'days' && !monthDays.length) return setError('Enter at least one valid day from 1 to 31.')
    if (frequency === 'yearly' && !yearMonths.length) return setError('Choose at least one month for a yearly series.')
    if (endMode === 'date' && (!until || until < startDate)) return setError('The end date must be on or after the series start.')
    if (startTime && blockDuration && Number(blockDuration) < 1) return setError('Calendar block duration must be positive.')

    setSaving(true)
    setError('')
    const value: RecurrenceEditorValue = {
      startDate,
      frequency,
      interval: Math.max(1, interval),
      weekdays: frequency === 'weekly' ? weekdays : undefined,
      monthlyMode: frequency === 'monthly' ? monthlyMode : undefined,
      monthDays: frequency === 'monthly' && monthlyMode === 'days' ? monthDays : frequency === 'yearly' ? monthDays : undefined,
      ordinal: frequency === 'monthly' && monthlyMode === 'ordinal-weekday' ? ordinal : undefined,
      weekday: frequency === 'monthly' && monthlyMode === 'ordinal-weekday' ? weekday : undefined,
      yearMonths: frequency === 'yearly' ? yearMonths : undefined,
      afterCompletionUnit: frequency === 'after-completion' ? afterCompletionUnit : undefined,
      until: endMode === 'date' ? until || undefined : undefined,
      count: endMode === 'count' ? Math.max(1, count) : undefined,
      deadlineOffsetDays: deadlineOffset === '' ? undefined : Math.max(0, Number(deadlineOffset)),
      startMinute: startTime ? timeToMinute(startTime) : undefined,
      blockDurationMinutes: blockDuration ? Math.max(1, Number(blockDuration)) : undefined,
    }
    try {
      if (series) await onUpdate(task.id, scope, value)
      else await onCreate(task.id, value)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The recurrence could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal open={open} title={series ? 'Edit repeat' : 'Make recurring'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Saving…' : series ? 'Apply repeat changes' : 'Create series'}</Button></>}>
    <div className="recurrence-editor recurrence-editor--v2">
      <div className="recurrence-summary-line">
        <span className="recurrence-glyph">↻</span>
        <div><strong>{summary}</strong><span>{frequency === 'after-completion' ? `Anchored to actual completion in ${timezone}` : `Calendar slots · ${timezone}`}</span></div>
      </div>

      {series ? <label className="field"><span>Apply repeat pattern to</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="future">This and future occurrences</option><option value="entire">Entire series</option></select></label> : null}

      <div className="form-grid">
        <label className="field"><span>Series anchor</span><input type="date" value={startDate} disabled={Boolean(series)} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="field"><span>Repeat family</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="after-completion">After completion</option></select></label>
      </div>

      {frequency === 'after-completion' ? (
        <div className="form-grid">
          <label className="field"><span>Repeat after</span><input type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(Number(event.target.value))} /></label>
          <label className="field"><span>Unit</span><select value={afterCompletionUnit} onChange={(event) => setAfterCompletionUnit(event.target.value as CompletionIntervalUnit)}><option value="day">Day(s)</option><option value="week">Week(s)</option><option value="month">Month(s)</option><option value="year">Year(s)</option></select></label>
        </div>
      ) : (
        <label className="field recurrence-interval-field"><span>Interval</span><div><span>Every</span><input type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(Number(event.target.value))} /><span>{frequency === 'daily' ? 'day(s)' : frequency === 'weekly' ? 'week(s)' : frequency === 'monthly' ? 'month(s)' : 'year(s)'}</span></div></label>
      )}

      {frequency === 'weekly' ? <div className="field"><span>On weekdays</span><div className="weekday-selector weekday-selector--monday-first">{weekdayOptions.map((option) => <button key={option.value} type="button" title={option.label} className={weekdays.includes(option.value) ? 'is-active' : ''} onClick={() => toggleWeekday(option.value)}>{option.short}</button>)}</div><small>Intervals are anchored to Monday-first calendar weeks.</small></div> : null}

      {frequency === 'monthly' ? <div className="recurrence-pattern-panel">
        <label className="field"><span>Monthly pattern</span><select value={monthlyMode} onChange={(event) => setMonthlyMode(event.target.value as MonthlyRecurrenceMode)}><option value="days">Specific date(s)</option><option value="ordinal-weekday">Nth / last weekday</option><option value="last-day">Last day of month</option></select></label>
        {monthlyMode === 'days' ? <label className="field"><span>Date(s) of month</span><input value={monthDaysText} onChange={(event) => setMonthDaysText(event.target.value)} placeholder="1, 15, 31" /><small>Dates beyond the end of a month clamp to that month’s final day.</small></label> : null}
        {monthlyMode === 'ordinal-weekday' ? <div className="form-grid">
          <label className="field"><span>Occurrence</span><select value={ordinal} onChange={(event) => setOrdinal(Number(event.target.value) as RecurrenceOrdinal)}><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option><option value={4}>4th</option><option value={5}>5th</option><option value={-1}>Last</option></select></label>
          <label className="field"><span>Weekday</span><select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div> : null}
      </div> : null}

      {frequency === 'yearly' ? <div className="recurrence-pattern-panel">
        <div className="field"><span>Months</span><div className="month-selector">{monthLabels.map((label, index) => <button key={label} type="button" className={yearMonths.includes(index + 1) ? 'is-active' : ''} onClick={() => toggleYearMonth(index + 1)}>{label}</button>)}</div></div>
        <label className="field"><span>Date(s) in selected months</span><input value={monthDaysText} onChange={(event) => setMonthDaysText(event.target.value)} placeholder="1, 15, 31" /></label>
      </div> : null}

      <div className="form-grid">
        <label className="field"><span>End</span><select value={endMode} onChange={(event) => setEndMode(event.target.value as typeof endMode)}><option value="never">Never</option><option value="date">On date</option><option value="count">After count</option></select></label>
        {endMode === 'date' ? <label className="field"><span>End date</span><input type="date" value={until} min={startDate} onChange={(event) => setUntil(event.target.value)} /></label> : null}
        {endMode === 'count' ? <label className="field"><span>Occurrences</span><input type="number" min="1" max="10000" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label> : null}
      </div>

      <div className="section-label">Occurrence defaults</div>
      <div className="form-grid">
        <label className="field"><span>Deadline offset</span><input type="number" min="0" placeholder="Days after occurrence" value={deadlineOffset} onChange={(event) => setDeadlineOffset(event.target.value)} /></label>
        <label className="field"><span>Exact start</span><input type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
      </div>
      <label className="field"><span>Calendar block duration</span><input type="number" min="1" max="1440" placeholder="Defaults to task estimate" value={blockDuration} onChange={(event) => setBlockDuration(event.target.value)} /></label>

      <section className="recurrence-preview">
        <div className="section-label">Upcoming logical slots</div>
        {frequency === 'after-completion' ? <p>The first task starts on {startDate}. Each later task is calculated from the actual completion date, using {timezone}.</p> : previewDates.length ? <div className="recurrence-preview__dates">{previewDates.map((date) => <span key={date}>{date}</span>)}</div> : <p>No occurrences match the current rule inside the preview horizon.</p>}
      </section>

      <p className="form-help">A recurring occurrence keeps a stable logical recurrence date. Rescheduling one occurrence changes its planned date and records an exception; it does not create a duplicate slot.</p>
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  </Modal>
}

function timeToMinute(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
