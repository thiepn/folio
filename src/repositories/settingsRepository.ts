import { db } from '../db/database'
import { appearanceSchema } from '../domain/schemas'
import type { AppearanceState } from '../lib/theme'

export const DEFAULT_APPEARANCE: AppearanceState = {
  accent: '#4169FF',
  intensity: 'balanced',
  density: 'comfortable',
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const setting = await db.settings.get(key)
  return (setting?.value as T | undefined) ?? fallback
}

async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() })
}

export const settingsRepository = {
  get: getSetting,
  set: setSetting,

  async getAppearance(): Promise<AppearanceState> {
    const raw = await getSetting('appearance', DEFAULT_APPEARANCE)
    const parsed = appearanceSchema.safeParse(raw)
    return parsed.success ? parsed.data : DEFAULT_APPEARANCE
  },

  async setAppearance(value: AppearanceState): Promise<void> {
    const parsed = appearanceSchema.parse(value)
    await setSetting('appearance', parsed)
  },

  async getDailyCapacityMinutes(): Promise<number> {
    return getSetting('planner.dailyCapacityMinutes', 300)
  },

  async setDailyCapacityMinutes(minutes: number): Promise<void> {
    await setSetting('planner.dailyCapacityMinutes', Math.max(30, Math.min(24 * 60, Math.round(minutes))))
  },
}
