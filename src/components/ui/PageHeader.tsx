import type { ReactNode } from 'react'

export function PageHeader({ kicker, title, subtitle, action }: {
  kicker: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  )
}
