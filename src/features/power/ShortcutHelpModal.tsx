import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { formatShortcut, SHORTCUT_META, type ShortcutMap } from './shortcuts'

const fixedShortcuts = [
  ['/', 'Open command palette / search'],
  ['N', 'New task in the current context'],
  ['P', 'New project'],
  ['T', 'Go straight to Today'],
  ['Enter', 'Open the focused task'],
  ['C', 'Complete the focused task or selected tasks'],
  ['Esc', 'Close the topmost surface / clear selection'],
  ['Mod+A', 'Select all visible tasks'],
  ['Mod+Shift+A', 'Clear task selection'],
  ['G then T', 'Go to Today'],
  ['G then I', 'Go to Inbox'],
  ['G then P', 'Go to Planner'],
  ['G then O', 'Go to Projects'],
  ['G then H', 'Go to Habits'],
  ['G then R', 'Go to Review'],
  ['Alt+← / Alt+→', 'Move selected/focused task one day earlier or later'],
]

export function ShortcutHelpModal({ open, shortcuts, onClose, onConfigure }: {
  open: boolean
  shortcuts: ShortcutMap
  onClose: () => void
  onConfigure: () => void
}) {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose} className="shortcut-help-modal" footer={<Button onClick={onConfigure}>Configure shortcuts</Button>}>
      <div className="shortcut-help-intro">Keyboard control is optional. Every command remains available through the normal interface and Command Palette.</div>
      <div className="shortcut-grid">
        {SHORTCUT_META.map((item) => <div className="shortcut-grid__row" key={item.action}><kbd>{formatShortcut(shortcuts[item.action])}</kbd><span><strong>{item.label}</strong><small>{item.note}</small></span></div>)}
      </div>
      <div className="shortcut-help-section"><span className="eyebrow">Command-first aliases</span><div className="shortcut-grid">{fixedShortcuts.map(([keys, label]) => <div className="shortcut-grid__row" key={keys}><kbd>{keys.replace('Mod', /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl')}</kbd><span><strong>{label}</strong></span></div>)}</div></div>
    </Modal>
  )
}
