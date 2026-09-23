import { addLocalDays, dateKeyInTimeZone } from '../domain/date'
import type { ReminderEntity, ReminderOccurrenceEntity } from '../domain/models'
import { reminderRepository, type ReminderCreateInput, type ReminderUpdateInput } from '../repositories/reminderRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { dynamicReminderCopy, reconcileAllReminders, reconcileReminder, reminderSuppressionReason } from './reminderEngine'
import { notificationService } from './notificationService'
import type { UndoableMutation } from './undo'

const DEFAULT_SNOOZE_MINUTES = 10
const DEFAULT_DAILY_PLANNING_MINUTE = 8 * 60
const DEFAULT_OVERDUE_MINUTE = 9 * 60

let started = false
let timer: number | undefined
let ticking = false
let wakeHandler: (() => void) | undefined
let visibilityHandler: (() => void) | undefined
const listeners = new Set<() => void>()

function emit() { listeners.forEach((listener) => listener()) }

async function nextWakeDelay() {
  const definitions = await reminderRepository.listDefinitions()
  const enabledIds = new Set(definitions.filter((item) => item.enabled).map((item) => item.id))
  const upcoming = (await Promise.all([
    reminderRepository.listUpcoming(100),
    reminderRepository.listOutstanding(),
  ])).flat().filter((item) => enabledIds.has(item.reminderId))
  const future = upcoming
    .filter((item) => item.status === 'scheduled' || item.status === 'snoozed')
    .map((item) => Date.parse(item.snoozedUntil ?? item.fireAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0]
  if (!future) return 60_000
  return Math.max(1000, Math.min(60_000, future - Date.now()))
}

function arm() {
  if (typeof window === 'undefined' || !started) return
  if (timer !== undefined) window.clearTimeout(timer)
  void nextWakeDelay().then((delay) => {
    if (!started) return
    timer = window.setTimeout(() => { void tick() }, delay)
  })
}

async function markSuppressed(occurrence: ReminderOccurrenceEntity, reason: string) {
  await reminderRepository.setOccurrenceStatus(occurrence.id, 'dismissed', {
    dismissedAt: new Date().toISOString(),
    bodySnapshot: reason,
    snoozedUntil: undefined,
  })
}

async function tick() {
  if (ticking) return
  ticking = true
  try {
    await reconcileAllReminders()
    const due = await reminderRepository.listDue()
    for (const occurrence of due) {
      const reminder = await reminderRepository.get(occurrence.reminderId)
      if (!reminder?.enabled) {
        await reminderRepository.setOccurrenceStatus(occurrence.id, 'cancelled', { snoozedUntil: undefined })
        continue
      }

      const suppression = await reminderSuppressionReason(occurrence)
      if (suppression) {
        await markSuppressed(occurrence, suppression)
        continue
      }

      const copy = await dynamicReminderCopy(occurrence)
      const deliveredAt = new Date().toISOString()
      const systemDelivered = await notificationService.show(occurrence, {
        title: copy.title,
        body: copy.body,
        persistent: reminder.persistent,
      })
      await reminderRepository.setOccurrenceStatus(occurrence.id, 'due', {
        titleSnapshot: copy.title,
        bodySnapshot: copy.body,
        deliveredAt,
        snoozedUntil: undefined,
        deliveryCount: occurrence.deliveryCount + (systemDelivered ? 1 : 0),
      })
    }
    emit()
  } finally {
    ticking = false
    arm()
  }
}

async function ensureSystemReminder(ownerId: 'daily-planning' | 'overdue-summary', enabled: boolean, minuteOfDay: number) {
  const existing = (await reminderRepository.listForOwner('system', ownerId))[0]
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  if (!enabled) {
    if (existing) {
      const next = await reminderRepository.update(existing.id, { enabled: false, minuteOfDay, timeZone })
      await reconcileReminder(next)
    }
    emit()
    arm()
    return
  }

  const input: ReminderCreateInput = {
    ownerType: 'system',
    ownerId,
    triggerType: 'daily',
    minuteOfDay,
    timeZone,
    persistent: ownerId === 'overdue-summary',
    enabled: true,
  }
  if (existing) {
    const next = await reminderRepository.update(existing.id, input)
    await reconcileReminder(next)
  } else {
    const next = await reminderRepository.create(input)
    await reconcileReminder(next)
  }
  emit()
  arm()
}

export const reminderService = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  async create(input: ReminderCreateInput): Promise<{ reminder: ReminderEntity; undo: UndoableMutation }> {
    const reminder = await reminderRepository.create(input)
    await reconcileReminder(reminder)
    emit(); arm()
    return {
      reminder,
      undo: {
        message: 'Reminder added',
        undo: async () => { await reminderRepository.remove(reminder.id); emit(); arm() },
      },
    }
  },

  async update(id: string, input: ReminderUpdateInput): Promise<UndoableMutation> {
    const previous = await reminderRepository.get(id)
    if (!previous) throw new Error('Reminder not found.')
    const next = await reminderRepository.update(id, input)
    await reconcileReminder(next)
    emit(); arm()
    return {
      message: 'Reminder updated',
      undo: async () => { await reminderRepository.replace(previous); await reconcileReminder(previous); emit(); arm() },
    }
  },

  async remove(id: string): Promise<UndoableMutation> {
    const previous = await reminderRepository.get(id)
    if (!previous) throw new Error('Reminder not found.')
    const occurrences = await reminderRepository.listOccurrencesForReminder(id)
    await reminderRepository.remove(id)
    emit(); arm()
    return {
      message: 'Reminder removed',
      undo: async () => {
        await reminderRepository.replace(previous)
        await reminderRepository.putOccurrences(occurrences)
        emit(); arm()
      },
    }
  },

  async snooze(occurrenceId: string, minutes?: number) {
    const occurrence = await reminderRepository.getOccurrence(occurrenceId)
    if (!occurrence || occurrence.status === 'dismissed' || occurrence.status === 'cancelled') return
    const snoozeMinutes = minutes ?? await settingsRepository.get<number>('notifications.defaultSnoozeMinutes', DEFAULT_SNOOZE_MINUTES)
    const snoozedUntil = new Date(Date.now() + Math.max(1, snoozeMinutes) * 60_000).toISOString()
    await reminderRepository.setOccurrenceStatus(occurrenceId, 'snoozed', {
      snoozedUntil,
      fireAt: snoozedUntil,
    })
    emit(); arm()
  },

  async dismiss(occurrenceId: string) {
    const occurrence = await reminderRepository.getOccurrence(occurrenceId)
    if (!occurrence) return
    await reminderRepository.setOccurrenceStatus(occurrenceId, 'dismissed', {
      dismissedAt: new Date().toISOString(),
      snoozedUntil: undefined,
    })
    emit(); arm()
  },

  async setEnabled(id: string, enabled: boolean) {
    const next = await reminderRepository.update(id, { enabled })
    await reconcileReminder(next)
    emit(); arm()
  },

  async reconcile() {
    await reconcileAllReminders()
    emit(); arm()
  },

  async runDueNow() {
    await tick()
  },

  async requestPermission() {
    const permission = await notificationService.requestPermission()
    emit()
    return permission
  },

  async getDefaultSnoozeMinutes() {
    return settingsRepository.get<number>('notifications.defaultSnoozeMinutes', DEFAULT_SNOOZE_MINUTES)
  },

  async setDefaultSnoozeMinutes(minutes: number) {
    await settingsRepository.set('notifications.defaultSnoozeMinutes', Math.max(1, Math.min(24 * 60, Math.round(minutes))))
    emit()
  },

  async getSystemSettings() {
    const planning = (await reminderRepository.listForOwner('system', 'daily-planning'))[0]
    const overdue = (await reminderRepository.listForOwner('system', 'overdue-summary'))[0]
    return {
      dailyPlanning: { enabled: Boolean(planning?.enabled), minuteOfDay: planning?.minuteOfDay ?? DEFAULT_DAILY_PLANNING_MINUTE },
      overdueSummary: { enabled: Boolean(overdue?.enabled), minuteOfDay: overdue?.minuteOfDay ?? DEFAULT_OVERDUE_MINUTE },
      defaultSnoozeMinutes: await this.getDefaultSnoozeMinutes(),
    }
  },

  async setDailyPlanningReminder(enabled: boolean, minuteOfDay = DEFAULT_DAILY_PLANNING_MINUTE) {
    await ensureSystemReminder('daily-planning', enabled, minuteOfDay)
  },

  async setOverdueSummaryReminder(enabled: boolean, minuteOfDay = DEFAULT_OVERDUE_MINUTE) {
    await ensureSystemReminder('overdue-summary', enabled, minuteOfDay)
  },

  async handleNotificationAction(occurrenceId: string, action: string) {
    if (action === 'snooze10') await this.snooze(occurrenceId, 10)
    else if (action === 'dismiss') await this.dismiss(occurrenceId)
    else await this.runDueNow()
  },

  async openTarget(occurrenceId: string) {
    return reminderRepository.getOccurrence(occurrenceId)
  },

  start() {
    if (started || typeof window === 'undefined') return
    started = true
    wakeHandler = () => { void tick() }
    visibilityHandler = () => { if (document.visibilityState === 'visible') wakeHandler?.() }
    window.addEventListener('focus', wakeHandler)
    window.addEventListener('online', wakeHandler)
    window.addEventListener('folio:reminder-refresh', wakeHandler as EventListener)
    document.addEventListener('visibilitychange', visibilityHandler)
    void tick()
  },

  stop() {
    started = false
    if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
    timer = undefined
    if (typeof window !== 'undefined' && wakeHandler) {
      window.removeEventListener('focus', wakeHandler)
      window.removeEventListener('online', wakeHandler)
      window.removeEventListener('folio:reminder-refresh', wakeHandler as EventListener)
    }
    if (typeof document !== 'undefined' && visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
    wakeHandler = undefined
    visibilityHandler = undefined
  },

  async todayInReminderZone(reminderId: string) {
    const reminder = await reminderRepository.get(reminderId)
    return reminder ? dateKeyInTimeZone(new Date(), reminder.timeZone) : addLocalDays(dateKeyInTimeZone(new Date(), 'local'), 0)
  },
}
