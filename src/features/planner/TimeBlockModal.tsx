import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import { durationMinutes, formatClockMinute, localDateFromIso, minuteOfDayFromIso } from './calendarLogic'

export type TimeBlockEditorState =
  | { type: 'new-event'; date: LocalDate; startMinute: number; durationMinutes?: number }
  | { type: 'new-task'; task: TaskPreview; date: LocalDate; startMinute: number; durationMinutes: number }
  | { type: 'edit'; block: TimeBlockEntity; task?: TaskPreview }

export interface TimeBlockEditorPayload {
  title: string
  date: LocalDate
  startMinute: number
  durationMinutes: number
  description?: string
  location?: string
}

export function TimeBlockModal({ editor, onClose, onSave, onDelete, onOpenTask }: {
  editor: TimeBlockEditorState | null
  onClose: () => void
  onSave: (payload: TimeBlockEditorPayload) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  onOpenTask?: (taskId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<LocalDate>('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState('30')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')

  useEffect(() => {
    if (!editor) return
    if (editor.type === 'new-event') {
      setTitle('')
      setDate(editor.date)
      setStart(formatClockMinute(editor.startMinute))
      setDuration(String(editor.durationMinutes ?? 30))
      setDescription('')
      setLocation('')
    } else if (editor.type === 'new-task') {
      setTitle(editor.task.title)
      setDate(editor.date)
      setStart(formatClockMinute(editor.startMinute))
      setDuration(String(editor.durationMinutes))
      setDescription('')
      setLocation('')
    } else {
      setTitle(editor.task?.title ?? editor.block.title)
      setDate(localDateFromIso(editor.block.start))
      setStart(formatClockMinute(minuteOfDayFromIso(editor.block.start)))
      setDuration(String(durationMinutes(editor.block.start, editor.block.end)))
      setDescription(editor.block.description ?? '')
      setLocation(editor.block.location ?? '')
    }
  }, [editor])

  if (!editor) return null
  const isTask = editor.type === 'new-task' || (editor.type === 'edit' && editor.block.kind === 'task')
  const editing = editor.type === 'edit'

  function parseStart(value: string) {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsedDuration = Number(duration)
    if (!title.trim() || !date || !Number.isFinite(parsedDuration) || parsedDuration <= 0) return
    await onSave({ title: title.trim(), date, startMinute: parseStart(start), durationMinutes: parsedDuration, description: isTask ? undefined : description.trim() || undefined, location: isTask ? undefined : location.trim() || undefined })
  }

  const taskId = editor.type === 'new-task' ? editor.task.id : editor.type === 'edit' ? editor.block.taskId : undefined

  return (
    <Modal
      open
      title={editor.type === 'new-event' ? 'Add calendar event' : editor.type === 'new-task' ? 'Schedule task' : isTask ? 'Edit work block' : 'Edit calendar event'}
      onClose={onClose}
      className="time-block-modal"
      footer={(
        <>
          {editing && onDelete ? <Button type="button" variant="ghost" className="button--danger" onClick={() => void onDelete(editor.block.id)}>Remove block</Button> : null}
          {taskId && onOpenTask ? <Button type="button" variant="ghost" onClick={() => onOpenTask(taskId)}>Open task</Button> : null}
          <span className="modal-footer-spacer" />
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="time-block-form" variant="primary">{editing ? 'Save changes' : isTask ? 'Schedule' : 'Add event'}</Button>
        </>
      )}
    >
      <form id="time-block-form" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>{isTask ? 'Task' : 'Title'}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} readOnly={isTask} autoFocus={!isTask} />
        </label>
        <div className="form-grid">
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="field"><span>Start</span><input type="time" step="900" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        </div>
        <label className="field">
          <span>Duration</span>
          <select value={duration} onChange={(event) => setDuration(event.target.value)}>
            {[...Array.from({ length: 16 }, (_, index) => (index + 1) * 15), 300, 360, 480].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
          </select>
        </label>
        {!isTask ? (
          <>
            <label className="field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional" /></label>
            <label className="field"><span>Notes</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional event notes" /></label>
          </>
        ) : null}
        <p className="calendar-editor-note">
          {isTask
            ? 'This schedules one work session. The task estimate, planned day and deadline remain independent.'
            : 'Standalone events reserve clock time but do not become tasks.'}
        </p>
      </form>
    </Modal>
  )
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`
}
