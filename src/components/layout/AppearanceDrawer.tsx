import { Drawer } from '../ui/Drawer'
import { SegmentedControl } from '../ui/SegmentedControl'
import { accentPresets, isValidHex, type AppearanceState } from '../../lib/theme'
import type { AccentIntensity, Density } from '../../types/ui'

export function AppearanceDrawer({ open, appearance, onChange, onClose }: {
  open: boolean
  appearance: AppearanceState
  onChange: (appearance: AppearanceState) => void
  onClose: () => void
}) {
  return (
    <Drawer open={open} title="Appearance" onClose={onClose}>
      <section className="setting-group">
        <div className="setting-label">Accent color</div>
        <div className="swatches">
          {accentPresets.map((color) => (
            <button
              key={color}
              className={appearance.accent.toLowerCase() === color.toLowerCase() ? 'swatch is-active' : 'swatch'}
              style={{ '--swatch': color } as React.CSSProperties}
              aria-label={`Use ${color}`}
              onClick={() => onChange({ ...appearance, accent: color })}
            />
          ))}
        </div>
        <div className="custom-color-row">
          <input type="color" value={appearance.accent} onChange={(event) => onChange({ ...appearance, accent: event.target.value.toUpperCase() })} />
          <input
            value={appearance.accent}
            maxLength={7}
            aria-label="Accent hex value"
            onChange={(event) => {
              const value = event.target.value.toUpperCase()
              if (isValidHex(value)) onChange({ ...appearance, accent: value })
            }}
          />
        </div>
      </section>

      <section className="setting-group">
        <div className="setting-label">Accent intensity</div>
        <SegmentedControl<AccentIntensity>
          label="Accent intensity"
          value={appearance.intensity}
          options={[
            { value: 'subtle', label: 'Subtle' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'vivid', label: 'Vivid' },
          ]}
          onChange={(intensity) => onChange({ ...appearance, intensity })}
        />
      </section>

      <section className="setting-group">
        <div className="setting-label">Density</div>
        <SegmentedControl<Density>
          label="Interface density"
          value={appearance.density}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={(density) => onChange({ ...appearance, density })}
        />
      </section>

      <section className="setting-note">
        <div className="setting-label">Design system</div>
        <p>Warm ink canvas, editorial typography, ruled sections, crisp geometry, and one user-selected accent. Project colors remain independent from the UI accent.</p>
      </section>
    </Drawer>
  )
}
