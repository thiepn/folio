import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

export function Topbar({ title, meta, onSearch, onAppearance, onAdd, onFocus, focusActive = false }: {
  title: string
  meta: string
  onSearch: () => void
  onAppearance: () => void
  onAdd: () => void
  onFocus: () => void
  focusActive?: boolean
}) {
  return (
    <header className="topbar">
      <div className="topbar__context" aria-label={`Current workspace: ${title}`}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <button type="button" className="topbar__search" onClick={onSearch} aria-label="Search tasks, projects, habits, and commands">
        <Icon name="search" />
        <span>Search</span>
        <kbd>Ctrl/⌘ K</kbd>
      </button>
      <Button icon="focus" variant={focusActive ? 'primary' : 'outline'} onClick={onFocus}>{focusActive ? 'Resume focus' : 'Focus'}</Button>
      <Button icon="plus" variant="primary" onClick={onAdd}>Add</Button>
      <IconButton icon="settings" label="Appearance" className="topbar__appearance" onClick={onAppearance} />
    </header>
  )
}
