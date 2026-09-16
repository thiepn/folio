import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface ToggleOptions { range?: boolean; additive?: boolean }

interface TaskSelectionContextValue {
  selectedIds: Set<string>
  active: boolean
  isSelected: (id: string) => boolean
  toggle: (id: string, options?: ToggleOptions) => void
  clear: () => void
  selectVisible: () => void
}

const TaskSelectionContext = createContext<TaskSelectionContextValue | null>(null)

function visibleTaskIds() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]'))
    .filter((element) => element.offsetParent !== null)
    .map((element) => element.dataset.taskId)
    .filter((id): id is string => Boolean(id))
    .filter((id, index, all) => all.indexOf(id) === index)
}

export function TaskSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)

  const toggle = useCallback((id: string, options: ToggleOptions = {}) => {
    setSelectedIds((previous) => {
      const next = options.additive || options.range ? new Set(previous) : new Set<string>()
      if (options.range && anchorId) {
        const visible = visibleTaskIds()
        const start = visible.indexOf(anchorId)
        const end = visible.indexOf(id)
        if (start >= 0 && end >= 0) {
          const [low, high] = start < end ? [start, end] : [end, start]
          visible.slice(low, high + 1).forEach((taskId) => next.add(taskId))
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAnchorId(id)
  }, [anchorId])

  const clear = useCallback(() => { setSelectedIds(new Set()); setAnchorId(null) }, [])
  const selectVisible = useCallback(() => { setSelectedIds(new Set(visibleTaskIds())); setAnchorId(null) }, [])
  const value = useMemo<TaskSelectionContextValue>(() => ({
    selectedIds,
    active: selectedIds.size > 0,
    isSelected: (id) => selectedIds.has(id),
    toggle,
    clear,
    selectVisible,
  }), [selectedIds, toggle, clear, selectVisible])

  return <TaskSelectionContext.Provider value={value}>{children}</TaskSelectionContext.Provider>
}

export function useTaskSelection() {
  const context = useContext(TaskSelectionContext)
  if (!context) throw new Error('useTaskSelection must be used inside TaskSelectionProvider.')
  return context
}
