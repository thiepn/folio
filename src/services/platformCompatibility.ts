export interface PlatformCompatibility {
  supported: boolean
  missing: string[]
  warnings: string[]
}

function installStructuredCloneFallback() {
  if (typeof globalThis.structuredClone === 'function') return
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    writable: true,
    value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
  })
}

function installRandomUuidFallback() {
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID === 'function') return
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        const bytes = new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      },
    })
  } catch {
    // Compatibility report below will keep randomUUID as a missing capability.
  }
}

export function ensurePlatformCompatibility(): PlatformCompatibility {
  installStructuredCloneFallback()
  installRandomUuidFallback()
  const missing: string[] = []
  const warnings: string[] = []

  if (!('indexedDB' in globalThis)) missing.push('IndexedDB')
  if (!('crypto' in globalThis) || typeof globalThis.crypto.getRandomValues !== 'function') missing.push('Web Crypto')
  if (!('crypto' in globalThis) || typeof globalThis.crypto.randomUUID !== 'function') missing.push('UUID generation')
  if (typeof globalThis.structuredClone !== 'function') missing.push('structuredClone')
  if (typeof Intl?.DateTimeFormat !== 'function') missing.push('Intl.DateTimeFormat')
  if (!('URL' in globalThis) || !('Blob' in globalThis)) missing.push('Blob/URL export support')

  if (!('serviceWorker' in navigator)) warnings.push('Install/offline app-shell support is unavailable in this browser.')
  if (!('Notification' in window)) warnings.push('System notifications are unavailable; Folio reminders will remain in-app only.')
  if (!navigator.storage) warnings.push('Storage persistence/quota reporting is unavailable in this browser.')
  if (!window.matchMedia) warnings.push('Reduced-motion and responsive preference detection may be limited.')

  return { supported: missing.length === 0, missing, warnings }
}
