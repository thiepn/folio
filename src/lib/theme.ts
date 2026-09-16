import type { AccentIntensity, Density } from '../types/ui'

export interface AppearanceState {
  accent: string
  intensity: AccentIntensity
  density: Density
}

export const accentPresets = [
  '#7657FF', '#4169FF', '#2E9CFF', '#34C6D3', '#3AB58A',
  '#76B947', '#D8A54A', '#E07B49', '#D45C8C', '#DB5667',
]

const intensityAlpha: Record<AccentIntensity, { soft: number; line: number; glow: number }> = {
  subtle: { soft: 0.075, line: 0.27, glow: 0.10 },
  balanced: { soft: 0.12, line: 0.38, glow: 0.20 },
  vivid: { soft: 0.17, line: 0.52, glow: 0.34 },
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function linearChannel(value: number) {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: number[]) {
  return 0.2126 * linearChannel(rgb[0]) + 0.7152 * linearChannel(rgb[1]) + 0.0722 * linearChannel(rgb[2])
}

function contrast(a: number[], b: number[]) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

function mix(a: number[], b: number[], amount: number) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * amount))
}

/** Keep user hue for decorative accent while deriving a WCAG-AA text token. */
function accessibleAccentText(rgb: number[]) {
  const bg = [9, 11, 16]
  if (contrast(rgb, bg) >= 4.5) return rgb
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(rgb, [255, 255, 255], step / 20)
    if (contrast(candidate, bg) >= 4.5) return candidate
  }
  return [238, 241, 247]
}

function rgbCss(rgb: number[]) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

export function applyAppearance(appearance: AppearanceState) {
  if (!isValidHex(appearance.accent)) return
  const [r, g, b] = hexToRgb(appearance.accent)
  const alpha = intensityAlpha[appearance.intensity]
  const root = document.documentElement

  root.style.setProperty('--accent', appearance.accent)
  root.style.setProperty('--accent-text', rgbCss(accessibleAccentText([r, g, b])))
  root.style.setProperty('--accent-contrast', contrast([255, 255, 255], [r, g, b]) >= contrast([9, 11, 16], [r, g, b]) ? '#ffffff' : '#090b10')
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${alpha.soft})`)
  root.style.setProperty('--accent-line', `rgba(${r}, ${g}, ${b}, ${alpha.line})`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, ${alpha.glow})`)
  root.style.setProperty('--task-row-height', appearance.density === 'compact' ? '38px' : '44px')
  root.dataset.density = appearance.density
}
