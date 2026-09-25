import { Icon, type IconName } from '../ui/Icon'
import type { NavView } from '../../types/ui'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { ListEntity, TagEntity } from '../../domain/models'
import type { SmartTaskView } from '../../features/smartViews/queryEngine'

const nav: { view: NavView; label: string; icon: IconName }[] = [
  { view: 'today', label: 'Today', icon: 'home' },
  { view: 'inbox', label: 'Inbox', icon: 'inbox' },
  { view: 'search', label: 'Search', icon: 'search' },
  { view: 'planner', label: 'Planner', icon: 'calendar' },
  { view: 'projects', label: 'Projects', icon: 'folder' },
  { view: 'lists', label: 'Lists', icon: 'folder' },
  { view: 'notes', label: 'Notes', icon: 'review' },
  { view: 'habits', label: 'Habits', icon: 'habit' },
  { view: 'automation', label: 'Automate', icon: 'automation' },
  { view: 'share', label: 'Share', icon: 'share' },
  { view: 'integrations', label: 'Integrations', icon: 'integration' },
  { view: 'sync', label: 'Sync', icon: 'sync' },
  { view: 'matrix', label: 'Matrix', icon: 'matrix' },
  { view: 'analytics', label: 'Analytics', icon: 'analytics' },
  { view: 'review', label: 'Review', icon: 'review' },
]

export function Sidebar({ active, inboxCount, favoriteProjects, favoriteLists, favoriteTags, pinnedSmartViews, onNavigate, onOpenProject, onOpenList, onOpenTag, onOpenSmartView, onAppearance, onData }: {
  active: NavView
  inboxCount: number
  favoriteProjects: ProjectSummary[]
  favoriteLists: ListEntity[]
  favoriteTags: TagEntity[]
  pinnedSmartViews: SmartTaskView[]
  onNavigate: (view: NavView) => void
  onOpenProject: (id: string) => void
  onOpenList: (id: string) => void
  onOpenTag: (id: string) => void
  onOpenSmartView: (id: string) => void
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
          {pinnedSmartViews.length ? <div className="sidebar-favorite-group"><small>Smart Views</small>{pinnedSmartViews.slice(0,6).map((view)=><button key={view.id} onClick={()=>onOpenSmartView(view.id)}><i style={{background:view.color??'var(--accent)'}}/><span>{view.icon?view.icon+' ':''}{view.name}</span></button>)}</div>:null}
          {favoriteTags.length ? <div className="sidebar-favorite-group"><small>Tags</small>{favoriteTags.slice(0,4).map((tag)=><button key={tag.id} onClick={()=>onOpenTag(tag.id)}><i style={{background:tag.color??'var(--muted-2)'}}/><span>#{tag.name}</span></button>)}</div>:null}
          {!favoriteProjects.length && !favoriteLists.length && !favoriteTags.length && !pinnedSmartViews.length ? <span className="favorite-empty">Favorite a list, project, or tag—or pin a Smart View.</span>:null}
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
