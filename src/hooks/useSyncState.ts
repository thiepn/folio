import { useSyncExternalStore } from 'react'
import { syncService } from '../services/syncService'

export function useSyncState(){
  return useSyncExternalStore(syncService.subscribe,syncService.getSnapshot,syncService.getSnapshot)
}
