import { previewBackup, createBackup } from './backupService'
import { settingsRepository } from '../repositories/settingsRepository'
import { db } from '../db/database'

const FIRST_SEEN_KEY = 'safety.firstSeenAt'
const LAST_BACKUP_KEY = 'safety.lastBackupAt'
const REMINDER_DAYS_KEY = 'safety.backupReminderDays'
const SNOOZE_UNTIL_KEY = 'safety.backupSnoozeUntil'
const DEFAULT_REMINDER_DAYS = 7

export interface StorageSafetyStatus {
  persisted: boolean | null
  persistSupported: boolean
  usageBytes?: number
  quotaBytes?: number
  usageRatio?: number
  lastBackupAt?: string
  reminderDays: number
  backupDue: boolean
  backupDueAt?: string
  snoozedUntil?: string
}

function notify() {
  window.dispatchEvent(new CustomEvent('folio:storage-safety-change'))
}

export async function initializeStorageSafety() {
  const firstSeen = await settingsRepository.get<string | undefined>(FIRST_SEEN_KEY, undefined)
  if (firstSeen) return
  const [tasks, projects, habits] = await Promise.all([db.tasks.toArray(), db.projects.toArray(), db.habits.toArray()])
  const candidates = [...tasks, ...projects, ...habits]
    .map((entity) => entity.createdAt)
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort()
  await settingsRepository.set(FIRST_SEEN_KEY, candidates[0] ?? new Date().toISOString())
}

export async function getStorageSafetyStatus(): Promise<StorageSafetyStatus> {
  const [firstSeenAt, lastBackupAt, reminderDaysRaw, snoozedUntil] = await Promise.all([
    settingsRepository.get<string | undefined>(FIRST_SEEN_KEY, undefined),
    settingsRepository.get<string | undefined>(LAST_BACKUP_KEY, undefined),
    settingsRepository.get<number>(REMINDER_DAYS_KEY, DEFAULT_REMINDER_DAYS),
    settingsRepository.get<string | undefined>(SNOOZE_UNTIL_KEY, undefined),
  ])
  const reminderDays = [3, 7, 14, 30].includes(reminderDaysRaw) ? reminderDaysRaw : DEFAULT_REMINDER_DAYS
  const basis = lastBackupAt ?? firstSeenAt
  const dueAtMs = basis ? Date.parse(basis) + reminderDays * 86_400_000 : Number.POSITIVE_INFINITY
  const snoozed = snoozedUntil && Date.parse(snoozedUntil) > Date.now()
  let persisted: boolean | null = null
  let estimate: StorageEstimate = {}
  try {
    persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
    estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {}
  } catch {
    // Browsers may expose partial StorageManager implementations in private mode.
  }
  const usageBytes = estimate.usage
  const quotaBytes = estimate.quota
  return {
    persisted,
    persistSupported: Boolean(navigator.storage?.persist),
    usageBytes,
    quotaBytes,
    usageRatio: usageBytes != null && quotaBytes ? usageBytes / quotaBytes : undefined,
    lastBackupAt,
    reminderDays,
    backupDue: !snoozed && Number.isFinite(dueAtMs) && dueAtMs <= Date.now(),
    backupDueAt: Number.isFinite(dueAtMs) ? new Date(dueAtMs).toISOString() : undefined,
    snoozedUntil,
  }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  const granted = await navigator.storage.persist()
  notify()
  return granted
}

export async function setBackupReminderDays(days: number) {
  const normalized = [3, 7, 14, 30].includes(days) ? days : DEFAULT_REMINDER_DAYS
  await settingsRepository.set(REMINDER_DAYS_KEY, normalized)
  notify()
}

export async function recordBackupExport() {
  await settingsRepository.set(LAST_BACKUP_KEY, new Date().toISOString())
  await settingsRepository.set(SNOOZE_UNTIL_KEY, '')
  notify()
}

export async function snoozeBackupReminder(days = 1) {
  await settingsRepository.set(SNOOZE_UNTIL_KEY, new Date(Date.now() + days * 86_400_000).toISOString())
  notify()
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadSafetyBackup(prefix = 'folio-backup') {
  const backup = await createBackup()
  const day = new Date().toISOString().slice(0, 10)
  downloadJson(backup, `${prefix}-${day}.json`)
  await recordBackupExport()
  return backup
}

export async function verifyDatabaseIntegrity() {
  const backup = await createBackup()
  const preview = previewBackup(backup)
  return {
    ok: true as const,
    checkedAt: new Date().toISOString(),
    warnings: preview.warnings,
    entityCount: Object.values(preview.counts).reduce((sum, count) => sum + count, 0),
  }
}
