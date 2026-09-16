import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, meta, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title ? (
        <header className="panel__header">
          <span className="panel__title">{title}</span>
          {meta ? <span className="panel__meta">{meta}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
