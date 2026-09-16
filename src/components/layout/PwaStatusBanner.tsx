import { Button } from '../ui/Button'
import { usePwaState } from '../../hooks/usePwaState'
import { pwaService } from '../../services/pwaService'

export function PwaStatusBanner() {
  const pwa = usePwaState()
  const offline = !navigator.onLine

  if (pwa.updateAvailable) {
    return (
      <aside className="system-banner system-banner--update" role="status">
        <div><b>Update ready</b><span>A new app shell is fully cached. Activate it when convenient.</span></div>
        <Button variant="primary" onClick={() => void pwaService.applyUpdate()}>Update now</Button>
      </aside>
    )
  }

  if (offline) {
    return (
      <aside className="system-banner system-banner--offline" role="status">
        <div><b>Offline</b><span>{pwa.offlineReady ? 'Planner data and the cached app shell remain available locally.' : 'Local data remains intact; this device has not completed app-shell caching yet.'}</span></div>
      </aside>
    )
  }

  return null
}
