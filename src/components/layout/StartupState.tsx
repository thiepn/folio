import { useEffect, useState } from 'react'

export function StartupState() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4_000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="fatal-state fatal-state--recovery" id="main-content" aria-busy="true">
      <div>
        <div className="kicker">Opening workspace</div>
        <h1>Opening Folio…</h1>
        <p>
          {slow
            ? 'Startup is taking longer than expected. Another Folio tab may still be holding the local database open.'
            : 'Loading your local workspace.'}
        </p>
        {slow ? (
          <div className="fatal-actions">
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
