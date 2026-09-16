import { useEffect } from 'react'

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes(target.type)
}

/**
 * Phase 17 mobile viewport hardening.
 *
 * 100dvh remains the normal layout primitive. visualViewport is used only to
 * detect a genuinely open software keyboard and expose its current usable
 * height/offset to overlay surfaces. It is intentionally not used as a
 * permanent app-shell height calculation.
 */
export function useMobileViewport() {
  useEffect(() => {
    const root = document.documentElement
    const visualViewport = window.visualViewport
    let editing = isTextEditingTarget(document.activeElement)
    let largestVisualHeight = visualViewport?.height ?? window.innerHeight

    function update() {
      const currentHeight = visualViewport?.height ?? window.innerHeight
      if (!editing) largestVisualHeight = Math.max(largestVisualHeight, currentHeight)
      const keyboardDelta = largestVisualHeight - currentHeight
      const keyboardOpen = editing && keyboardDelta >= 120

      root.dataset.virtualKeyboard = keyboardOpen ? 'open' : 'closed'
      if (keyboardOpen) {
        root.style.setProperty('--keyboard-viewport-height', `${Math.round(currentHeight)}px`)
        root.style.setProperty('--keyboard-viewport-offset-top', `${Math.round(visualViewport?.offsetTop ?? 0)}px`)
      } else {
        root.style.removeProperty('--keyboard-viewport-height')
        root.style.removeProperty('--keyboard-viewport-offset-top')
      }
    }

    function focusIn(event: FocusEvent) {
      editing = isTextEditingTarget(event.target)
      update()
    }

    function focusOut() {
      editing = false
      window.setTimeout(update, 0)
    }

    function orientationChanged() {
      largestVisualHeight = visualViewport?.height ?? window.innerHeight
      update()
    }

    update()
    document.addEventListener('focusin', focusIn)
    document.addEventListener('focusout', focusOut)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', orientationChanged)
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)

    return () => {
      document.removeEventListener('focusin', focusIn)
      document.removeEventListener('focusout', focusOut)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', orientationChanged)
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      delete root.dataset.virtualKeyboard
      root.style.removeProperty('--keyboard-viewport-height')
      root.style.removeProperty('--keyboard-viewport-offset-top')
    }
  }, [])
}
