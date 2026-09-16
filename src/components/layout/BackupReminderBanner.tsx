import { useState } from 'react'
import { Button } from '../ui/Button'
import { useStorageSafety } from '../../hooks/useStorageSafety'
import { downloadSafetyBackup, snoozeBackupReminder } from '../../services/storageSafetyService'

export function BackupReminderBanner() {
  const { status } = useStorageSafety()
  const [busy, setBusy] = useState(false)
  if (!status?.backupDue) return null

  async function backup() {
    setBusy(true)
    try { await downloadSafetyBackup() }
    finally { setBusy(false) }
  }

  return (
    <aside className="system-banner system-banner--backup" role="status">
      <div><b>Backup due</b><span>Your planner is local-first. Export a recovery snapshot before more work accumulates.</span></div>
      <div className="system-banner__actions">
        <Button variant="primary" onClick={() => void backup()} disabled={busy}>Export backup</Button>
        <Button onClick={() => void snoozeBackupReminder(1)} disabled={busy}>Tomorrow</Button>
      </div>
    </aside>
  )
}
