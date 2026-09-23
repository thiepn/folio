import type { ReminderOccurrenceEntity } from '../domain/models'

export interface NotificationCapability {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  serviceWorker: boolean
}

export function notificationCapability(): NotificationCapability {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  return {
    supported,
    permission: supported ? Notification.permission : 'unsupported',
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  }
}

export const notificationService = {
  capability: notificationCapability,

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    if (Notification.permission !== 'default') return Notification.permission
    return Notification.requestPermission()
  },

  async show(occurrence: ReminderOccurrenceEntity, options: { title: string; body?: string; persistent?: boolean }) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false

    const tag = `folio-reminder:${occurrence.id}`
    const icon = new URL(`${import.meta.env.BASE_URL}icons/icon-192.png`, window.location.href).href
    const badge = new URL(`${import.meta.env.BASE_URL}icons/icon-192.png`, window.location.href).href
    const data = { occurrenceId: occurrence.id, reminderId: occurrence.reminderId }

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(options.title, {
          body: options.body,
          icon,
          badge,
          tag,
          renotify: occurrence.deliveryCount > 0,
          requireInteraction: Boolean(options.persistent),
          data,
          actions: [
            { action: 'snooze10', title: 'Snooze 10m' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        })
        return true
      } catch {
        // Fall back to the window Notification API below.
      }
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon,
        tag,
        requireInteraction: Boolean(options.persistent),
        data,
      })
      notification.onclick = () => {
        window.focus()
        const url = new URL(window.location.href)
        url.searchParams.set('reminderOccurrence', occurrence.id)
        history.replaceState(null, '', url)
        window.dispatchEvent(new CustomEvent('folio:notification-open', { detail: { occurrenceId: occurrence.id } }))
        notification.close()
      }
      return true
    } catch {
      return false
    }
  },
}
