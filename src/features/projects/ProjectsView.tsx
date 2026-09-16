import type { CSSProperties } from 'react'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import type { ProjectSummary } from '../../repositories/projectRepository'

type ProjectStyle = CSSProperties & { '--project-color': string }

export function ProjectsView({ projects, unassignedCount, onCreate, onOpen, onArchived }: {
  projects: ProjectSummary[]
  unassignedCount: number
  onCreate: () => void
  onOpen: (id: string) => void
  onArchived: () => void
}) {
  return (
    <>
      <PageHeader
        kicker="Work in context"
        title="Projects"
        subtitle="Keep courses, outcomes, and responsibilities in context without turning organization into work."
        action={<div className="header-actions"><Button onClick={onArchived}>Archived</Button><Button variant="primary" icon="plus" onClick={onCreate}>Project</Button></div>}
      />
      {!projects.length && !unassignedCount ? <EmptyState title="No projects yet" body="Projects are optional context, not a prerequisite for capturing work. Create one when several tasks belong to the same outcome or responsibility." action={<Button variant="primary" icon="plus" onClick={onCreate}>Create first project</Button>} /> : null}

      <div className="project-grid">
        {projects.map((project) => (
          <button className="project-card project-card--button" key={project.id} onClick={() => onOpen(project.id)} style={{ '--project-color': project.color ?? 'var(--muted-2)' } as ProjectStyle}>
            <span className="project-card__rule" />
            <div className="project-card__top"><div className="eyebrow">{project.type === 'academic' ? 'Academic' : 'Project'}</div>{project.favorite ? <span className="project-favorite" aria-label="Favorite">★</span> : null}</div>
            <h2>{project.icon ? <span className="project-icon-label">{project.icon}</span> : null}{project.name}</h2>
            <p>{project.type === 'academic' && project.examDate ? `Exam · ${formatDate(project.examDate)}` : project.description || 'Active project'}</p>
            <div className="project-card__stats">
              <div><strong>{project.openTaskCount}</strong><span>Open</span></div>
              <div><strong>{project.completedTaskCount}</strong><span>Done</span></div>
              <div><strong>{project.weeklyTargetMinutes ? formatMinutes(project.weeklyTargetMinutes) : project.nextDeadline ? formatDate(project.nextDeadline) : '—'}</strong><span>{project.weeklyTargetMinutes ? 'Weekly target' : 'Next due'}</span></div>
            </div>
          </button>
        ))}
        {projects.length || unassignedCount ? <button className="project-card project-card--button project-card--unassigned" onClick={() => onOpen('__unassigned__')}>
          <span className="project-card__rule" />
          <div className="eyebrow">Organization</div>
          <h2>No project</h2>
          <p>Open tasks without a project.</p>
          <div className="project-card__stats"><div><strong>{unassignedCount}</strong><span>Open</span></div><div><strong>—</strong><span>Target</span></div><div><strong>Review</strong><span>Status</span></div></div>
        </button> : null}
      </div>
    </>
  )
}

function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)) }
