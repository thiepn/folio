import { useEffect, useMemo, useState } from 'react'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { DEFAULT_SHORTCUTS, formatShortcut, normalizeShortcutEvent, RESERVED_SHORTCUTS, shortcutConflicts, SHORTCUT_META, type ShortcutAction, type ShortcutMap } from './shortcuts'

export function KeyboardSettingsDrawer({ open, value, onClose, onSave }: {
  open: boolean
  value: ShortcutMap
  onClose: () => void
  onSave: (value: ShortcutMap) => void
}) {
  const [draft, setDraft] = useState(value)
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  useEffect(() => { if (open) { setDraft(value); setRecording(null) } }, [open, value])
  const conflicts = useMemo(() => shortcutConflicts(draft), [draft])
  const hasReserved = useMemo(() => Object.values(draft).some((binding) => RESERVED_SHORTCUTS.has(binding)), [draft])

  return (
    <Drawer open={open} title="Keyboard settings" onClose={onClose} className="keyboard-settings-overlay">
      <div className="keyboard-settings-copy">Record a key or modifier combination for the small set of global power commands. Conflicting bindings must be resolved before saving.</div>
      <div className="keyboard-settings-list">
        {SHORTCUT_META.map((item) => {
          const conflict = (conflicts.get(draft[item.action])?.length ?? 0) > 1
          const reserved = RESERVED_SHORTCUTS.has(draft[item.action])
          return <div className={`keyboard-binding ${conflict ? 'has-conflict' : ''}`} key={item.action}>
            <span><strong>{item.label}</strong><small>{item.note}</small></span>
            <button
              type="button"
              className={recording === item.action ? 'is-recording' : ''}
              onClick={() => setRecording(item.action)}
              onKeyDown={(event) => {
                if (recording !== item.action) return
                event.preventDefault()
                event.stopPropagation()
                const binding = normalizeShortcutEvent(event.nativeEvent)
                if (binding) { setDraft((current) => ({ ...current, [item.action]: binding })); setRecording(null) }
              }}
            >{recording === item.action ? 'Press keys…' : formatShortcut(draft[item.action])}</button>
            {conflict ? <em>Conflicts with another command</em> : reserved ? <em>Reserved by fixed navigation</em> : null}
          </div>
        })}
      </div>
      <div className="keyboard-settings-actions">
        <Button variant="ghost" onClick={() => setDraft(DEFAULT_SHORTCUTS)}>Reset defaults</Button>
        <Button variant="primary" disabled={conflicts.size > 0 || hasReserved} onClick={() => { onSave(draft); onClose() }}>Save shortcuts</Button>
      </div>
    </Drawer>
  )
}
