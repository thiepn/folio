import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import type { ProjectSummary } from '../../repositories/projectRepository'

export function ArchivedProjectsDrawer({ open, projects, onClose, onRestore }: {
  open: boolean
  projects: ProjectSummary[]
  onClose: () => void
  onRestore: (id: string) => void
}) {
  return (
    <Drawer open={open} title="Archived projects" onClose={onClose}>
      <div className="archive-project-list">
        {projects.length ? projects.map((project) => <div className="archive-project-row" key={project.id}>
          <span className="project-dot" style={{ background: project.color ?? 'var(--muted-2)' }} />
          <div><strong>{project.name}</strong><span>{project.openTaskCount} open tasks remain assigned</span></div>
          <Button onClick={() => onRestore(project.id)}>Restore</Button>
        </div>) : <div className="empty-state">No archived projects.</div>}
      </div>
    </Drawer>
  )
}
