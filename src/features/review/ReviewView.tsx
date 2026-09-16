import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import type { FocusSessionPreview, TaskPreview } from '../../types/ui'
import type { ReviewProjectMetric, ReviewSnapshot, ReviewTaskIssue, ReviewTaskReference } from './reviewLogic'

export function ReviewView({ snapshot, recentCompleted = [], recentFocus = [], onOpenTask, onStartReview }: {
  snapshot?: ReviewSnapshot
  recentCompleted?: TaskPreview[]
  recentFocus?: FocusSessionPreview[]
  onOpenTask?: (id: string) => void
  onStartReview: () => void
}) {
  return <>
    <PageHeader kicker="Correct the system" title="Weekly review" subtitle="Use evidence from the week to make the next plan more realistic." action={<Button variant="primary" onClick={onStartReview}>Start weekly review</Button>} />
    {!snapshot ? <div className="empty-state">Calculating review…</div> : <>
      <div className="review-scoreboard">
        <Metric value={snapshot.completionRate == null ? '—' : `${snapshot.completionRate}%`} label="Planned tasks completed" note={`${snapshot.completedPlannedCount} / ${snapshot.plannedThroughTodayCount} through today`} />
        <Metric value={formatDuration(snapshot.focusWeekSeconds)} label="Focused this week" note={`${snapshot.focusSessionCount} sessions`} />
        <Metric value={snapshot.habitAdherence + '%'} label="Habit adherence" note="Week-to-date" />
        <Metric value={String(snapshot.overloadedDays)} label="Overloaded days" note={`${snapshot.committedDays} committed day plans`} warn={snapshot.overloadedDays > 0} />
      </div>

      <section className="review-section review-section--editorial">
        <div className="review-section-head"><div><div className="eyebrow">Planning reality</div><h2>How the week actually behaved</h2></div><span>{formatDate(snapshot.weekStart)}–{formatDate(snapshot.weekEnd)}</span></div>
        <div className="review-day-strip">{snapshot.dayMetrics.map((day) => <DayMetric key={day.date} day={day} />)}</div>
      </section>

      <section className="review-section review-section--editorial">
        <div className="review-section-head"><div><div className="eyebrow">Corrections</div><h2>What deserves attention</h2></div></div>
        <div className="review-recommendation-stack">{snapshot.recommendations.map((item) => <article key={item.id} className={`review-recommendation is-${item.tone}`}><span /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>
      </section>

      <div className="review-two-col">
        <Panel title="Postponed" meta={`${snapshot.postponedTasks.length} tasks`}>
          <IssueList items={snapshot.postponedTasks.slice(0, 6)} empty="No repeatedly postponed tasks." onOpenTask={onOpenTask} />
        </Panel>
        <Panel title="Stale backlog" meta={`${snapshot.staleTasks.length} tasks`}>
          <IssueList items={snapshot.staleTasks.slice(0, 6)} empty="No stale open tasks." onOpenTask={onOpenTask} />
        </Panel>
      </div>

      <section className="review-section review-section--editorial">
        <div className="review-section-head"><div><div className="eyebrow">Time calibration</div><h2>Scheduled, estimated, actual</h2></div></div>
        <div className="review-calibration-grid">
          <Metric value={formatMinutes(snapshot.scheduledWeekMinutes)} label="Task time scheduled" note="Clock time blocks through today" />
          <Metric value={formatDuration(snapshot.focusWeekSeconds)} label="Actual tracked focus" note={snapshot.scheduleExecutionPercent == null ? 'No scheduled task time yet' : `${snapshot.scheduleExecutionPercent}% of scheduled task time`} />
          <Metric value={formatVariance(snapshot.estimateVariancePercent)} label="Estimate calibration" note="Completed tasks with tracked focus" />
        </div>
      </section>

      <section className="review-section review-section--editorial">
        <div className="review-section-head"><div><div className="eyebrow">Allocation</div><h2>Where the week went</h2></div></div>
        <ProjectAllocation projects={snapshot.projectMetrics} />
      </section>

      <div className="review-two-col">
        <Panel title="Next-week deadlines" meta={`${snapshot.nextWeekDeadlines.length}`}>
          <ReferenceList items={snapshot.nextWeekDeadlines.slice(0, 7)} empty="No hard deadlines next week." onOpenTask={onOpenTask} />
        </Panel>
        <Panel title="Neglected projects" meta={`${snapshot.neglectedProjects.length}`}>
          {snapshot.neglectedProjects.length ? <div className="review-project-list">{snapshot.neglectedProjects.slice(0, 7).map((project) => <ProjectRow key={project.projectId} project={project} />)}</div> : <div className="empty-state">No active project with open work was completely neglected this week.</div>}
        </Panel>
      </div>

      <div className="review-two-col">
        <Panel title="Recent focus" meta={`${recentFocus.length}`}>
          {recentFocus.length ? <div className="focus-history-list">{recentFocus.slice(0, 6).map((session) => <button className="focus-history-row" key={session.id} onClick={() => session.taskId && onOpenTask?.(session.taskId)} disabled={!session.taskId}><div><strong>{session.taskTitle}</strong><span>{session.projectName ?? 'No project'} · {formatSessionDate(session.startedAt)}</span></div><div><b>{formatDuration(session.durationSeconds)}</b><span>{session.mode === 'countdown' ? 'Countdown' : 'Stopwatch'}</span></div></button>)}</div> : <div className="empty-state">No finished focus sessions yet.</div>}
        </Panel>
        <Panel title="Recently completed" meta={`${recentCompleted.length}`}>
          {recentCompleted.length ? <div className="review-reference-list">{recentCompleted.slice(0, 6).map((task) => <button key={task.id} onClick={() => onOpenTask?.(task.id)}><div><strong>{task.title}</strong><span>{task.project ?? 'No project'}</span></div><em>Completed</em></button>)}</div> : <div className="empty-state">No completed tasks yet.</div>}
        </Panel>
      </div>
    </>}
  </>
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
