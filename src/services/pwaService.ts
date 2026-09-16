export interface PwaState {
  supported: boolean
  registered: boolean
  controlled: boolean
  offlineReady: boolean
  updateAvailable: boolean
  installAvailable: boolean
  installed: boolean
  checking: boolean
  error?: string
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const listeners = new Set<() => void>()
let registration: ServiceWorkerRegistration | null = null
let installPrompt: InstallPromptEvent | null = null
let reloadForUpdate = false
let started = false
let state: PwaState = {
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  registered: false,
  controlled: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
  offlineReady: false,
  updateAvailable: false,
  installAvailable: false,
  installed: typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches ?? false),
  checking: false,
}

function emit(patch?: Partial<PwaState>) {
  if (patch) state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function observeRegistration(next: ServiceWorkerRegistration) {
  registration = next
  emit({
    registered: true,
    offlineReady: Boolean(next.active),
    updateAvailable: Boolean(next.waiting && navigator.serviceWorker.controller),
    error: undefined,
  })

  next.addEventListener('updatefound', () => {
    const worker = next.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        emit({
          offlineReady: Boolean(next.active) || !navigator.serviceWorker.controller,
          updateAvailable: Boolean(navigator.serviceWorker.controller),
        })
      }
      if (worker.state === 'redundant') emit({ error: 'The new offline app shell could not be installed.' })
    })
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as InstallPromptEvent
    emit({ installAvailable: true })
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    emit({ installed: true, installAvailable: false })
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (event) => emit({ installed: event.matches }))
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    emit({ controlled: Boolean(navigator.serviceWorker.controller), offlineReady: true, updateAvailable: false })
    if (reloadForUpdate) {
      reloadForUpdate = false
      window.location.reload()
    }
  })
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'OFFLINE_READY') emit({ offlineReady: true, error: undefined })
  })
}

export const pwaService = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot(): PwaState { return state },

  async register() {
    if (started || !state.supported || !import.meta.env.PROD) return
    started = true
    try {
      const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href)
      const next = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
      observeRegistration(next)
      if (next.waiting && navigator.serviceWorker.controller) emit({ updateAvailable: true })

      const check = () => { if (navigator.onLine) void pwaService.checkForUpdate() }
      window.addEventListener('online', check)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      window.setInterval(check, 60 * 60 * 1000)
    } catch (error) {
      emit({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  async checkForUpdate() {
    if (!registration) return
    emit({ checking: true })
    try {
      await registration.update()
      emit({ updateAvailable: Boolean(registration.waiting && navigator.serviceWorker.controller), error: undefined })
    } catch (error) {
      emit({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      emit({ checking: false })
    }
  },

  async applyUpdate() {
    if (!registration?.waiting) return
    reloadForUpdate = true
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  },

  async promptInstall() {
    if (!installPrompt) return false
    const prompt = installPrompt
    installPrompt = null
    emit({ installAvailable: false })
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome !== 'accepted') emit({ installAvailable: false })
    return choice.outcome === 'accepted'
  },
}
