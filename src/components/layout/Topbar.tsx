import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

export function Topbar({ title, meta, onSearch, onAppearance, onAdd, onFocus, onReminders, reminderCount = 0, focusActive = false }: {
  title: string
  meta: string
  onSearch: () => void
  onAppearance: () => void
  onAdd: () => void
  onFocus: () => void
  onReminders: () => void
  reminderCount?: number
  focusActive?: boolean
}) {
  return (
    <header className="topbar">
      <div className="topbar__context" aria-label={`Current workspace: ${title}`}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <button type="button" className="topbar__search" onClick={onSearch} aria-label="Search Folio or run a command">
        <Icon name="search" />
        <span>Search or command</span>
        <kbd>Ctrl/⌘ K · /</kbd>
      </button>
      <div className="topbar__reminder-wrap"><IconButton icon="bell" label={reminderCount ? `${reminderCount} due reminder${reminderCount === 1 ? '' : 's'}` : 'Reminders'} className={reminderCount ? 'has-reminders' : ''} onClick={onReminders} />{reminderCount ? <span className="topbar__reminder-badge">{reminderCount > 99 ? '99+' : reminderCount}</span> : null}</div>
      <Button icon="focus" variant={focusActive ? 'primary' : 'outline'} onClick={onFocus}>{focusActive ? 'Resume focus' : 'Focus'}</Button>
      <Button icon="plus" variant="primary" onClick={onAdd}>Add</Button>
      <IconButton icon="settings" label="Appearance" className="topbar__appearance" onClick={onAppearance} />
    </header>
  )
}
