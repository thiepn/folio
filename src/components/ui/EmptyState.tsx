import type { ReactNode } from 'react'

export function EmptyState({ title, body, action, compact = false }: {
  title: string
  body: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`empty-state empty-state--structured ${compact ? 'is-compact' : ''}`.trim()}>
      <div className="empty-state__copy"><strong>{title}</strong><span>{body}</span></div>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  )
}
