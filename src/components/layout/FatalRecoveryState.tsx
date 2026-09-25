import { useState } from 'react'
import { createBackup } from '../../services/backupService'
import { resetDatabase } from '../../services/databaseService'

function download(value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `folio-emergency-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function FatalRecoveryState({ error }: { error: unknown }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function emergencyBackup() {
    setBusy(true); setMessage('')
    try {
      download(await createBackup())
      setMessage('Emergency snapshot exported. It may be partial if the database itself is damaged.')
    } catch (cause) {
      setMessage(`Could not read enough of IndexedDB to create a snapshot: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally { setBusy(false) }
  }

  async function reset() {
    if (!window.confirm('Delete this origin’s local planner database and recreate an empty Folio workspace? Export an emergency snapshot first if possible.')) return
    if (!window.confirm('This is destructive and cannot be undone from inside the app. Continue with reset?')) return
    setBusy(true)
    try { await resetDatabase(); window.location.reload() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); setBusy(false) }
  }

  return (
    <main className="fatal-state fatal-state--recovery">
      <div>
        <div className="kicker">Local database recovery</div>
        <h1>Folio could not open its workspace.</h1>
        <p>No automatic reset was performed. Retry first; if the error persists, attempt an emergency snapshot before considering a destructive reset.</p>
        <div className="fatal-actions">
          <button onClick={() => window.location.reload()} disabled={busy}>Retry workspace</button>
          <button onClick={() => void emergencyBackup()} disabled={busy}>Export emergency snapshot</button>
          <button className="is-danger" onClick={() => void reset()} disabled={busy}>Reset local database</button>
        </div>
        {message ? <p className="fatal-message">{message}</p> : null}
        <details><summary>Technical detail</summary><pre>{error instanceof Error ? `${error.name}: ${error.message}` : String(error)}</pre></details>
      </div>
    </main>
  )
}
