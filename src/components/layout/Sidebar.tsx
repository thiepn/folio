import { Icon, type IconName } from '../ui/Icon'
import type { NavView } from '../../types/ui'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { ListEntity } from '../../domain/models'

const nav: { view: NavView; label: string; icon: IconName }[] = [
  { view: 'today', label: 'Today', icon: 'home' },
  { view: 'inbox', label: 'Inbox', icon: 'inbox' },
  { view: 'planner', label: 'Planner', icon: 'calendar' },
  { view: 'projects', label: 'Projects', icon: 'folder' },
  { view: 'lists', label: 'Lists', icon: 'folder' },
  { view: 'habits', label: 'Habits', icon: 'habit' },
  { view: 'review', label: 'Review', icon: 'review' },
]

export function Sidebar({ active, inboxCount, favoriteProjects, favoriteLists, onNavigate, onOpenProject, onOpenList, onAppearance, onData }: {
  active: NavView
  inboxCount: number
  favoriteProjects: ProjectSummary[]
  favoriteLists: ListEntity[]
  onNavigate: (view: NavView) => void
  onOpenProject: (id: string) => void
  onOpenList: (id: string) => void
  onAppearance: () => void
  onData: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true" />
        <span className="brand__wordmark"><strong>Folio</strong><small>Personal workspace</small></span>
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {nav.map((item) => (
          <button key={item.view} className={active === item.view ? 'is-active' : ''} aria-current={active === item.view ? 'page' : undefined} onClick={() => onNavigate(item.view)}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.view === 'inbox' && inboxCount > 0 ? <span className="sidebar-nav__badge">{inboxCount}</span> : null}
          </button>
        ))}
      </nav>

      <section className="sidebar-section">
        <div className="eyebrow">Favorites</div>
        <div className="favorite-list favorite-list--buttons">
          {favoriteLists.length ? <div className="sidebar-favorite-group"><small>Lists</small>{favoriteLists.slice(0,4).map((list)=><button key={list.id} onClick={()=>onOpenList(list.id)}><i style={{background:list.color??'var(--accent)'}}/><span>{list.name}</span></button>)}</div>:null}
          {favoriteProjects.length ? <div className="sidebar-favorite-group"><small>Projects</small>{favoriteProjects.slice(0,4).map((project) => <button key={project.id} onClick={() => onOpenProject(project.id)}><i style={{ background: project.color ?? 'var(--accent)' }} /><span>{project.name}</span></button>)}</div> : null}
          {!favoriteProjects.length && !favoriteLists.length ? <span className="favorite-empty">Favorite a list or project to pin it here.</span>:null}
        </div>
      </section>

      <div className="sidebar__footer">
        <div className="sidebar__local-status"><span className="sidebar__status-dot" />Local-first workspace</div>
        <button onClick={onData}><Icon name="download" /><span>Data & storage</span></button>
        <button onClick={onAppearance}><Icon name="settings" /><span>Appearance</span></button>
      </div>
    </aside>
  )
}
