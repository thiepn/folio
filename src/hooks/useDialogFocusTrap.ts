import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function isTopDialog(container: HTMLElement) {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
  return dialogs.at(-1) === container
}

/**
 * WCAG-oriented dialog focus management.
 * - Moves focus into the top-most dialog after it opens.
 * - Traps Tab/Shift+Tab inside that dialog only.
 * - Restores focus to the invoker when it closes.
 * - Lets nested dialogs coexist without the lower dialog also consuming keys.
 */
export function useDialogFocusTrap(open: boolean, containerRef: RefObject<HTMLElement | null>, onEscape?: () => void) {
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape
  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return
    const dialog = container

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => {
      const target = dialog.querySelector<HTMLElement>('[data-autofocus]') ?? focusableElements(dialog)[0] ?? dialog
      target.focus({ preventScroll: true })
    }, 0)

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopDialog(dialog)) return
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        escapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableElements(dialog)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown, true)
      window.setTimeout(() => {
        if (previous?.isConnected) previous.focus({ preventScroll: true })
      }, 0)
    }
  }, [open, containerRef])
}
