import { useEffect } from 'react'
import type { UndoableMutation } from '../../services/undo'

export function UndoToast({ action, onUndo, onDismiss }: {
  action: UndoableMutation | null
  onUndo: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!action) return
    const timeout = window.setTimeout(onDismiss, 6000)
    return () => window.clearTimeout(timeout)
  }, [action, onDismiss])
  if (!action) return null
  return (
    <div className="undo-toast" role="status">
      <span>{action.message}</span>
      <button onClick={onUndo}>Undo</button>
      <button className="undo-toast__close" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  )
}
