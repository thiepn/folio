import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { Tabs } from '../../components/ui/Tabs'
import type { ReviewKind, ReviewRecordEntity } from '../../domain/models'
import type { FocusSessionPreview, TaskPreview } from '../../types/ui'
import { filterHistoryEvents, historyCounts, type HistoryEvent, type HistoryEventKind } from './historyLogic'
import type { ReviewProjectMetric, ReviewSnapshot, ReviewTaskIssue, ReviewTaskReference } from './reviewLogic'

type ReviewTab = 'week' | 'reviews' | 'history'
const reviewTabs = [{ value: 'week', label: 'This week' }, { value: 'reviews', label: 'Saved reviews' }, { value: 'history', label: 'History' }] as const

export function ReviewView({ snapshot, recentCompleted = [], recentFocus = [], historyEvents = [], reviewRecords = [], onOpenTask, onOpenProject, onStartReview, onNewReview, onEditReview }: {
  snapshot?: ReviewSnapshot
  recentCompleted?: TaskPreview[]
  recentFocus?: FocusSessionPreview[]
  historyEvents?: HistoryEvent[]
  reviewRecords?: ReviewRecordEntity[]
  onOpenTask?: (id: string) => void
  onOpenProject?: (id: string) => void
  onStartReview: () => void
  onNewReview: (kind: ReviewKind) => void
  onEditReview: (record: ReviewRecordEntity) => void
}) {
  const [tab, setTab] = useState<ReviewTab>('week')
  return <>
    <PageHeader kicker="Remember what actually happened" title="Reviews & history" subtitle="Review the evidence, preserve what you learned, and keep a searchable record of work over time." action={<Button variant="primary" onClick={onStartReview}>Start weekly review</Button>} />
    <Tabs<ReviewTab> value={tab} tabs={reviewTabs} onChange={setTab} />
    {tab === 'week' ? <WeekReview {...{ snapshot, recentCompleted, recentFocus, historyEvents, onOpenTask, onOpenProject }} /> : null}
    {tab === 'reviews' ? <SavedReviews records={reviewRecords} onNewReview={onNewReview} onEditReview={onEditReview} /> : null}
    {tab === 'history' ? <HistoryTimeline events={historyEvents} records={reviewRecords} onOpenTask={onOpenTask} onOpenProject={onOpenProject} onEditReview={onEditReview} /> : null}
  </>
}

function WeekReview({ snapshot, recentCompleted, recentFocus, historyEvents, onOpenTask, onOpenProject }: {
  snapshot?: ReviewSnapshot
  recentCompleted: TaskPreview[]
  recentFocus: FocusSessionPreview[]
  historyEvents: HistoryEvent[]
  onOpenTask?: (id: string) => void
  onOpenProject?: (id: string) => void
}) {
  if (!snapshot) return <div className="empty-state">Calculating review…</div>
  const counts = historyCounts(historyEvents, snapshot.weekStart, snapshot.today)
  const weekEvents = historyEvents.filter((event) => event.date >= snapshot.weekStart && event.date <= snapshot.today).slice(0, 10)
  return <>
    <div className="review-scoreboard">
      <Metric value={snapshot.completionRate == null ? '—' : `${snapshot.completionRate}%`} label="Planned tasks completed" note={`${snapshot.completedPlannedCount} / ${snapshot.plannedThroughTodayCount} through today`} />
      <Metric value={formatDuration(snapshot.focusWeekSeconds)} label="Focused this week" note={`${snapshot.focusSessionCount} sessions`} />
      <Metric value={snapshot.habitAdherence + '%'} label="Habit adherence" note="Week-to-date" />
      <Metric value={String(snapshot.overloadedDays)} label="Overloaded days" note={`${snapshot.committedDays} committed day plans`} warn={snapshot.overloadedDays > 0} />
    </div>

    <section className="review-section review-section--editorial review-actual-section">
      <div className="review-section-head"><div><div className="eyebrow">What actually happened</div><h2>The week as a record, not a plan</h2></div><span>{formatDate(snapshot.weekStart)}–{formatDate(snapshot.today)}</span></div>
      <div className="review-actual-counts">
        <div><strong>{counts.tasks}</strong><span>Tasks completed</span></div>
        <div><strong>{counts.focus}</strong><span>Focus sessions</span></div>
        <div><strong>{counts.habits}</strong><span>Habit entries</span></div>
        <div><strong>{counts.projects}</strong><span>Project events</span></div>
      </div>
      {weekEvents.length ? <div className="review-week-events">{weekEvents.map((event) => <HistoryRow key={event.id} event={event} onOpenTask={onOpenTask} onOpenProject={onOpenProject} />)}</div> : <div className="empty-state">No historical events have been recorded this week yet.</div>}
    </section>

    <section className="review-section review-section--editorial">
      <div className="review-section-head"><div><div className="eyebrow">Planning reality</div><h2>Planned versus completed</h2></div><span>{formatDate(snapshot.weekStart)}–{formatDate(snapshot.weekEnd)}</span></div>
      <div className="review-day-strip">{snapshot.dayMetrics.map((day) => <DayMetric key={day.date} day={day} />)}</div>
    </section>

    <section className="review-section review-section--editorial">
      <div className="review-section-head"><div><div className="eyebrow">Corrections</div><h2>What deserves attention</h2></div></div>
      <div className="review-recommendation-stack">{snapshot.recommendations.map((item) => <article key={item.id} className={`review-recommendation is-${item.tone}`}><span /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>
    </section>

    <div className="review-two-col">
      <Panel title="Postponed" meta={`${snapshot.postponedTasks.length} tasks`}><IssueList items={snapshot.postponedTasks.slice(0, 6)} empty="No repeatedly postponed tasks." onOpenTask={onOpenTask} /></Panel>
      <Panel title="Stale backlog" meta={`${snapshot.staleTasks.length} tasks`}><IssueList items={snapshot.staleTasks.slice(0, 6)} empty="No stale open tasks." onOpenTask={onOpenTask} /></Panel>
    </div>

    <section className="review-section review-section--editorial">
      <div className="review-section-head"><div><div className="eyebrow">Plan vs actual</div><h2>Scheduled, estimated, actual</h2></div></div>
      <div className="review-calibration-grid">
        <Metric value={formatMinutes(snapshot.scheduledWeekMinutes)} label="Task time scheduled" note="Clock time blocks through today" />
        <Metric value={formatDuration(snapshot.focusWeekSeconds)} label="Actual tracked focus" note={snapshot.scheduleExecutionPercent == null ? 'No scheduled task time yet' : `${snapshot.scheduleExecutionPercent}% of scheduled task time`} />
        <Metric value={formatVariance(snapshot.estimateVariancePercent)} label="Estimate calibration" note="Completed tasks with tracked focus" />
        <Metric value={snapshot.focusGoalPercent == null ? '—' : `${snapshot.focusGoalPercent}%`} label="Weekly focus goal" note={`${snapshot.focusInterruptionCount} interruptions · ${formatDuration(snapshot.manualFocusSeconds)} manual`} />
      </div>
    </section>

    <section className="review-section review-section--editorial">
      <div className="review-section-head"><div><div className="eyebrow">Allocation</div><h2>Where the week went</h2></div></div>
      <ProjectAllocation projects={snapshot.projectMetrics} />
    </section>

    <div className="review-two-col">
      <Panel title="Next-week deadlines" meta={`${snapshot.nextWeekDeadlines.length}`}><ReferenceList items={snapshot.nextWeekDeadlines.slice(0, 7)} empty="No hard deadlines next week." onOpenTask={onOpenTask} /></Panel>
      <Panel title="Neglected projects" meta={`${snapshot.neglectedProjects.length}`}>{snapshot.neglectedProjects.length ? <div className="review-project-list">{snapshot.neglectedProjects.slice(0, 7).map((project) => <ProjectRow key={project.projectId} project={project} />)}</div> : <div className="empty-state">No active project with open work was completely neglected this week.</div>}</Panel>
    </div>

    <div className="review-two-col">
      <Panel title="Recent focus" meta={`${recentFocus.length}`}>{recentFocus.length ? <div className="focus-history-list">{recentFocus.slice(0, 6).map((session) => <button className="focus-history-row" key={session.id} onClick={() => session.taskId && onOpenTask?.(session.taskId)} disabled={!session.taskId}><div><strong>{session.taskTitle}</strong><span>{session.projectName ?? 'No project'} · {formatSessionDate(session.startedAt)}</span></div><div><b>{formatDuration(session.durationSeconds)}</b><span>{session.source === 'manual' ? 'Manual' : session.mode === 'pomodoro' ? 'Pomodoro' : session.mode === 'countdown' ? 'Countdown' : 'Stopwatch'}</span></div></button>)}</div> : <div className="empty-state">No finished focus sessions yet.</div>}</Panel>
      <Panel title="Recently completed" meta={`${recentCompleted.length}`}>{recentCompleted.length ? <div className="review-reference-list">{recentCompleted.slice(0, 6).map((task) => <button key={task.id} onClick={() => onOpenTask?.(task.id)}><div><strong>{task.title}</strong><span>{task.project ?? 'No project'}</span></div><em>Completed</em></button>)}</div> : <div className="empty-state">No completed tasks yet.</div>}</Panel>
    </div>
  </>
}

function SavedReviews({ records, onNewReview, onEditReview }: { records: ReviewRecordEntity[]; onNewReview: (kind: ReviewKind) => void; onEditReview: (record: ReviewRecordEntity) => void }) {
  return <div className="saved-reviews-workspace">
    <div className="saved-reviews-toolbar"><div><div className="eyebrow">Reflection archive</div><h2>Keep the lesson, not just the metric.</h2><p>Daily wrap-ups are saved automatically from Today. Weekly reviews come from the guided workflow. Monthly reviews are intentionally lightweight.</p></div><div><Button onClick={() => onNewReview('daily')}>Daily review</Button><Button variant="primary" onClick={() => onNewReview('monthly')}>Monthly review</Button></div></div>
    {records.length ? <div className="saved-review-list">{records.map((record) => <button className="saved-review-card" key={record.id} onClick={() => onEditReview(record)}>
      <div className="saved-review-card__head"><span className={`review-kind review-kind--${record.kind}`}>{record.kind}</span><time>{periodLabel(record.periodStart, record.periodEnd)}</time></div>
      <h3>{record.title}</h3>
      <p>{record.summary || record.wins || record.lessons || 'No written reflection yet.'}</p>
      <div className="saved-review-card__metrics">
        <span><b>{record.metrics.completedPlannedTasks}/{record.metrics.plannedTasks}</b> planned done</span>
        <span><b>{formatDuration(record.metrics.focusSeconds)}</b> focus</span>
        <span><b>{record.metrics.habitCompletions}</b> habit completions</span>
        <span><b>{record.metrics.completedMilestones}</b> milestones</span>
      </div>
      {record.nextFocus ? <div className="saved-review-card__next"><span>Next focus</span><strong>{record.nextFocus}</strong></div> : null}
    </button>)}</div> : <div className="review-empty-archive"><strong>No saved reviews yet.</strong><span>Finish the weekly review or save an end-of-day wrap-up to begin the archive.</span></div>}
  </div>
}

function HistoryTimeline({ events, records, onOpenTask, onOpenProject, onEditReview }: { events: HistoryEvent[]; records: ReviewRecordEntity[]; onOpenTask?: (id: string) => void; onOpenProject?: (id: string) => void; onEditReview: (record: ReviewRecordEntity) => void }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<HistoryEventKind | 'all'>('all')
  const filtered = useMemo(() => filterHistoryEvents(events, { query, kind }), [events, query, kind])
  const shown = filtered.slice(0, 300)
  const groups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>()
    for (const event of shown) map.set(event.date, [...(map.get(event.date) ?? []), event])
    return [...map.entries()]
  }, [shown])

  return <div className="history-workspace">
    <div className="history-toolbar">
      <label><span>Search history</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Task, project, habit, review…" /></label>
      <label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">All history</option><option value="task">Completed tasks</option><option value="focus">Focus</option><option value="habit">Habits</option><option value="project">Projects</option><option value="review">Reviews</option></select></label>
      <div className="history-toolbar__count"><strong>{filtered.length}</strong><span>matching events</span></div>
    </div>
    {groups.length ? <div className="history-groups">{groups.map(([date, items]) => <section key={date}><header><strong>{formatHistoryDate(date)}</strong><span>{items.length} event{items.length === 1 ? '' : 's'}</span></header><div>{items.map((event) => <HistoryRow key={event.id} event={event} onOpenTask={onOpenTask} onOpenProject={onOpenProject} onOpenReview={(id) => { const record = records.find((item) => item.id === id); if (record) onEditReview(record) }} />)}</div></section>)}</div> : <div className="review-empty-archive"><strong>No matching history.</strong><span>Change the search or filter, or keep using Folio to build a longer record.</span></div>}
    {filtered.length > shown.length ? <div className="history-limit-note">Showing the newest {shown.length} of {filtered.length} matching events.</div> : null}
  </div>
}

function HistoryRow({ event, onOpenTask, onOpenProject, onOpenReview }: { event: HistoryEvent; onOpenTask?: (id: string) => void; onOpenProject?: (id: string) => void; onOpenReview?: (id: string) => void }) {
  const clickable = Boolean((event.taskId && onOpenTask) || (event.projectId && onOpenProject) || (event.reviewId && onOpenReview))
  function open() {
    if (event.reviewId && onOpenReview) onOpenReview(event.reviewId)
    else if (event.taskId && onOpenTask) onOpenTask(event.taskId)
    else if (event.projectId && onOpenProject) onOpenProject(event.projectId)
  }
  return <button className={`history-row history-row--${event.kind}`} disabled={!clickable} onClick={open}><span className="history-row__mark" /><div><strong>{event.title}</strong><span>{event.detail}</span></div><time>{formatEventTime(event.at)}</time></button>
}

function Metric({ value, label, note, warn = false }: { value: string; label: string; note: string; warn?: boolean }) { return <div className={`review-metric ${warn ? 'is-warning' : ''}`}><strong>{value}</strong><span>{label}</span><small>{note}</small></div> }
function DayMetric({ day }: { day: ReviewSnapshot['dayMetrics'][number] }) { const percent = day.capacityMinutes ? Math.min(100, Math.round((day.plannedMinutes / day.capacityMinutes) * 100)) : 0; return <article className={`review-day ${day.overloadedByMinutes ? 'is-overloaded' : ''}`}><header><span>{weekday(day.date)}</span><b>{day.date.slice(-2)}</b></header><div className="review-day__bar"><i style={{ width: `${percent}%` }} /></div><strong>{formatMinutes(day.plannedMinutes)} / {formatMinutes(day.capacityMinutes)}</strong><span>{day.completedTasks}/{day.plannedTasks} tasks · {formatDuration(day.focusSeconds)} focus</span>{day.overloadedByMinutes ? <em>Over {formatMinutes(day.overloadedByMinutes)}</em> : <em>{day.planStatus}</em>}</article> }
function IssueList({ items, empty, onOpenTask }: { items: ReviewTaskIssue[]; empty: string; onOpenTask?: (id: string) => void }) { return items.length ? <div className="review-reference-list">{items.map((item) => <button key={item.id} onClick={() => onOpenTask?.(item.id)}><div><strong>{item.title}</strong><span>{[item.projectName, item.reason].filter(Boolean).join(' · ')}</span></div><em>{item.rescheduleCount ? `${item.rescheduleCount}×` : `${item.ageDays}d`}</em></button>)}</div> : <div className="empty-state">{empty}</div> }
function ReferenceList({ items, empty, onOpenTask }: { items: ReviewTaskReference[]; empty: string; onOpenTask?: (id: string) => void }) { return items.length ? <div className="review-reference-list">{items.map((item) => <button key={item.id} onClick={() => onOpenTask?.(item.id)}><div><strong>{item.title}</strong><span>{item.projectName ?? 'No project'}</span></div><em>{item.deadline ? formatDate(item.deadline) : ''}</em></button>)}</div> : <div className="empty-state">{empty}</div> }
function ProjectAllocation({ projects }: { projects: ReviewProjectMetric[] }) { const max = Math.max(1, ...projects.map((project) => project.focusSeconds)); return <div className="review-project-allocation">{projects.slice(0, 10).map((project) => <div key={project.projectId} className="review-project-row"><div><strong>{project.name}</strong><span>{project.type === 'academic' && project.weeklyTargetMinutes ? `${project.targetPercent}% of weekly target · ${project.paceStatus}` : `${project.completedThisWeek} completed · ${project.openTasks} open`}</span></div><div className="review-project-row__bar"><i style={{ width: `${Math.max(2, Math.round((project.focusSeconds / max) * 100))}%` }} /></div><em>{formatDuration(project.focusSeconds)}</em></div>)}</div> }
function ProjectRow({ project }: { project: ReviewProjectMetric }) { return <div className="review-project-compact-row"><div><strong>{project.name}</strong><span>{project.openTasks} open tasks</span></div><em>No focus or completions this week</em></div> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function weekday(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${value}T12:00:00`)) }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDuration(seconds: number) { return formatMinutes(Math.round(seconds / 60)) }
function formatVariance(value: number | null) { if (value == null) return '—'; if (value === 0) return 'On estimate'; return value > 0 ? `+${value}%` : `${value}%` }
function formatSessionDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatHistoryDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatEventTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function periodLabel(start: string, end: string) { return start === end ? formatDate(start) : `${formatDate(start)}–${formatDate(end)}` }
