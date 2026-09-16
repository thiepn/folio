import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import type { TaskPreview } from '../../types/ui'

export function TrashDrawer({ open, tasks, onClose, onRestore }: {
  open: boolean
  tasks: TaskPreview[]
  onClose: () => void
  onRestore: (id: string) => void
}) {
  return (
    <Drawer open={open} title="Trash" onClose={onClose}>
      <p className="drawer-intro">Deleted tasks stay recoverable. Linked time blocks are hidden while the task is in trash and return automatically when the task is restored.</p>
      <div className="trash-list">
        {tasks.length ? tasks.map((task) => (
          <div className="trash-item" key={task.id}>
            <div><strong>{task.title}</strong><span>{task.project ?? 'Unassigned'}</span></div>
            <Button onClick={() => onRestore(task.id)}>Restore</Button>
          </div>
        )) : <div className="empty-state">Trash is empty.</div>}
      </div>
    </Drawer>
  )
}
