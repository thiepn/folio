import { useEffect, useState } from 'react'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { useReminderData } from '../../hooks/useReminderData'
import { notificationCapability } from '../../services/notificationService'
import { reminderService } from '../../services/reminderService'
import type { ReminderOccurrenceEntity } from '../../domain/models'

function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function dateTimeLabel(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function statusLabel(permission: NotificationPermission | 'unsupported') {
  if (permission === 'granted') return 'System notifications enabled'
  if (permission === 'denied') return 'System notifications blocked'
  if (permission === 'default') return 'Permission not requested'
  return 'Notifications unsupported'
}

export function ReminderCenterDrawer({ open, onClose, onOpenOccurrence }: {
  open: boolean
  onClose: () => void
  onOpenOccurrence: (occurrence: ReminderOccurrenceEntity) => void
}) {
  const data = useReminderData()
  const [permission, setPermission] = useState(notificationCapability().permission)
  const [settings, setSettings] = useState<{ dailyPlanning: { enabled: boolean; minuteOfDay: number }; overdueSummary: { enabled: boolean; minuteOfDay: number }; defaultSnoozeMinutes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPermission(notificationCapability().permission)
    void reminderService.getSystemSettings().then(setSettings)
    void reminderService.reconcile()
  }, [open])

  async function requestPermission() {
    setBusy(true)
    try { setPermission(await reminderService.requestPermission()) }
    finally { setBusy(false) }
  }

  async function updatePlanning(enabled: boolean, minute = settings?.dailyPlanning.minuteOfDay ?? 480) {
    setBusy(true)
    try {
      await reminderService.setDailyPlanningReminder(enabled, minute)
      setSettings(await reminderService.getSystemSettings())
    } finally { setBusy(false) }
  }

  async function updateOverdue(enabled: boolean, minute = settings?.overdueSummary.minuteOfDay ?? 540) {
    setBusy(true)
    try {
      await reminderService.setOverdueSummaryReminder(enabled, minute)
      setSettings(await reminderService.getSystemSettings())
    } finally { setBusy(false) }
  }

  async function updateSnooze(minutes: number) {
    await reminderService.setDefaultSnoozeMinutes(minutes)
    setSettings(await reminderService.getSystemSettings())
  }

  return (
    <Drawer open={open} title="Reminders" onClose={onClose} className="reminder-center-overlay">
      <div className="reminder-center">
        <section className="reminder-center__permission">
          <div>
            <span className="eyebrow">Delivery</span>
            <strong>{statusLabel(permission)}</strong>
            <p>Folio always tracks due reminders in-app. System notifications require browser permission.</p>
          </div>
          {permission === 'default' ? <Button variant="primary" disabled={busy} onClick={() => void requestPermission()}>Enable notifications</Button> : permission === 'denied' ? <span className="reminder-permission-note">Enable notifications for this site in browser or OS settings.</span> : null}
        </section>

        <section className="reminder-center__section">
          <div className="section-title-row"><span className="eyebrow">Needs attention</span><em>{data?.due.length ?? 0} due</em></div>
          <div className="reminder-list">
            {data?.due.map((occurrence) => <article className="reminder-item is-due" key={occurrence.id}>
              <div className="reminder-item__copy">
                <strong>{occurrence.titleSnapshot}</strong>
                <span>{occurrence.bodySnapshot || 'Reminder'} · {dateTimeLabel(occurrence.scheduledFor)}</span>
              </div>
              <div className="reminder-item__actions">
                <Button onClick={() => onOpenOccurrence(occurrence)}>Open</Button>
                <Button onClick={() => void reminderService.snooze(occurrence.id, settings?.defaultSnoozeMinutes ?? 10)}>Snooze</Button>
                <Button onClick={() => void reminderService.dismiss(occurrence.id)}>Dismiss</Button>
              </div>
            </article>)}
            {!data?.due.length ? <div className="reminder-empty">No due reminders.</div> : null}
          </div>
        </section>

        {data?.snoozed.length ? <section className="reminder-center__section">
          <div className="section-title-row"><span className="eyebrow">Snoozed</span><em>{data.snoozed.length}</em></div>
          <div className="reminder-list">
            {data.snoozed.map((occurrence) => <article className="reminder-item" key={occurrence.id}>
              <div className="reminder-item__copy"><strong>{occurrence.titleSnapshot}</strong><span>Returns {dateTimeLabel(occurrence.snoozedUntil)}</span></div>
              <div className="reminder-item__actions"><Button onClick={() => void reminderService.dismiss(occurrence.id)}>Dismiss</Button></div>
            </article>)}
          </div>
        </section> : null}

        <section className="reminder-center__section">
          <div className="section-title-row"><span className="eyebrow">Upcoming</span><em>Next {Math.min(data?.upcoming.length ?? 0, 12)}</em></div>
          <div className="reminder-upcoming">
            {data?.upcoming.slice(0, 12).map((occurrence) => <button type="button" key={occurrence.id} onClick={() => onOpenOccurrence(occurrence)}>
              <span>{dateTimeLabel(occurrence.fireAt)}</span><strong>{occurrence.titleSnapshot}</strong>
            </button>)}
            {!data?.upcoming.length ? <div className="reminder-empty">No upcoming reminders.</div> : null}
          </div>
        </section>

        <section className="reminder-center__section reminder-automation">
          <div className="section-title-row"><span className="eyebrow">Planning alerts</span><em>Local-first</em></div>
          {settings ? <>
            <div className="reminder-setting-row">
              <label><input type="checkbox" checked={settings.dailyPlanning.enabled} onChange={(event) => void updatePlanning(event.target.checked)} /><span><strong>Daily planning</strong><small>Prompt to review carryover, deadlines, capacity, and Top 3.</small></span></label>
              <input type="time" value={minuteToTime(settings.dailyPlanning.minuteOfDay)} onChange={(event) => void updatePlanning(settings.dailyPlanning.enabled, timeToMinute(event.target.value))} />
            </div>
            <div className="reminder-setting-row">
              <label><input type="checkbox" checked={settings.overdueSummary.enabled} onChange={(event) => void updateOverdue(event.target.checked)} /><span><strong>Overdue summary</strong><small>Only alerts when unfinished root tasks are past their deadline.</small></span></label>
              <input type="time" value={minuteToTime(settings.overdueSummary.minuteOfDay)} onChange={(event) => void updateOverdue(settings.overdueSummary.enabled, timeToMinute(event.target.value))} />
            </div>
            <label className="field reminder-default-snooze"><span>Default snooze</span><select value={settings.defaultSnoozeMinutes} onChange={(event) => void updateSnooze(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={180}>3 hours</option></select></label>
          </> : <div className="reminder-empty">Loading reminder settings…</div>}
        </section>

        <section className="reminder-center__limits">
          <strong>Browser delivery boundary</strong>
          <p>While Folio is open or backgrounded, the scheduler can deliver system notifications and reconcile exact due times. If the browser fully terminates the app, local-only web APIs cannot universally guarantee an exact wake-up. Missed reminders are surfaced immediately when Folio runs again.</p>
        </section>
      </div>
    </Drawer>
  )
}
