import { Icon, type IconName } from '../ui/Icon'
import type { NavView } from '../../types/ui'

const primaryNav: { view: NavView; label: string; icon: IconName }[] = [
  { view: 'today', label: 'Today', icon: 'home' },
  { view: 'inbox', label: 'Inbox', icon: 'inbox' },
  { view: 'planner', label: 'Plan', icon: 'calendar' },
]

export function MobileNav({ active, onNavigate, onAdd, onMore }: {
  active: NavView
  onNavigate: (view: NavView) => void
  onAdd: () => void
  onMore: () => void
}) {
  const moreActive = active === 'projects' || active === 'lists' || active === 'notes' || active === 'habits' || active === 'analytics' || active === 'review'
  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {primaryNav.slice(0, 2).map((item) => (
        <button key={item.view} className={active === item.view ? 'is-active' : ''} aria-current={active === item.view ? 'page' : undefined} onClick={() => onNavigate(item.view)}>
          <Icon name={item.icon} /><span>{item.label}</span>
        </button>
      ))}
      <button className="mobile-nav__add" onClick={onAdd} aria-label="Add task or capture"><span><Icon name="plus" /></span><em>Add</em></button>
      <button className={active === 'planner' ? 'is-active' : ''} aria-current={active === 'planner' ? 'page' : undefined} onClick={() => onNavigate('planner')}>
        <Icon name="calendar" /><span>Plan</span>
      </button>
      <button className={moreActive ? 'is-active' : ''} aria-current={moreActive ? 'page' : undefined} onClick={onMore} aria-haspopup="dialog">
        <Icon name="more" /><span>More</span>
      </button>
    </nav>
  )
}
