import { useEffect } from 'react'
import { Drawer } from '../ui/Drawer'
import { Icon, type IconName } from '../ui/Icon'
import type { NavView } from '../../types/ui'

const destinations: { view: NavView; label: string; note: string; icon: IconName }[] = [
  { view: 'projects', label: 'Projects', note: 'Work, courses and areas of responsibility', icon: 'folder' },
  { view: 'habits', label: 'Habits', note: 'Rhythms, flexible schedules and weekly adherence', icon: 'habit' },
  { view: 'review', label: 'Review', note: 'Planning feedback and weekly review', icon: 'review' },
]

export function MobileMoreSheet({ open, active, focusActive, onClose, onNavigate, onFocus, onAppearance, onData }: {
  open: boolean
  active: NavView
  focusActive: boolean
  onClose: () => void
  onNavigate: (view: NavView) => void
  onFocus: () => void
  onAppearance: () => void
  onData: () => void
}) {
  useEffect(() => {
    if (!open) return
    const media = window.matchMedia('(max-width: 900px)')
    const sync = () => { if (!media.matches) onClose() }
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [open, onClose])

  function navigate(view: NavView) {
    onClose()
    onNavigate(view)
  }

  return (
    <Drawer open={open} title="More" onClose={onClose} className="mobile-more-overlay">
      <div className="mobile-more-list">
        {destinations.map((item) => (
          <button key={item.view} className={active === item.view ? 'is-active' : ''} aria-current={active === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}>
            <span className="mobile-more-list__icon"><Icon name={item.icon} /></span>
            <span><strong>{item.label}</strong><small>{item.note}</small></span>
            <Icon name="chevronRight" />
          </button>
        ))}
      </div>
      <div className="mobile-more-section">
        <span className="eyebrow">Workspace</span>
        <button onClick={() => { onClose(); onFocus() }}><Icon name="focus" /><span><strong>{focusActive ? 'Resume focus' : 'Focus'}</strong><small>{focusActive ? 'A session is still active' : 'Start a distraction-free session'}</small></span></button>
        <button onClick={() => { onClose(); onAppearance() }}><Icon name="settings" /><span><strong>Appearance</strong><small>Accent, intensity and interface settings</small></span></button>
        <button onClick={() => { onClose(); onData() }}><Icon name="download" /><span><strong>Data & storage</strong><small>Backup, interoperability and local storage</small></span></button>
      </div>
    </Drawer>
  )
}
