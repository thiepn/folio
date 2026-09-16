import { settingsRepository } from '../repositories/settingsRepository'
import type { SavedTaskView } from '../features/planner/advancedPlanning'
import type { UndoableMutation } from './undo'

const KEY = 'planning.savedViews'
const MAX_VIEWS = 12

async function currentViews() {
  const value = await settingsRepository.get<unknown>(KEY, [])
  return Array.isArray(value) ? value as SavedTaskView[] : []
}

function normalizeName(name: string) {
  const value = name.trim()
  if (!value) throw new Error('Saved view name is required.')
  return value.slice(0, 80)
}

export const savedViewService = {
  async save(view: Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<UndoableMutation> {
    const previous = await currentViews()
    const now = new Date().toISOString()
    const id = view.id ?? crypto.randomUUID()
    const existing = previous.find((item) => item.id === id)
    const nextView: SavedTaskView = {
      ...view,
      id,
      name: normalizeName(view.name),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const next = existing ? previous.map((item) => item.id === id ? nextView : item) : [...previous, nextView]
    if (next.length > MAX_VIEWS) throw new Error(`Keep saved views to ${MAX_VIEWS} or fewer.`)
    await settingsRepository.set(KEY, next)
    return { message: existing ? 'Saved view updated' : 'Saved view created', undo: async () => { await settingsRepository.set(KEY, previous) } }
  },

  async remove(id: string): Promise<UndoableMutation> {
    const previous = await currentViews()
    const next = previous.filter((item) => item.id !== id)
    if (next.length === previous.length) throw new Error('Saved view not found.')
    await settingsRepository.set(KEY, next)
    return { message: 'Saved view removed', undo: async () => { await settingsRepository.set(KEY, previous) } }
  },
}
