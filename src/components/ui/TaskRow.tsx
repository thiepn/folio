import type { MouseEvent, ReactNode } from 'react'
import type { TaskPreview } from '../../types/ui'
import { useTaskSelection } from '../../features/power/TaskSelectionContext'

function formatDuration(minutes?: number) {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}m`
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function TaskRow({ task, onToggle, onOpen, actions }: {
  task: TaskPreview
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  actions?: ReactNode
}) {
  const selection = useTaskSelection()
  const selected = selection.isSelected(task.id)

  function openTask(event: MouseEvent<HTMLButtonElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault()
      selection.toggle(task.id, { additive: event.metaKey || event.ctrlKey, range: event.shiftKey })
      return
    }
    onOpen?.(task.id)
  }

  return (
    <div className={`task-row ${selected ? 'task-row--selected' : ''}`} data-task-id={task.id}>
      <button
        className={`task-check ${task.completed ? 'task-check--done' : ''}`}
        aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={() => { onToggle?.(task.id); if (selected) selection.toggle(task.id, { additive: true }) }}
      />
      <button
        className="task-row__open"
        data-task-open={task.id}
        onClick={openTask}
        aria-label={`Open task ${task.title}${selected ? ', selected' : ''}`}
        disabled={!onOpen}
      >
        <div className="task-row__body">
          <div className={`task-row__title ${task.completed ? 'task-row__title--done' : ''}`}>{task.title}</div>
          {(task.pinned || task.seriesId || task.activeBlockerCount || task.list || task.project || task.meta || task.tags?.length || task.subtaskTotal || (task.progressPercent && task.progressPercent < 100)) ? (
            <div className="task-row__meta">
              {[task.pinned ? '★ Pinned' : undefined, task.seriesId ? '↻ Recurring' : undefined, task.activeBlockerCount ? `⛓ Blocked by ${task.activeBlockerCount}` : undefined, task.list ? `☰ ${task.list}${task.section ? ` / ${task.section}` : ''}` : undefined, task.project, task.meta, task.tags?.slice(0, 2).map((tag) => `#${tag}`).join(' '), task.subtaskTotal ? `${task.subtaskCompleted}/${task.subtaskTotal} nested` : undefined, task.progressPercent && task.progressPercent < 100 ? `${task.progressPercent}%` : undefined].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
        <div className="task-row__aside">
          {selected ? <span className="task-row__selected-mark" aria-hidden="true">SELECTED</span> : null}
          {task.priority === 'critical' ? <span className="priority priority--critical">!</span> : null}
          {task.priority === 'high' ? <span className="priority priority--high">↑</span> : null}
          <span>{formatDuration(task.durationMinutes)}</span>
        </div>
      </button>
      {actions ? <div className="task-row__actions">{actions}</div> : null}
    </div>
  )
}
