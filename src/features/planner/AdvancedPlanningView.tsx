import { Panel } from '../../components/ui/Panel'
import { formatLocalDate } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import { useAdvancedPlanningData } from '../../hooks/useAdvancedPlanningData'

export function AdvancedPlanningView({ today, onOpenTask }: {
  today: LocalDate
  onOpenTask?: (id: string) => void
}) {
  const data = useAdvancedPlanningData(today)
  if (!data) return <div className="planner-loading">Loading planning forecast…</div>
  return <div className="advanced-planning"><ForecastPanel data={data} onOpenTask={onOpenTask} /></div>
}

function ForecastPanel({ data, onOpenTask }: { data: NonNullable<ReturnType<typeof useAdvancedPlanningData>>; onOpenTask?: (id: string) => void }) {
  const firstSixWeeks = data.forecast.weeks.slice(0, 6)
  const totalPlanned = firstSixWeeks.reduce((sum, week) => sum + week.plannedMinutes, 0)
  const totalCapacity = firstSixWeeks.reduce((sum, week) => sum + week.capacityMinutes, 0)
  const overloaded = firstSixWeeks.reduce((sum, week) => sum + week.overloadedDays, 0)
  return <div className="advanced-planning__stack">
    <section className="forecast-scoreband">
      <div><strong>{formatMinutes(totalPlanned)}</strong><span>planned · 6 weeks</span></div>
      <div><strong>{formatMinutes(totalCapacity)}</strong><span>capacity · 6 weeks</span></div>
      <div className={overloaded ? 'is-warning' : ''}><strong>{overloaded}</strong><span>overloaded days</span></div>
      <div><strong>{data.deadlinePressure.filter((item) => item.pressure !== 'watch').length}</strong><span>pressure deadlines</span></div>
    </section>

    <Panel title="Six-week workload" meta="Planned commitments vs available capacity">
      <div className="forecast-weeks">
        {firstSixWeeks.map((week) => {
          const ratio = week.capacityMinutes ? Math.min(1.25, week.plannedMinutes / week.capacityMinutes) : 0
          return <div className="forecast-week" key={week.start}>
            <div className="forecast-week__head"><strong>{formatLocalDate(week.start, { month: 'short', day: 'numeric' })}–{formatLocalDate(week.end, { month: 'short', day: 'numeric' })}</strong><span>{formatMinutes(week.plannedMinutes)} / {formatMinutes(week.capacityMinutes)}</span></div>
            <div className="forecast-week__bar"><span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
            <div className="forecast-week__meta">
              <span>{week.deadlineCount} deadlines</span>
              <span>{week.overloadedDays ? `${week.overloadedDays} overloaded` : 'No overloaded days'}</span>
              {week.unplannedDeadlineMinutes ? <span className="is-warning">{formatMinutes(week.unplannedDeadlineMinutes)} due work unplanned</span> : null}
            </div>
          </div>
        })}
      </div>
    </Panel>

    <Panel title="Deadline pressure" meta="Urgency and readiness are separate signals">
      {data.deadlinePressure.length ? <div className="deadline-pressure-list">{data.deadlinePressure.slice(0, 12).map((item) => <button key={item.id} onClick={() => onOpenTask?.(item.id)}>
        <span className={`pressure-mark pressure-mark--${item.pressure}`} />
        <div><strong>{item.title}</strong><span>{item.daysLeft < 0 ? `${Math.abs(item.daysLeft)}d overdue` : item.daysLeft === 0 ? 'Due today' : `${item.daysLeft}d left`} · {formatMinutes(item.estimatedMinutes || 0)}{item.blocked ? ' · Blocked' : item.plannedDate ? ` · Planned ${formatLocalDate(item.plannedDate)}` : ' · Unplanned'}</span></div>
        <b>{item.pressure.toUpperCase()}</b>
      </button>)}</div> : <div className="empty-state">No hard deadlines inside the next 30 days.</div>}
    </Panel>

    <Panel title="Project planning" meta="Backlog, readiness and academic pace">
      <div className="project-planning-table">
        {data.projectSummaries.map((project) => <div className="project-planning-row" key={project.id}>
          <div><strong>{project.name}</strong><span>{project.type === 'academic' && project.examDate ? `Exam ${formatLocalDate(project.examDate)}` : project.nextDeadline ? `Next due ${formatLocalDate(project.nextDeadline)}` : 'No hard deadline'}</span></div>
          <div><strong>{formatMinutes(project.backlogMinutes)}</strong><span>backlog</span></div>
          <div><strong>{project.unplannedTasks}</strong><span>unplanned</span></div>
          <div className={project.blockedTasks ? 'is-warning' : ''}><strong>{project.blockedTasks}</strong><span>blocked</span></div>
          {project.type === 'academic' ? <div><strong>{project.estimatedMinutesPerWeekToExam ? formatMinutes(project.estimatedMinutesPerWeekToExam) : '—'}</strong><span>backlog / week to exam{project.weeklyTargetMinutes ? ` · target ${formatMinutes(project.weeklyTargetMinutes)}` : ''}</span></div> : <div><strong>{project.dueNext30}</strong><span>due in 30d</span></div>}
        </div>)}
      </div>
    </Panel>
  </div>
}

function formatMinutes(minutes: number) {
  if (!minutes) return '0m'
  const hours = Math.floor(minutes / 60), remainder = minutes % 60
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`
}
