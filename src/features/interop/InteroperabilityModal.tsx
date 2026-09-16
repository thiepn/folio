import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import { addLocalDays, dateTimeForDisplay, formatLocalDate, localDateKey } from '../../domain/date'
import type { ProjectEntity } from '../../domain/models'
import { createBackup, previewBackup, restoreBackup, type BackupPreview } from '../../services/backupService'
import { createSelectiveExport } from '../../services/selectiveExportService'
import { applyCalendarImport, calendarImportDay, exportCalendarIcs, listCalendarImportBatches, previewCalendarImport, revertCalendarImport, type CalendarImportPreview } from '../../services/calendarInteropService'
import type { UndoableMutation } from '../../services/undo'
import { recordBackupExport } from '../../services/storageSafetyService'

function downloadText(text: string, fileName: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function safeFileDate() { return new Date().toISOString().slice(0, 10) }

export function InteroperabilityModal({ open, projects, onClose, onUndo }: {
  open: boolean
  projects: ProjectEntity[]
  onClose: () => void
  onUndo: (mutation: UndoableMutation) => void
}) {
  const today = localDateKey()
  const [tab, setTab] = useState<'backup' | 'selection' | 'calendar'>('backup')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null)
  const [restoreAck, setRestoreAck] = useState(false)
  const [selectionProject, setSelectionProject] = useState('')
  const [selectionFrom, setSelectionFrom] = useState('')
  const [selectionThrough, setSelectionThrough] = useState('')
  const [selectionCompleted, setSelectionCompleted] = useState(true)
  const [calendarFrom, setCalendarFrom] = useState(today)
  const [calendarThrough, setCalendarThrough] = useState(addLocalDays(today, 30))
  const [calendarProject, setCalendarProject] = useState('')
  const [calendarEvents, setCalendarEvents] = useState(true)
  const [icsText, setIcsText] = useState('')
  const [icsFileName, setIcsFileName] = useState<string | undefined>()
  const [icsPreview, setIcsPreview] = useState<CalendarImportPreview | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listCalendarImportBatches>>>([])

  const activeProjects = useMemo(() => projects.filter((project) => !project.archived), [projects])

  useEffect(() => {
    if (!open) return
    setMessage('')
    void listCalendarImportBatches().then(setHistory)
  }, [open])

  async function exportFullBackup() {
    setBusy(true); setMessage('')
    try {
      const backup = await createBackup()
      downloadText(JSON.stringify(backup, null, 2), `folio-backup-${safeFileDate()}.json`, 'application/json')
      await recordBackupExport()
      setMessage('Full backup exported.')
    } finally { setBusy(false) }
  }

  async function loadBackupFile(file?: File) {
    if (!file) return
    setBusy(true); setMessage(''); setRestorePreview(null); setRestoreAck(false)
    try {
      const parsed = JSON.parse(await file.text())
      setRestorePreview(previewBackup(parsed))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  async function applyRestore() {
    if (!restorePreview || !restoreAck) return
    setBusy(true); setMessage('')
    try {
      // Disaster-recovery invariant: automatically export the current database before replacement.
      const safety = await createBackup()
      downloadText(JSON.stringify(safety, null, 2), `folio-pre-restore-${safeFileDate()}.json`, 'application/json')
      await restoreBackup(restorePreview)
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  async function exportSelection() {
    setBusy(true); setMessage('')
    try {
      const envelope = await createSelectiveExport({
        projectId: selectionProject || undefined,
        fromDate: selectionFrom || undefined,
        throughDate: selectionThrough || undefined,
        includeCompleted: selectionCompleted,
      })
      downloadText(JSON.stringify(envelope, null, 2), `folio-selection-${safeFileDate()}.json`, 'application/json')
      setMessage('Selective JSON export created.')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  async function exportIcs() {
    setBusy(true); setMessage('')
    try {
      const text = await exportCalendarIcs({ fromDate: calendarFrom, throughDate: calendarThrough, projectId: calendarProject || undefined, includeStandaloneEvents: calendarEvents, calendarName: calendarProject ? activeProjects.find((p) => p.id === calendarProject)?.name : 'Folio' })
      downloadText(text, `folio-calendar-${calendarFrom}-${calendarThrough}.ics`, 'text/calendar;charset=utf-8')
      setMessage('Calendar export created. Only exact Time Blocks are exported; unscheduled Tasks remain planner data.')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  async function previewIcs(source: 'ics-file' | 'ics-paste' = 'ics-paste') {
    if (!icsText.trim()) return
    setBusy(true); setMessage(''); setIcsPreview(null)
    try { setIcsPreview(await previewCalendarImport(icsText, source, icsFileName)) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  async function loadIcsFile(file?: File) {
    if (!file) return
    setIcsFileName(file.name)
    const text = await file.text()
    setIcsText(text)
    setBusy(true); setMessage('')
    try { setIcsPreview(await previewCalendarImport(text, 'ics-file', file.name)) }
    catch (error) { setIcsPreview(null); setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  async function applyIcs() {
    if (!icsPreview) return
    setBusy(true); setMessage('')
    try {
      const undo = await applyCalendarImport(icsPreview)
      onUndo(undo)
      setIcsPreview(null); setIcsText(''); setIcsFileName(undefined)
      setHistory(await listCalendarImportBatches())
      setMessage(undo.message)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  async function revertBatch(id: string) {
    setBusy(true); setMessage('')
    try {
      await revertCalendarImport(id)
      setHistory(await listCalendarImportBatches())
      setMessage('Calendar import reverted.')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} title="Portability & calendar" onClose={onClose} className="protocol-modal interop-modal">
      <Tabs value={tab} tabs={[{ value: 'backup', label: 'Backup & restore' }, { value: 'selection', label: 'Selective JSON' }, { value: 'calendar', label: 'Calendar .ics' }]} onChange={setTab} />
      {message ? <div className="protocol-message">{message}</div> : null}

      {tab === 'backup' ? <div className="protocol-stack">
        <div className="protocol-intro"><div className="eyebrow">Native data</div><h3>Recover the planner exactly.</h3><p>Full backups preserve canonical entities and provenance. Restore is replace-only, validated, and automatically downloads a safety backup of the current database before replacement.</p></div>
        <section className="interop-section">
          <header><div><b>Export full backup</b><span>Schema v15 · complete planner state</span></div><Button variant="primary" onClick={() => void exportFullBackup()} disabled={busy}>Export JSON</Button></header>
        </section>
        <section className="interop-section">
          <header><div><b>Restore backup</b><span>Supported direct-restore range: schema v8–v15</span></div><input type="file" accept="application/json,.json" onChange={(event) => void loadBackupFile(event.target.files?.[0])} /></header>
          {restorePreview ? <>
            <div className="protocol-counts">
              <div><b>{restorePreview.counts.tasks}</b><span>Tasks</span></div><div><b>{restorePreview.counts.projects}</b><span>Projects</span></div><div><b>{restorePreview.counts.habits}</b><span>Habits</span></div><div><b>{restorePreview.counts.timeBlocks}</b><span>Time blocks</span></div><div><b>{restorePreview.counts.focusSessions}</b><span>Focus sessions</span></div><div><b>{restorePreview.counts.reviewRecords}</b><span>Reviews</span></div><div><b>v{restorePreview.backup.version}</b><span>Backup schema</span></div>
            </div>
            {restorePreview.warnings.length ? <div className="protocol-issues">{restorePreview.warnings.map((warning) => <div className="is-warning" key={warning}><b>Note</b><span>{warning}</span></div>)}</div> : <div className="protocol-clean">Backup passed structural and relationship validation.</div>}
            <label className="destructive-ack"><input type="checkbox" checked={restoreAck} onChange={(e) => setRestoreAck(e.target.checked)} /><span><b>Replace the current local database</b><small>A pre-restore safety backup will download first. Restore then reloads the app.</small></span></label>
            <div className="protocol-apply-row"><span>Restore never merges two databases. Use selective export/import protocols when you need exchange rather than disaster recovery.</span><Button variant="primary" disabled={!restoreAck || busy} onClick={() => void applyRestore()}>Restore backup</Button></div>
          </> : null}
        </section>
      </div> : null}

      {tab === 'selection' ? <div className="protocol-stack">
        <div className="protocol-intro"><div className="eyebrow">Selective export</div><h3>Take only the context you need.</h3><p>Create a readable JSON snapshot for one project, a date window, or both. Selective exports are archival/exchange packages, not destructive database restores.</p></div>
        <div className="interop-form-grid">
          <label><span>Project</span><select value={selectionProject} onChange={(e) => setSelectionProject(e.target.value)}><option value="">All projects</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span>From date</span><input type="date" value={selectionFrom} onChange={(e) => setSelectionFrom(e.target.value)} /></label>
          <label><span>Through date</span><input type="date" value={selectionThrough} onChange={(e) => setSelectionThrough(e.target.value)} /></label>
          <label className="interop-check"><input type="checkbox" checked={selectionCompleted} onChange={(e) => setSelectionCompleted(e.target.checked)} /><span>Include completed Tasks</span></label>
        </div>
        <div className="protocol-apply-row"><span>Linked subtasks, Time Blocks, Focus Sessions, Daily Plan items, and relevant Recurring Series are included when they belong to the selected Task set.</span><Button variant="primary" disabled={busy} onClick={() => void exportSelection()}>Export selection</Button></div>
      </div> : null}

      {tab === 'calendar' ? <div className="protocol-stack">
        <div className="protocol-intro"><div className="eyebrow">iCalendar</div><h3>Exchange exact calendar time.</h3><p>.ics interoperability operates on Time Blocks and standalone Events. Unscheduled Tasks, Inbox captures, Focus history, and Habits are not converted into calendar events.</p></div>
        <section className="interop-section">
          <div className="review-section-head"><div><div className="eyebrow">Export</div><h3>Calendar range</h3></div></div>
          <div className="interop-form-grid">
            <label><span>From</span><input type="date" value={calendarFrom} onChange={(e) => setCalendarFrom(e.target.value)} /></label>
            <label><span>Through</span><input type="date" value={calendarThrough} onChange={(e) => setCalendarThrough(e.target.value)} /></label>
            <label><span>Project</span><select value={calendarProject} onChange={(e) => setCalendarProject(e.target.value)}><option value="">All task blocks</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="interop-check"><input type="checkbox" checked={calendarEvents} onChange={(e) => setCalendarEvents(e.target.checked)} disabled={Boolean(calendarProject)} /><span>Include standalone Events</span></label>
          </div>
          <div className="protocol-apply-row"><span>VEVENT timestamps are exported in UTC, which preserves exact instants across DST and calendar applications.</span><Button variant="primary" disabled={busy} onClick={() => void exportIcs()}>Export .ics</Button></div>
        </section>

        <section className="interop-section">
          <div className="review-section-head"><div><div className="eyebrow">Import</div><h3>External timed Events</h3></div></div>
          <div className="protocol-file-row"><input type="file" accept="text/calendar,.ics" onChange={(event) => void loadIcsFile(event.target.files?.[0])} /><span>{icsFileName ?? 'or paste VCALENDAR below'}</span></div>
          <textarea className="protocol-json interop-ics-text" placeholder="BEGIN:VCALENDAR…" value={icsText} onChange={(e) => { setIcsText(e.target.value); setIcsPreview(null); setIcsFileName(undefined) }} />
          <div className="protocol-apply-row"><span>Import creates standalone Events only. All-day events and RRULE recurrence are reported and skipped rather than guessed.</span><Button disabled={!icsText.trim() || busy} onClick={() => void previewIcs('ics-paste')}>Preview import</Button></div>
          {icsPreview ? <div className="interop-preview">
            <div className="protocol-counts"><div><b>{icsPreview.events.length}</b><span>Parsed timed events</span></div><div><b>{icsPreview.importableCount}</b><span>New</span></div><div><b>{icsPreview.duplicateCount}</b><span>Duplicates skipped</span></div><div><b>{icsPreview.conflictCount}</b><span>Conflicts</span></div><div><b>{icsPreview.warnings.length}</b><span>Warnings</span></div></div>
            {icsPreview.warnings.length ? <div className="protocol-issues">{icsPreview.warnings.map((warning) => <div className="is-warning" key={warning}><b>Skip</b><span>{warning}</span></div>)}</div> : null}
            <div className="protocol-entity-list">{icsPreview.events.slice(0, 80).map((event) => <div key={`${event.fingerprint}-${event.start}`} className={event.duplicate ? 'is-muted' : ''}><b>{event.duplicate ? 'Duplicate' : 'Event'}</b><strong>{event.summary}</strong><span>{formatLocalDate(calendarImportDay(event), { month: 'short', day: 'numeric' })} · {dateTimeForDisplay(event.start)}–{dateTimeForDisplay(event.end)}{event.location ? ` · ${event.location}` : ''}</span>{event.description ? <span className="interop-event-description">{event.description}</span> : null}{event.duplicateReason ? <em>{event.duplicateReason}</em> : event.conflictTitles.length ? <em>Overlaps: {event.conflictTitles.join(', ')}</em> : null}</div>)}</div>
            <div className="protocol-apply-row"><span>{icsPreview.calendarName ? `Calendar: ${icsPreview.calendarName}. ` : ''}Duplicate protection uses imported UIDs/fingerprints plus exact existing Event matches.</span><Button variant="primary" disabled={!icsPreview.importableCount || busy} onClick={() => void applyIcs()}>Import {icsPreview.importableCount} events</Button></div>
          </div> : null}
        </section>

        {history.length ? <section className="interop-section"><div className="eyebrow">Import history</div><div className="protocol-history">{history.slice(0, 12).map((batch) => <article key={batch.id}><div><b>{batch.calendarName ?? batch.fileName ?? 'Calendar import'}</b><span>{new Date(batch.createdAt).toLocaleString()} · {batch.events.length} events</span></div><strong>{batch.status}</strong>{batch.status === 'applied' ? <Button disabled={busy} onClick={() => void revertBatch(batch.id)}>Revert</Button> : null}</article>)}</div></section> : null}
      </div> : null}
    </Modal>
  )
}
