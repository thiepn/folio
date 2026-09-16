import { useSyncExternalStore } from 'react'
import { pwaService } from '../services/pwaService'

export function usePwaState() {
  return useSyncExternalStore(pwaService.subscribe, pwaService.getSnapshot, pwaService.getSnapshot)
}
