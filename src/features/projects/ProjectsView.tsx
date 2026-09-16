import { useMemo, useState, type CSSProperties } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import type { ProjectSummary } from '../../repositories/projectRepository'

type ProjectStyle = CSSProperties & { '--project-color': string }
type ProjectFilter = 'active' | 'on-hold' | 'completed' | 'all'

export function ProjectsView({ projects, unassignedCount, onCreate, onOpen, onArchived }: {
  projects: ProjectSummary[]
  unassignedCount: number
  onCreate: () => void
  onOpen: (id: string) => void
  onArchived: () => void
}) {
  const [filter, setFilter] = useState<ProjectFilter>('active')
  const visible = useMemo(() => filter === 'all' ? projects : projects.filter((project) => project.status === filter), [projects, filter])

  return (
    <>
      <PageHeader
        kicker="Work in context"
        title="Projects"
        subtitle="Track outcomes, next actions, milestones, and actual progress without turning organization into work."
        action={<div className="header-actions"><Button onClick={onArchived}>Archived</Button><Button variant="primary" icon="plus" onClick={onCreate}>Project</Button></div>}
      />
      {!projects.length && !unassignedCount ? <EmptyState title="No projects yet" body="Projects are optional context, not a prerequisite for capturing work. Create one when several tasks belong to the same outcome or responsibility." action={<Button variant="primary" icon="plus" onClick={onCreate}>Create first project</Button>} /> : null}

      {projects.length ? <div className="project-filter-row">
        {(['active', 'on-hold', 'completed', 'all'] as ProjectFilter[]).map((value) => <button className={filter === value ? 'is-active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'on-hold' ? 'On hold' : value[0].toUpperCase() + value.slice(1)}</button>)}
      </div> : null}

      <div className="project-grid">
        {visible.map((project) => (
          <button className="project-card project-card--button project-card--workflow" key={project.id} onClick={() => onOpen(project.id)} style={{ '--project-color': project.color ?? 'var(--muted-2)' } as ProjectStyle}>
            <span className="project-card__rule" />
            <div className="project-card__top"><div className="eyebrow">{project.type === 'academic' ? 'Academic' : 'Project'}</div><div className="project-card__badges"><span className={`project-status project-status--${project.status}`}>{project.status === 'on-hold' ? 'On hold' : project.status === 'completed' ? 'Completed' : 'Active'}</span>{project.favorite ? <span className="project-favorite" aria-label="Favorite">★</span> : null}</div></div>
            <h2>{project.icon ? <span className="project-icon-label">{project.icon}</span> : null}{project.name}</h2>
            <p>{project.description || 'Active project'}</p>
            <div className="project-card__progress"><div><span>{project.progressPercent}%</span><small>{project.completedTaskCount}/{project.openTaskCount + project.completedTaskCount} tasks</small></div><div className="project-progress-track"><span style={{ width: `${project.progressPercent}%` }} /></div></div>
            <div className="project-card__next"><span>Next</span><strong>{project.nextActionTitle ?? 'No ready action'}</strong></div>
            <div className="project-card__stats">
              <div><strong>{project.openTaskCount}</strong><span>Open</span></div>
              <div><strong>{project.milestoneTotal ? `${project.milestoneCompleteCount}/${project.milestoneTotal}` : '—'}</strong><span>Milestones</span></div>
              <div><strong>{project.deadline ? formatDate(project.deadline) : project.weeklyTargetMinutes ? formatMinutes(project.weeklyTargetMinutes) : project.nextDeadline ? formatDate(project.nextDeadline) : '—'}</strong><span>{project.deadline ? 'Project due' : project.weeklyTargetMinutes ? 'Weekly target' : 'Next due'}</span></div>
            </div>
          </button>
        ))}
        {(projects.length || unassignedCount) && (filter === 'active' || filter === 'all') ? <button className="project-card project-card--button project-card--unassigned" onClick={() => onOpen('__unassigned__')}>
          <span className="project-card__rule" />
          <div className="eyebrow">Organization</div>
          <h2>No project</h2>
          <p>Open tasks without a project.</p>
          <div className="project-card__stats"><div><strong>{unassignedCount}</strong><span>Open</span></div><div><strong>—</strong><span>Target</span></div><div><strong>Review</strong><span>Status</span></div></div>
        </button> : null}
      </div>
      {projects.length && !visible.length ? <div className="empty-state">No projects match this status.</div> : null}
    </>
  )
}

function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)) }
