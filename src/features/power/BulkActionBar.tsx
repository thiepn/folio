import { Button } from '../../components/ui/Button'

export function BulkActionBar({ count, onComplete, onToday, onTomorrow, onLater, onTrash, onMore, onClear }: {
  count: number
  onComplete: () => void
  onToday: () => void
  onTomorrow: () => void
  onLater: () => void
  onTrash: () => void
  onMore: () => void
  onClear: () => void
}) {
  if (!count) return null
  return (
    <div className="bulk-action-bar" role="region" aria-label={`${count} selected tasks`}>
      <div className="bulk-action-bar__count"><strong>{count}</strong><span>selected</span></div>
      <div className="bulk-action-bar__actions">
        <Button onClick={onComplete}>Complete</Button>
        <Button onClick={onToday}>Today</Button>
        <Button onClick={onTomorrow}>Tomorrow</Button>
        <Button onClick={onLater}>Later</Button>
        <Button onClick={onMore}>More…</Button>
        <Button variant="ghost" className="bulk-action-bar__danger" onClick={onTrash}>Trash</Button>
      </div>
      <button className="bulk-action-bar__clear" onClick={onClear}>Clear</button>
    </div>
  )
}
