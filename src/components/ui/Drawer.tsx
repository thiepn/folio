import { useId, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

export function Drawer({ open, title, onClose, children, className = '' }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  useOverlayScrollLock(open)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useDialogFocusTrap(open, dialogRef, onClose)
  if (!open) return null
  return (
    <div className={`overlay ${className}`.trim()} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer__header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  )
}
