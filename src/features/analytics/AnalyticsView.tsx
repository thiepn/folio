import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { addLocalDays, localDateKey } from '../../domain/date'
import { useAnalyticsData } from '../../hooks/useAnalyticsData'
import type { AnalyticsPatternRow } from './analyticsLogic'

type Preset = '30d' | '90d' | '12m' | 'ytd' | 'custom'

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? hours + 'h' + (rest ? ' ' + rest + 'm' : '') : rest + 'm'
}
function pct(value: number | null) { return value == null ? '—' : value + '%' }
function variance(value: number | null) { return value == null ? '—' : value === 0 ? 'On estimate' : (value > 0 ? '+' : '') + value + '%' }
function delta(current: number | null, previous: number | null, suffix = '') {
  if (current == null || previous == null) return 'No comparison'
  const diff = current - previous
  if (!diff) return 'Same as previous period'
  return (diff > 0 ? '+' : '') + diff + suffix + ' vs previous period'
}
function periodStart(preset: Preset, today: string) {
  if (preset === '30d') return addLocalDays(today, -29)
  if (preset === '90d') return addLocalDays(today, -89)
  if (preset === '12m') return addLocalDays(today, -364)
  if (preset === 'ytd') return today.slice(0, 4) + '-01-01'
  return addLocalDays(today, -89)
}
function Metric({ value, label, note, tone }: { value: string; label: string; note: string; tone?: 'warning' | 'positive' }) {
  return <div className={'analytics-metric' + (tone ? ' is-' + tone : '')}><strong>{value}</strong><span>{label}</span><small>{note}</small></div>
}
function maxOf(values: number[]) { return Math.max(1, ...values) }

export function AnalyticsView() {
  const today = localDateKey()
  const [preset, setPreset] = useState<Preset>('90d')
  const [fromDate, setFromDate] = useState(periodStart('90d', today))
  const [throughDate, setThroughDate] = useState(today)
  const data = useAnalyticsData(fromDate, throughDate)

  function choose(next: Preset) {
    setPreset(next)
    if (next !== 'custom') {
      setFromDate(periodStart(next, today))
      setThroughDate(today)
    }
  }

  const strongestFocusDay = useMemo(() => data?.weekdays.reduce((best, row) => row.focusSeconds > best.focusSeconds ? row : best, data.weekdays[0]) ?? null, [data])
  const strongestPlanDay = useMemo(() => data?.weekdays.filter((row) => row.plannedTasks).reduce((best, row) => best == null || (row.planRate ?? -1) > (best.planRate ?? -1) ? row : best, null as AnalyticsPatternRow | null) ?? null, [data])
  const peakTime = useMemo(() => data?.timeOfDay.reduce((best, row) => row.focusSeconds > best.focusSeconds ? row : best, data.timeOfDay[0]) ?? null, [data])
  const maxWeeklyFocus = data ? maxOf(data.weekly.map((row) => row.focusSeconds)) : 1
  const maxWeeklyCompleted = data ? maxOf(data.weekly.map((row) => row.completedTasks)) : 1
  const maxProjectFocus = data ? maxOf(data.projects.map((row) => row.focusSeconds)) : 1
  const maxWeekdayFocus = data ? maxOf(data.weekdays.map((row) => row.focusSeconds)) : 1

  return <div className="analytics-view">
    <PageHeader kicker="Evidence over intuition" title="Analytics" subtitle="See how planning, execution, focus, habits, deadlines, and project velocity actually behave over time." />
    <section className="analytics-range">
      <div className="analytics-presets">
        {(['30d', '90d', '12m', 'ytd'] as Preset[]).map((value) => <button key={value} className={preset === value ? 'is-active' : ''} onClick={() => choose(value)}>{value === '30d' ? '30 days' : value === '90d' ? '90 days' : value === '12m' ? '12 months' : 'This year'}</button>)}
        <button className={preset === 'custom' ? 'is-active' : ''} onClick={() => setPreset('custom')}>Custom</button>
      </div>
      <div className="analytics-range-inputs">
        <label>From <input type="date" max={throughDate} value={fromDate} onChange={(event) => { setPreset('custom'); setFromDate(event.target.value) }} /></label>
        <label>Through <input type="date" min={fromDate} max={today} value={throughDate} onChange={(event) => { setPreset('custom'); setThroughDate(event.target.value) }} /></label>
      </div>
    </section>

    {!data ? <div className="analytics-loading">Calculating analytics…</div> : <>
      <section className="analytics-scoreboard">
        <Metric value={String(data.summary.completedTasks)} label="Tasks completed" note={delta(data.summary.completedTasks, data.previousSummary.completedTasks)} />
        <Metric value={pct(data.summary.planCompletionRate)} label="Plan execution" note={delta(data.summary.planCompletionRate, data.previousSummary.planCompletionRate, 'pp')} />
        <Metric value={pct(data.summary.overdueRate)} label="Overdue rate" note={data.summary.dueTasks ? data.summary.overdueTasks + ' of ' + data.summary.dueTasks + ' due tasks' : 'No deadlines in range'} tone={data.summary.overdueRate != null && data.summary.overdueRate > 25 ? 'warning' : undefined} />
        <Metric value={formatMinutes(data.summary.focusSeconds)} label="Focused work" note={data.summary.focusSessions + ' sessions · ' + formatMinutes(data.summary.manualFocusSeconds) + ' manual'} />
        <Metric value={pct(data.summary.habitAdherencePercent)} label="Habit adherence" note={delta(data.summary.habitAdherencePercent, data.previousSummary.habitAdherencePercent, 'pp')} />
        <Metric value={variance(data.summary.estimateVariancePercent)} label="Estimate variance" note="Completed tasks with estimates + focus evidence" />
        <Metric value={pct(data.summary.workloadPercent)} label="Average planned load" note={data.summary.overloadedDays + ' overloaded planned days'} tone={data.summary.overloadedDays ? 'warning' : undefined} />
        <Metric value={String(data.projects.reduce((sum, row) => sum + row.completedTasks, 0))} label="Project completions" note={data.projects.filter((row) => row.completedTasks || row.focusSeconds).length + ' projects with activity'} />
      </section>

      <section className="analytics-insights">
        <article><span>Focus pattern</span><strong>{strongestFocusDay?.label ?? '—'}</strong><p>{strongestFocusDay?.focusSeconds ? formatMinutes(strongestFocusDay.focusSeconds) + ' focused across selected ' + strongestFocusDay.label + 's.' : 'Not enough focus history.'}</p></article>
        <article><span>Planning pattern</span><strong>{strongestPlanDay?.label ?? '—'}</strong><p>{strongestPlanDay?.planRate != null ? strongestPlanDay.planRate + '% same-day plan execution.' : 'Not enough planned-task history.'}</p></article>
        <article><span>Time-of-day pattern</span><strong>{peakTime?.label ?? '—'}</strong><p>{peakTime?.focusSeconds ? formatMinutes(peakTime.focusSeconds) + ' of focus started in this window.' : 'Not enough focus history.'}</p></article>
      </section>

      <section className="analytics-section">
        <div className="analytics-section-head"><div><span className="eyebrow">Trend</span><h2>Completion and focused work</h2></div><span>{data.weekly.length} week{data.weekly.length === 1 ? '' : 's'}</span></div>
        <div className="analytics-weekly-chart">{data.weekly.map((row) => <div className="analytics-week-column" key={row.start}><div className="analytics-week-bars"><i className="is-complete" style={{ height: Math.max(3, row.completedTasks / maxWeeklyCompleted * 100) + '%' }} /><i className="is-focus" style={{ height: Math.max(3, row.focusSeconds / maxWeeklyFocus * 100) + '%' }} /></div><strong>{row.completedTasks}</strong><span>{row.start.slice(5)}</span><small>{formatMinutes(row.focusSeconds)}</small></div>)}</div>
        <div className="analytics-legend"><span><i className="is-complete" />Completed tasks</span><span><i className="is-focus" />Focus time</span></div>
      </section>

      <div className="analytics-two-col">
        <section className="analytics-section">
          <div className="analytics-section-head"><div><span className="eyebrow">Planning reliability</span><h2>Weekday execution</h2></div></div>
          <div className="analytics-weekday-list">{data.weekdays.map((row) => <div key={row.key}><strong>{row.label}</strong><span>{row.plannedTasks ? pct(row.planRate) + ' of ' + row.plannedTasks + ' planned' : 'No planned tasks'}</span><i><b style={{ width: (row.planRate ?? 0) + '%' }} /></i></div>)}</div>
        </section>
        <section className="analytics-section">
          <div className="analytics-section-head"><div><span className="eyebrow">Work rhythm</span><h2>Focus by weekday</h2></div></div>
          <div className="analytics-weekday-bars">{data.weekdays.map((row) => <div key={row.key}><i style={{ height: Math.max(3, row.focusSeconds / maxWeekdayFocus * 100) + '%' }} /><strong>{formatMinutes(row.focusSeconds)}</strong><span>{row.label}</span></div>)}</div>
        </section>
      </div>

      <section className="analytics-section">
        <div className="analytics-section-head"><div><span className="eyebrow">Project velocity</span><h2>Where work moved</h2></div><span>Completion + focus evidence</span></div>
        <div className="analytics-project-list">{data.projects.slice(0, 12).map((row) => <article key={row.id}><i className="analytics-project-color" style={{ background: row.color ?? 'var(--muted-2)' }} /><div><strong>{row.name}</strong><span>{row.completedTasks} completed · {row.openTasks} open · {row.velocityPerWeek}/week</span></div><div className="analytics-project-focus"><i><b style={{ width: row.focusSeconds / maxProjectFocus * 100 + '%' }} /></i><em>{formatMinutes(row.focusSeconds)}</em></div></article>)}</div>
      </section>

      <div className="analytics-two-col">
        <section className="analytics-section">
          <div className="analytics-section-head"><div><span className="eyebrow">Estimate calibration</span><h2>Estimated vs actual</h2></div><span>{data.calibration.length} measured tasks</span></div>
          <div className="analytics-calibration">{data.calibration.slice(0, 12).map((row) => <div key={row.id}><strong>{row.title}</strong><span>{row.estimateMinutes}m estimate · {row.actualMinutes}m actual</span><em className={Math.abs(row.variancePercent) > 30 ? 'is-warning' : ''}>{row.variancePercent > 0 ? '+' : ''}{row.variancePercent}%</em></div>)}{!data.calibration.length ? <p>No completed tasks have both an estimate and tracked focus yet.</p> : null}</div>
        </section>
        <section className="analytics-section">
          <div className="analytics-section-head"><div><span className="eyebrow">Habit consistency</span><h2>Adherence and streaks</h2></div></div>
          <div className="analytics-habit-list">{data.habits.slice(0, 12).map((row) => <div key={row.id}><div><strong>{row.title}</strong><span>{row.completions} completions · {row.currentStreak} current · {row.bestStreak} best</span></div><em>{row.adherencePercent}%</em><i><b style={{ width: row.adherencePercent + '%' }} /></i></div>)}{!data.habits.length ? <p>No habit history in this range.</p> : null}</div>
        </section>
      </div>

      <section className="analytics-section">
        <div className="analytics-section-head"><div><span className="eyebrow">Time-of-day</span><h2>When focused work happens</h2></div></div>
        <div className="analytics-time-grid">{data.timeOfDay.map((row) => <article key={row.key}><strong>{row.label}</strong><b>{formatMinutes(row.focusSeconds)}</b><span>{row.completedTasks} task completions</span></article>)}</div>
      </section>

      <section className="analytics-section">
        <div className="analytics-section-head"><div><span className="eyebrow">Monthly report</span><h2>Selected period by month</h2></div></div>
        <ReportTable rows={data.monthly} />
      </section>

      <section className="analytics-section">
        <div className="analytics-section-head"><div><span className="eyebrow">Yearly report</span><h2>Selected period by year</h2></div></div>
        <ReportTable rows={data.yearly} />
      </section>
    </>}
  </div>
}

function ReportTable({ rows }: { rows: Array<{ key: string; label: string; completedTasks: number; plannedTasks: number; planRate: number | null; focusSeconds: number; overdueRate: number | null }> }) {
  return <div className="analytics-report-table"><div className="analytics-report-head"><span>Period</span><span>Completed</span><span>Planned</span><span>Plan rate</span><span>Focus</span><span>Overdue</span></div>{rows.map((row) => <div key={row.key}><strong>{row.label}</strong><span>{row.completedTasks}</span><span>{row.plannedTasks}</span><span>{pct(row.planRate)}</span><span>{formatMinutes(row.focusSeconds)}</span><span>{pct(row.overdueRate)}</span></div>)}{!rows.length ? <p>No reportable activity in this range.</p> : null}</div>
}
