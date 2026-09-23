import { useEffect, useState, type ChangeEvent } from 'react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { getDatabaseHealth, loadDemoWorkspace, resetDatabase, type DatabaseHealth } from '../../services/databaseService'
import { downloadSafetyBackup, requestPersistentStorage, setBackupReminderDays, verifyDatabaseIntegrity } from '../../services/storageSafetyService'
import { useStorageSafety } from '../../hooks/useStorageSafety'
import { usePwaState } from '../../hooks/usePwaState'
import { pwaService } from '../../services/pwaService'
import { runRuntimeDiagnostics, type RuntimeDiagnosticsReport } from '../../services/runtimeDiagnosticsService'

function bytes(value?: number) {
  if (value == null) return 'Unknown'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function dateLabel(value?: string) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown'
}

export function DataDrawer({ open, onClose, onOpenImport, onOpenPatch, onOpenInterop }: { open: boolean; onClose: () => void; onOpenImport: () => void; onOpenPatch: () => void; onOpenInterop: () => void }) {
  const [health, setHealth] = useState<DatabaseHealth | null>(null)
  const [busy, setBusy] = useState(false)
  const [integrity, setIntegrity] = useState<{ ok: boolean; checkedAt?: string; message: string } | null>(null)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnosticsReport | null>(null)
  const { status: storage, refresh: refreshStorage } = useStorageSafety()
  const pwa = usePwaState()

  useEffect(() => {
    if (!open) return
    void getDatabaseHealth().then(setHealth)
    refreshStorage()
  }, [open, refreshStorage])

  async function exportBackup() {
    setBusy(true)
    try { await downloadSafetyBackup() }
    finally { setBusy(false) }
  }

  async function persist() {
    setBusy(true)
    try { await requestPersistentStorage(); refreshStorage(); setHealth(await getDatabaseHealth()) }
    finally { setBusy(false) }
  }

  async function verify() {
    setBusy(true); setIntegrity(null)
    try {
      const result = await verifyDatabaseIntegrity()
      setIntegrity({ ok: true, checkedAt: result.checkedAt, message: result.warnings.length ? result.warnings.join(' ') : `${result.entityCount} stored rows validated.` })
    } catch (error) {
      setIntegrity({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  async function diagnose() {
    setBusy(true)
    try { setDiagnostics(await runRuntimeDiagnostics()) }
    catch (error) { setIntegrity({ ok: false, message: error instanceof Error ? error.message : String(error) }) }
    finally { setBusy(false) }
  }

  async function loadDemo() {
    setBusy(true)
    try {
      setHealth(await loadDemoWorkspace())
    } catch (error) {
      setIntegrity({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  async function reset() {
    if (!window.confirm('Reset the local database to a blank workspace? Export a backup first.')) return
    if (!window.confirm('This permanently deletes the current local planner database. Continue?')) return
    setBusy(true)
    try {
      await resetDatabase()
      setHealth(await getDatabaseHealth())
      refreshStorage()
    } finally { setBusy(false) }
  }

  const workspaceEmpty = Boolean(health && !health.counts.tasks && !health.counts.projects && !health.counts.habits && !health.counts.timeBlocks && !health.counts.dailyPlans && !health.counts.dailyPlanItems && !health.counts.focusSessions && !health.counts.recurringSeries && !health.counts.reminders && !health.counts.reminderOccurrences && !health.counts.lists && !health.counts.sections && !health.counts.tags && !health.counts.notes && !health.counts.attachments)

  return (
    <Drawer open={open} title="Data & storage" onClose={onClose}>
      <section className="setting-group">
        <div className="setting-label">IndexedDB</div>
        <dl className="data-health">
          <div><dt>Schema</dt><dd>v{health?.schemaVersion ?? '…'}</dd></div>
          <div><dt>Tasks</dt><dd>{health?.counts.tasks ?? '…'}</dd></div>
          <div><dt>Projects</dt><dd>{health?.counts.projects ?? '…'}</dd></div>
          <div><dt>Habits</dt><dd>{health?.counts.habits ?? '…'}</dd></div>
          <div><dt>Time blocks</dt><dd>{health?.counts.timeBlocks ?? '…'}</dd></div>
          <div><dt>Daily plans</dt><dd>{health?.counts.dailyPlans ?? '…'}</dd></div>
          <div><dt>Focus sessions</dt><dd>{health?.counts.focusSessions ?? '…'}</dd></div>
          <div><dt>AI imports</dt><dd>{health?.counts.importBatches ?? '…'}</dd></div>
          <div><dt>AI patches</dt><dd>{health?.counts.patchBatches ?? '…'}</dd></div>
          <div><dt>Calendar imports</dt><dd>{health?.counts.calendarImportBatches ?? '…'}</dd></div>
          <div><dt>Reminders</dt><dd>{health?.counts.reminders ?? '…'}</dd></div>
          <div><dt>Reminder events</dt><dd>{health?.counts.reminderOccurrences ?? '…'}</dd></div>
          <div><dt>Folders</dt><dd>{health?.counts.folders ?? '…'}</dd></div>
          <div><dt>Lists</dt><dd>{health?.counts.lists ?? '…'}</dd></div>
          <div><dt>Sections</dt><dd>{health?.counts.sections ?? '…'}</dd></div>
          <div><dt>Tags</dt><dd>{health?.counts.tags ?? '…'}</dd></div>
          <div><dt>Notes</dt><dd>{health?.counts.notes ?? '…'}</dd></div>
          <div><dt>Attachments</dt><dd>{health?.counts.attachments ?? '…'}</dd></div>
        </dl>
        <div className="storage-inline-action">
          <Button onClick={() => void verify()} disabled={busy}>Verify database</Button>
          {integrity ? <span className={integrity.ok ? 'is-ok' : 'is-error'}>{integrity.ok ? 'Healthy' : 'Problem'} · {integrity.message}</span> : <span>Read-only integrity check; no data is modified.</span>}
        </div>
      </section>

      {workspaceEmpty ? <section className="setting-group">
        <div className="setting-label">Sample workspace</div>
        <p className="phase-note">Fresh installs now start blank. Load the optional sample workspace only if you want to explore the interface with realistic projects, tasks, habits, and time blocks.</p>
        <Button onClick={() => void loadDemo()} disabled={busy}>Load sample workspace</Button>
      </section> : null}

      <section className="setting-group">
        <div className="setting-label">Reliability & performance</div>
        <div className="storage-inline-action">
          <Button onClick={() => void diagnose()} disabled={busy}>Run reliability check</Button>
          <span>Read-only integrity + core query probe.</span>
        </div>
        {diagnostics ? <dl className="data-health">
          <div><dt>Validated rows</dt><dd>{diagnostics.integrityRows}</dd></div>
          <div><dt>Query probe</dt><dd>{Math.round(diagnostics.queryProbeMs)} ms</dd></div>
          <div><dt>Rows queried</dt><dd>{diagnostics.queriedRows}</dd></div>
          <div><dt>Rating</dt><dd>{diagnostics.queryRating}</dd></div>
          <div><dt>Reduced motion</dt><dd>{diagnostics.reducedMotion ? 'Enabled' : 'No preference'}</dd></div>
          <div><dt>Compatibility</dt><dd>{diagnostics.compatibilityWarnings.length ? `${diagnostics.compatibilityWarnings.length} warning${diagnostics.compatibilityWarnings.length === 1 ? '' : 's'}` : 'Core supported'}</dd></div>
        </dl> : null}
        {diagnostics?.queryRating === 'slow' ? <p className="storage-error">The local query probe exceeded 600 ms. Export a backup and include database size when reporting performance problems.</p> : null}
        {diagnostics?.integrityWarnings.map((warning) => <p className="phase-note" key={warning}>{warning}</p>)}
      </section>

      <section className="setting-group">
        <div className="setting-label">Offline app</div>
        <dl className="data-health">
          <div><dt>Network</dt><dd>{navigator.onLine ? 'Online' : 'Offline'}</dd></div>
          <div><dt>App shell</dt><dd>{!pwa.supported ? 'Unsupported' : pwa.offlineReady ? 'Offline ready' : pwa.registered ? 'Preparing' : import.meta.env.PROD ? 'Registering' : 'Build only'}</dd></div>
          <div><dt>Installed</dt><dd>{pwa.installed ? 'Standalone' : pwa.installAvailable ? 'Available' : 'Browser tab'}</dd></div>
          <div><dt>Update</dt><dd>{pwa.updateAvailable ? 'Ready' : pwa.checking ? 'Checking…' : 'Current'}</dd></div>
        </dl>
        <div className="storage-button-row">
          {pwa.installAvailable ? <Button variant="primary" onClick={() => void pwaService.promptInstall()}>Install app</Button> : null}
          {pwa.updateAvailable ? <Button variant="primary" onClick={() => void pwaService.applyUpdate()}>Update now</Button> : <Button onClick={() => void pwaService.checkForUpdate()} disabled={!pwa.registered || pwa.checking}>Check for update</Button>}
        </div>
        <p className="phase-note">Production builds cache the exact hashed app shell. Updates precache in the background but never activate or reload until you choose Update now. On browsers without an install prompt, use the browser’s Add to Home Screen / Install command.</p>
        {pwa.error ? <p className="storage-error">Service worker: {pwa.error}</p> : null}
      </section>

      <section className="setting-group">
        <div className="setting-label">Storage safety</div>
        <dl className="data-health">
          <div><dt>Persistence</dt><dd>{storage?.persisted == null ? 'Unknown' : storage.persisted ? 'Protected' : 'Best effort'}</dd></div>
          <div><dt>Usage</dt><dd>{bytes(storage?.usageBytes)}</dd></div>
          <div><dt>Quota</dt><dd>{bytes(storage?.quotaBytes)}</dd></div>
          <div><dt>Quota used</dt><dd>{storage?.usageRatio == null ? 'Unknown' : `${Math.round(storage.usageRatio * 100)}%`}</dd></div>
          <div><dt>Last backup</dt><dd>{dateLabel(storage?.lastBackupAt)}</dd></div>
          <div><dt>Backup reminder</dt><dd>{storage?.reminderDays ?? 7} days</dd></div>
        </dl>
        <div className="storage-button-row">
          {!storage?.persisted && storage?.persistSupported ? <Button variant="primary" onClick={() => void persist()} disabled={busy}>Protect local storage</Button> : null}
          <Button onClick={() => void exportBackup()} disabled={busy}>Export backup now</Button>
        </div>
        <label className="storage-reminder-select"><span>Reminder cadence</span><select value={storage?.reminderDays ?? 7} onChange={(event: ChangeEvent<HTMLSelectElement>) => void setBackupReminderDays(Number(event.target.value))}><option value={3}>Every 3 days</option><option value={7}>Every 7 days</option><option value={14}>Every 14 days</option><option value={30}>Every 30 days</option></select></label>
        <p className="phase-note">Persistent storage asks the browser not to evict this origin under storage pressure. Browser policy still decides whether the request is granted, so JSON backups remain the disaster-recovery layer.</p>
      </section>

      <section className="setting-group data-actions">
        <div className="setting-label">ChatGPT bridge</div>
        <Button variant="primary" onClick={() => { onClose(); onOpenImport() }}>Import new plan</Button>
        <Button onClick={() => { onClose(); onOpenPatch() }}>Patch existing planner data</Button>
        <p className="phase-note">Nothing is sent automatically. Import is CREATE-only; Patch requires stable IDs, exact timestamps, Preview, and an atomic Apply.</p>
      </section>
      <section className="setting-group data-actions">
        <div className="setting-label">Portability</div>
        <Button variant="primary" onClick={() => { onClose(); onOpenInterop() }}>Backup, restore & calendar</Button>
        <p className="phase-note">Validated restore, selective JSON export, .ics import/export, duplicate protection, and calendar-import history live in the portability workspace.</p>
      </section>
      <section className="setting-group data-actions">
        <div className="setting-label">Danger zone</div>
        <Button onClick={() => void reset()} disabled={busy}>Reset to blank workspace</Button>
      </section>
    </Drawer>
  )
}
