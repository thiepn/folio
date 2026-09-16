import { useId, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { useOverlayScrollLock } from '../../hooks/useOverlayScrollLock'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

export function Modal({ open, title, onClose, children, footer, className = '' }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  useOverlayScrollLock(open)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useDialogFocusTrap(open, dialogRef, onClose)
  if (!open) return null
  return (
    <div className="overlay overlay--center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
