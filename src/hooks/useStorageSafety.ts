import { useCallback, useEffect, useState } from 'react'
import { getStorageSafetyStatus, type StorageSafetyStatus } from '../services/storageSafetyService'

export function useStorageSafety() {
  const [status, setStatus] = useState<StorageSafetyStatus | null>(null)
  const refresh = useCallback(() => { void getStorageSafetyStatus().then(setStatus) }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('folio:storage-safety-change', handler)
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('folio:storage-safety-change', handler)
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }, [refresh])

  return { status, refresh }
}
