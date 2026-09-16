export function visibleTaskButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.task-row__open[data-task-open]'))
    .filter((element) => element.offsetParent !== null && !element.disabled)
}

export function focusedTaskButton(): HTMLButtonElement | null {
  const active = document.activeElement
  return active instanceof HTMLButtonElement && active.matches('.task-row__open[data-task-open]') ? active : null
}

export function focusRelativeTask(direction: -1 | 1): string | null {
  const buttons = visibleTaskButtons()
  if (!buttons.length) return null
  const current = focusedTaskButton()
  let index = current ? buttons.indexOf(current) : -1
  if (index < 0) index = direction > 0 ? -1 : 0
  const next = Math.max(0, Math.min(buttons.length - 1, index + direction))
  buttons[next]?.focus({ preventScroll: true })
  buttons[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  return buttons[next]?.dataset.taskOpen ?? null
}

export function currentTaskId(): string | null {
  return focusedTaskButton()?.dataset.taskOpen ?? null
}
