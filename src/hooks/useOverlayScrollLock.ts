import { useEffect } from 'react'

let overlayLocks = 0

function syncOverlayState() {
  const root = document.documentElement
  if (overlayLocks > 0) root.dataset.overlayOpen = 'true'
  else delete root.dataset.overlayOpen
}

/** Locks only the document behind modal surfaces. Individual modal/drawer
 * bodies remain the explicit scroll owners. Nested overlays use a shared count.
 */
export function useOverlayScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return
    overlayLocks += 1
    syncOverlayState()
    return () => {
      overlayLocks = Math.max(0, overlayLocks - 1)
      syncOverlayState()
    }
  }, [open])
}
