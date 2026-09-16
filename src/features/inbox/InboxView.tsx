import { useEffect, useMemo, useState } from 'react'
import { localDateKey } from '../../domain/date'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Panel } from '../../components/ui/Panel'
import { TaskRow } from '../../components/ui/TaskRow'
import { EmptyState } from '../../components/ui/EmptyState'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskPreview } from '../../types/ui'

export function InboxView({ tasks, projects, onAdd, onTrash, onToggle, onOpen, onProcess }: {
  tasks: TaskPreview[]
  projects: ProjectSummary[]
  onAdd: () => void
  onTrash: () => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onProcess: (id: string, options?: { plannedDate?: string; projectId?: string }) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(tasks[0]?.id ?? null)
  const [projectId, setProjectId] = useState('')
  const activeIndex = Math.max(0, tasks.findIndex((task) => task.id === activeId))
  const activeTask = tasks[activeIndex]

  useEffect(() => {
    if (!tasks.length) setActiveId(null)
    else if (!tasks.some((task) => task.id === activeId)) setActiveId(tasks[0].id)
  }, [tasks, activeId])

  useEffect(() => { setProjectId(activeTask?.projectId ?? '') }, [activeTask?.id, activeTask?.projectId])

  const shortcutHint = useMemo(() => tasks.length ? 'J/K select · T today · P to-do · Enter details' : '', [tasks.length])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!tasks.length || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) return
      const key = event.key.toLowerCase()
      if (key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); setActiveId(tasks[Math.min(tasks.length - 1, activeIndex + 1)].id) }
      if (key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); setActiveId(tasks[Math.max(0, activeIndex - 1)].id) }
      if (key === 't' && activeTask) { event.preventDefault(); onProcess(activeTask.id, { plannedDate: localDateKey(), projectId: projectId || undefined }) }
      if (key === 'p' && activeTask) { event.preventDefault(); onProcess(activeTask.id, { projectId: projectId || undefined }) }
      if (event.key === 'Enter' && activeTask) { event.preventDefault(); onOpen(activeTask.id) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [tasks, activeIndex, activeTask, projectId, onProcess, onOpen])

  return (
    <>
      <PageHeader
        kicker="Capture first. Decide second."
        title="Inbox"
        subtitle="Triage captured tasks quickly: give them a project, plan them, leave them unassigned, or inspect the details only when needed."
        action={<div className="header-actions"><Button onClick={onTrash}>Trash</Button><Button variant="primary" icon="plus" onClick={onAdd}>Add task</Button></div>}
      />
      <Panel title="Unprocessed" meta={`${tasks.length} items`}>
        {tasks.length ? <div className="inbox-triage-list">{tasks.map((task) => <div className={`inbox-triage-item ${task.id === activeTask?.id ? 'is-active' : ''}`} key={task.id} onMouseEnter={() => setActiveId(task.id)} onFocus={() => setActiveId(task.id)}><TaskRow task={task} onToggle={onToggle} onOpen={onOpen} /></div>)}</div> : <EmptyState title="Inbox clear" body="Nothing is waiting for a decision. Capture loose thoughts here instead of organizing them prematurely." action={<Button variant="primary" icon="plus" onClick={onAdd}>Capture to inbox</Button>} />}
        {activeTask ? <div className="inbox-triage-bar">
          <div className="inbox-triage-bar__identity"><span>Selected</span><strong>{activeTask.title}</strong></div>
          <label><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <div className="inbox-triage-actions"><Button onClick={() => onProcess(activeTask.id, { projectId: projectId || undefined })}>To-do</Button><Button variant="primary" onClick={() => onProcess(activeTask.id, { plannedDate: localDateKey(), projectId: projectId || undefined })}>Plan today</Button></div>
        </div> : null}
      </Panel>
      {shortcutHint ? <div className="keyboard-hint">{shortcutHint}</div> : null}
    </>
  )
}
