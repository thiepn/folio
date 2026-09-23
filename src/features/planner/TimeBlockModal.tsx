import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { addLocalDays, dateKeyInTimeZone, minuteOfDayInTimeZone } from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import type { TaskPreview } from '../../types/ui'
import { durationMinutes, formatClockMinute } from './calendarLogic'

export type TimeBlockEditorState =
  | { type: 'new-event'; date: LocalDate; startMinute: number; durationMinutes?: number; allDay?: boolean; timeZone?: string }
  | { type: 'new-task'; task: TaskPreview; date: LocalDate; startMinute: number; durationMinutes: number; timeZone?: string }
  | { type: 'edit'; block: TimeBlockEntity; task?: TaskPreview; timeZone?: string }

export interface TimeBlockEditorPayload {
  title: string
  date: LocalDate
  startMinute: number
  durationMinutes: number
  description?: string
  location?: string
  allDay?: boolean
  endDateExclusive?: LocalDate
  timeZone?: string
}

export function TimeBlockModal({ editor, onClose, onSave, onDelete, onDuplicate, onOpenTask }: {
  editor: TimeBlockEditorState | null
  onClose: () => void
  onSave: (payload: TimeBlockEditorPayload) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  onDuplicate?: (id: string) => void | Promise<void>
  onOpenTask?: (taskId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<LocalDate>('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState('30')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [endDateExclusive, setEndDateExclusive] = useState<LocalDate>('')
  const [timeZone, setTimeZone] = useState('local')

  useEffect(() => {
    if (!editor) return
    const zone = editor.timeZone ?? (editor.type === 'edit' ? editor.block.timeZone : undefined) ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local'
    setTimeZone(zone)
    if (editor.type === 'new-event') {
      setTitle('')
      setDate(editor.date)
      setStart(formatClockMinute(editor.startMinute))
      setDuration(String(editor.durationMinutes ?? 30))
      setDescription('')
      setLocation('')
      setAllDay(Boolean(editor.allDay))
      setEndDateExclusive(addLocalDays(editor.date, 1))
    } else if (editor.type === 'new-task') {
      setTitle(editor.task.title)
      setDate(editor.date)
      setStart(formatClockMinute(editor.startMinute))
      setDuration(String(editor.durationMinutes))
      setDescription('')
      setLocation('')
      setAllDay(false)
      setEndDateExclusive(addLocalDays(editor.date, 1))
    } else {
      const blockZone = editor.timeZone ?? editor.block.timeZone ?? zone
      setTitle(editor.task?.title ?? editor.block.title)
      setDate(dateKeyInTimeZone(editor.block.start, blockZone))
      setStart(formatClockMinute(minuteOfDayInTimeZone(editor.block.start, blockZone)))
      setDuration(String(durationMinutes(editor.block.start, editor.block.end)))
      setDescription(editor.block.description ?? '')
      setLocation(editor.block.location ?? '')
      setAllDay(Boolean(editor.block.allDay))
      setEndDateExclusive(editor.block.allDay ? dateKeyInTimeZone(editor.block.end, blockZone) : addLocalDays(dateKeyInTimeZone(editor.block.start, blockZone), 1))
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
    if (!title.trim() || !date) return
    if (!allDay && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) return
    if (allDay && (!endDateExclusive || endDateExclusive <= date)) return
    await onSave({
      title: title.trim(),
      date,
      startMinute: allDay ? 0 : parseStart(start),
      durationMinutes: allDay ? 24 * 60 : parsedDuration,
      description: isTask ? undefined : description.trim() || undefined,
      location: isTask ? undefined : location.trim() || undefined,
      allDay: !isTask && allDay,
      endDateExclusive: !isTask && allDay ? endDateExclusive : undefined,
      timeZone,
    })
  }

  const taskId = editor.type === 'new-task' ? editor.task.id : editor.type === 'edit' ? editor.block.taskId : undefined
  const imported = editor.type === 'edit' && editor.block.source === 'ics'

  return (
    <Modal
      open
      title={editor.type === 'new-event' ? 'Add calendar event' : editor.type === 'new-task' ? 'Schedule task' : isTask ? 'Edit work block' : 'Edit calendar event'}
      onClose={onClose}
      className="time-block-modal"
      footer={(
        <>
          {editing && onDelete ? <Button type="button" variant="ghost" className="button--danger" onClick={() => void onDelete(editor.block.id)}>Remove block</Button> : null}
          {editing && onDuplicate ? <Button type="button" variant="ghost" onClick={() => void onDuplicate(editor.block.id)}>Duplicate</Button> : null}
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

        {!isTask ? <label className="check-field"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /><span>All-day event</span></label> : null}

        {allDay && !isTask ? (
          <div className="form-grid">
            <label className="field"><span>Starts</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (endDateExclusive <= event.target.value) setEndDateExclusive(addLocalDays(event.target.value, 1)) }} /></label>
            <label className="field"><span>Ends before</span><input type="date" min={addLocalDays(date, 1)} value={endDateExclusive} onChange={(event) => setEndDateExclusive(event.target.value)} /></label>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="field"><span>Start</span><input type="time" step="900" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            </div>
            <label className="field">
              <span>Duration</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                {[...Array.from({ length: 16 }, (_, index) => (index + 1) * 15), 300, 360, 480, 720].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
              </select>
            </label>
          </>
        )}

        <label className="field"><span>Calendar time zone</span><input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/Berlin" /></label>

        {!isTask ? (
          <>
            <label className="field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional" /></label>
            <label className="field"><span>Notes</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional event notes" /></label>
          </>
        ) : null}

        {imported ? <p className="calendar-editor-source">Imported from {editor.block.sourceCalendar || 'an iCalendar source'}{editor.block.sourceUid ? ' · ' + editor.block.sourceUid : ''}</p> : null}
        <p className="calendar-editor-note">
          {isTask
            ? 'This schedules one work session. The task estimate, planned day and deadline remain independent.'
            : allDay
              ? 'All-day events occupy date lanes rather than clock time. The end date is exclusive.'
              : 'Standalone events reserve exact clock time but do not become tasks.'}
        </p>
      </form>
    </Modal>
  )
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? String(hours) + 'h' + (rest ? ' ' + String(rest) + 'm' : '') : String(rest) + 'm'
}
