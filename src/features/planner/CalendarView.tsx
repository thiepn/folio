import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import { addLocalDays, formatLocalDate, localDateRange, startOfLocalWeek, weekdayShort } from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import { useCalendarData } from '../../hooks/useCalendarData'
import type { TaskPreview } from '../../types/ui'
import {
  blockConflicts,
  CALENDAR_END_MINUTE,
  CALENDAR_PX_PER_MINUTE,
  CALENDAR_START_MINUTE,
  clampMinute,
  durationMinutes,
  formatClockMinute,
  localDateFromIso,
  minuteOfDayFromIso,
  openMinutesInWindow,
  remainingTaskMinutes,
  roundMinute,
} from './calendarLogic'
import { TimeBlockModal, type TimeBlockEditorPayload, type TimeBlockEditorState } from './TimeBlockModal'

type CalendarMode = 'day' | 'week'

export function CalendarView({ today, onOpenTask, onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock }: {
  today: LocalDate
  onOpenTask?: (id: string) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onCreateEvent: (title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onUpdateBlock: (id: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onUpdateEvent: (id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  onDeleteBlock: (id: string) => void | Promise<void>
}) {
  const [mode, setMode] = useState<CalendarMode>('day')
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches)
  const [selectedDate, setSelectedDate] = useState(today)
  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek(today))
  const [editor, setEditor] = useState<TimeBlockEditorState | null>(null)
  const weekEnd = addLocalDays(weekStart, 6)
  const data = useCalendarData(weekStart, weekEnd)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const sync = () => {
      setCompact(media.matches)
      if (media.matches) setMode('day')
    }
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    const start = startOfLocalWeek(selectedDate)
    if (start !== weekStart && (selectedDate < weekStart || selectedDate > weekEnd)) setWeekStart(start)
  }, [selectedDate, weekStart, weekEnd])

  const dates = compact || mode === 'day' ? [selectedDate] : localDateRange(weekStart, 7)
  const conflicts = useMemo(() => blockConflicts(data?.blocks ?? []), [data?.blocks])
  const blocksForSelected = useMemo(() => (data?.blocks ?? []).filter((block) => localDateFromIso(block.start) === selectedDate), [data?.blocks, selectedDate])
  const tasksForSelected = useMemo(() => (data?.tasks ?? []).filter((task) => task.plannedDate === selectedDate && !task.completed && task.status === 'todo'), [data?.tasks, selectedDate])
  const unscheduled = useMemo(() => tasksForSelected.filter((task) => {
    const linked = (data?.allTaskBlocks ?? []).filter((block) => block.taskId === task.id)
    return task.durationMinutes ? remainingTaskMinutes(task.durationMinutes, linked, task.id) > 0 : linked.length === 0
  }), [tasksForSelected, data?.allTaskBlocks])
  const unscheduledMinutes = unscheduled.reduce((sum, task) => sum + taskRemaining(task, data?.allTaskBlocks ?? []), 0)
  const scheduledTaskMinutes = blocksForSelected.filter((block) => block.kind === 'task').reduce((sum, block) => sum + durationMinutes(block.start, block.end), 0)
  const openMinutes = openMinutesInWindow(data?.blocks ?? [], selectedDate)
  const selectedConflictCount = blocksForSelected.filter((block) => conflicts.has(block.id)).length
  const capacityTarget = data?.capacityByDate.get(selectedDate) ?? data?.defaultCapacity ?? 0
  const clockShortfall = Math.max(0, unscheduledMinutes - openMinutes)

  function navigate(direction: -1 | 1) {
    if (mode === 'day') setSelectedDate((date) => addLocalDays(date, direction))
    else {
      const next = addLocalDays(weekStart, direction * 7)
      setWeekStart(next)
      setSelectedDate(next)
    }
  }

  function resetToday() {
    setSelectedDate(today)
    setWeekStart(startOfLocalWeek(today))
  }

  function scheduleTask(task: TaskPreview, date = selectedDate, startMinute = 9 * 60) {
    setEditor({ type: 'new-task', task, date, startMinute, durationMinutes: taskRemaining(task, data?.allTaskBlocks ?? []) })
  }

  async function saveEditor(payload: TimeBlockEditorPayload) {
    if (!editor) return
    if (editor.type === 'new-event') await onCreateEvent(payload.title, payload.date, payload.startMinute, payload.durationMinutes, { description: payload.description, location: payload.location })
    else if (editor.type === 'new-task') await onCreateTaskBlock(editor.task.id, payload.date, payload.startMinute, payload.durationMinutes)
    else if (editor.block.kind === 'event') await onUpdateEvent(editor.block.id, payload.title, payload.date, payload.startMinute, payload.durationMinutes, { description: payload.description, location: payload.location })
    else await onUpdateBlock(editor.block.id, payload.date, payload.startMinute, payload.durationMinutes)
    setEditor(null)
  }

  async function deleteEditor(id: string) {
    await onDeleteBlock(id)
    setEditor(null)
  }

  if (!data) return <div className="planner-loading">Loading calendar…</div>

  return (
    <div className="calendar-workspace">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar__nav">
          <button onClick={() => navigate(-1)} aria-label={mode === 'day' ? 'Previous day' : 'Previous week'}>←</button>
          <Button variant="ghost" onClick={resetToday}>Today</Button>
          <button onClick={() => navigate(1)} aria-label={mode === 'day' ? 'Next day' : 'Next week'}>→</button>
        </div>
        <div className="calendar-toolbar__title">
          <strong>{mode === 'day' ? formatLocalDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }) : formatWeekRange(weekStart, weekEnd)}</strong>
          <span>Exact scheduling · 15-minute grid</span>
        </div>
        <Tabs<CalendarMode> value={mode} tabs={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} onChange={setMode} />
        <Button variant="outline" onClick={() => setEditor({ type: 'new-event', date: selectedDate, startMinute: 9 * 60 })}>+ Event</Button>
      </div>

      <div className="calendar-summary">
        <span><b>{formatDuration(scheduledTaskMinutes)}</b> task time scheduled</span>
        <span><b>{formatDuration(unscheduledMinutes)}</b> planned work unscheduled</span>
        <span><b>{formatDuration(capacityTarget)}</b> day capacity</span>
        <span><b>{formatDuration(openMinutes)}</b> open 06:00–22:00</span>
        <span className={clockShortfall ? 'is-warning' : ''}><b>{clockShortfall ? formatDuration(clockShortfall) : 'Fits'}</b> clock fit</span>
        <span className={selectedConflictCount ? 'is-warning' : ''}><b>{selectedConflictCount}</b> conflict{selectedConflictCount === 1 ? '' : 's'}</span>
      </div>

      <div className="calendar-layout calendar-layout--phase8">
        <aside className="calendar-unscheduled">
          <header>
            <span className="eyebrow">Unscheduled</span>
            <strong>{formatLocalDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
          </header>
          <p>Tasks planned for this day that still need clock time.</p>
          <div className="calendar-unscheduled__list">
            {unscheduled.length ? unscheduled.map((task) => (
              <article
                key={task.id}
                className="calendar-unscheduled-card"
                draggable={!compact}
                onDragStart={(event) => {
                  event.dataTransfer.setData('calendar/task-id', task.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <button className="calendar-unscheduled-card__main" onClick={() => onOpenTask?.(task.id)}>
                  <strong>{task.title}</strong>
                  <span>{task.project ?? 'No project'}</span>
                </button>
                <div>
                  <span>{formatDuration(taskRemaining(task, data.allTaskBlocks))}</span>
                  <button onClick={() => scheduleTask(task)}>Schedule</button>
                </div>
              </article>
            )) : <div className="calendar-empty">Everything planned for this day has clock time.</div>}
          </div>
          <div className="calendar-unscheduled__note">
            <strong>Multiple sessions are supported.</strong>
            <span>A 3h task can become three separate 60m blocks.</span>
          </div>
        </aside>

        <CalendarGrid
          dates={dates}
          today={today}
          selectedDate={selectedDate}
          blocks={data.blocks}
          taskMap={data.taskMap}
          conflicts={conflicts}
          onSelectDate={setSelectedDate}
          onOpenBlock={(block) => setEditor({ type: 'edit', block, task: block.taskId ? data.taskMap.get(block.taskId) : undefined })}
          onCreateEvent={(date, startMinute) => { setSelectedDate(date); setEditor({ type: 'new-event', date, startMinute }) }}
          onCreateTaskBlock={(taskId, date, startMinute) => {
            const task = data.taskMap.get(taskId)
            if (!task) return
            setSelectedDate(date)
            scheduleTask(task, date, startMinute)
          }}
          onMoveBlock={onUpdateBlock}
          onResizeBlock={onResizeBlock}
          dragEnabled={!compact}
        />
      </div>

      <TimeBlockModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSave={saveEditor}
        onDelete={deleteEditor}
        onOpenTask={(id) => { setEditor(null); onOpenTask?.(id) }}
      />
    </div>
  )
}

function CalendarGrid({ dates, today, selectedDate, blocks, taskMap, conflicts, onSelectDate, onOpenBlock, onCreateEvent, onCreateTaskBlock, onMoveBlock, onResizeBlock, dragEnabled }: {
  dates: LocalDate[]
  today: LocalDate
  selectedDate: LocalDate
  blocks: TimeBlockEntity[]
  taskMap: Map<string, TaskPreview>
  conflicts: Set<string>
  onSelectDate: (date: LocalDate) => void
  onOpenBlock: (block: TimeBlockEntity) => void
  onCreateEvent: (date: LocalDate, startMinute: number) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number) => void
  onMoveBlock: (id: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  dragEnabled: boolean
}) {
  const hours = Array.from({ length: (CALENDAR_END_MINUTE - CALENDAR_START_MINUTE) / 60 + 1 }, (_, index) => CALENDAR_START_MINUTE + index * 60)

  function drop(event: DragEvent<HTMLDivElement>, date: LocalDate) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = CALENDAR_START_MINUTE + (event.clientY - rect.top) / CALENDAR_PX_PER_MINUTE
    const minute = clampMinute(roundMinute(raw))
    const taskId = event.dataTransfer.getData('calendar/task-id')
    if (taskId) {
      onCreateTaskBlock(taskId, date, minute)
      return
    }
    const blockId = event.dataTransfer.getData('calendar/block-id')
    const block = blocks.find((item) => item.id === blockId)
    if (block) void onMoveBlock(block.id, date, minute, durationMinutes(block.start, block.end))
  }

  return (
    <div className={`calendar-timegrid ${dates.length > 1 ? 'calendar-timegrid--week' : 'calendar-timegrid--day'}`} style={{ '--calendar-days': dates.length } as CSSProperties}>
      <div className="calendar-timegrid__headers">
        <div />
        {dates.map((date) => (
          <button key={date} className={`${date === today ? 'is-today' : ''} ${date === selectedDate ? 'is-selected' : ''}`} onClick={() => onSelectDate(date)}>
            <span>{weekdayShort(date)}</span>
            <strong>{formatLocalDate(date, { day: 'numeric' })}</strong>
          </button>
        ))}
      </div>
      <div className="calendar-timegrid__scroll">
        <div className="calendar-timegrid__labels">
          {hours.map((minute) => <span key={minute} style={{ top: (minute - CALENDAR_START_MINUTE) * CALENDAR_PX_PER_MINUTE }}>{formatClockMinute(minute)}</span>)}
        </div>
        <div className="calendar-timegrid__days">
          {dates.map((date) => (
            <div
              key={date}
              className={`calendar-day-column ${date === today ? 'is-today' : ''}`}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes('calendar/task-id') ? 'copy' : 'move' }}
              onDrop={(event) => drop(event, date)}
              onDoubleClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const minute = clampMinute(roundMinute(CALENDAR_START_MINUTE + (event.clientY - rect.top) / CALENDAR_PX_PER_MINUTE))
                onCreateEvent(date, minute)
              }}
            >
              {hours.map((minute) => <i className="calendar-hour-rule" key={minute} style={{ top: (minute - CALENDAR_START_MINUTE) * CALENDAR_PX_PER_MINUTE }} />)}
              {date === today ? <CurrentTimeLine /> : null}
              {blocks.filter((block) => localDateFromIso(block.start) === date).map((block) => (
                <CalendarBlock
                  key={block.id}
                  block={block}
                  task={block.taskId ? taskMap.get(block.taskId) : undefined}
                  conflict={conflicts.has(block.id)}
                  onOpen={() => onOpenBlock(block)}
                  onResize={(minutes) => void onResizeBlock(block.id, minutes)}
                  dragEnabled={dragEnabled}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarBlock({ block, task, conflict, onOpen, onResize, dragEnabled }: {
  block: TimeBlockEntity
  task?: TaskPreview
  conflict: boolean
  onOpen: () => void
  onResize: (durationMinutes: number) => void
  dragEnabled: boolean
}) {
  const originalDuration = durationMinutes(block.start, block.end)
  const [previewDuration, setPreviewDuration] = useState(originalDuration)
  useEffect(() => setPreviewDuration(originalDuration), [originalDuration])
  const startMinute = minuteOfDayFromIso(block.start)
  const visibleStart = Math.max(CALENDAR_START_MINUTE, startMinute)
  const visibleEnd = Math.min(CALENDAR_END_MINUTE, startMinute + previewDuration)
  const top = (visibleStart - CALENDAR_START_MINUTE) * CALENDAR_PX_PER_MINUTE
  const height = Math.max(22, (visibleEnd - visibleStart) * CALENDAR_PX_PER_MINUTE)

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startingDuration = previewDuration
    let nextDuration = startingDuration
    function move(pointer: PointerEvent) {
      const delta = (pointer.clientY - startY) / CALENDAR_PX_PER_MINUTE
      nextDuration = Math.max(15, roundMinute(startingDuration + delta))
      setPreviewDuration(nextDuration)
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (nextDuration !== originalDuration) onResize(nextDuration)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <article
      className={`calendar-block calendar-block--${block.kind} ${conflict ? 'is-conflict' : ''}`}
      style={{ top, height }}
      draggable={dragEnabled}
      onDragStart={(event) => {
        event.dataTransfer.setData('calendar/block-id', block.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button className="calendar-block__main" onClick={onOpen}>
        <strong>{task?.title ?? block.title}</strong>
        <span>{formatClockMinute(startMinute)}–{formatClockMinute(startMinute + previewDuration)}</span>
        {task?.project ? <em>{task.project}</em> : block.kind === 'event' ? <em>{block.location || 'Event'}</em> : null}
      </button>
      {conflict ? <span className="calendar-block__conflict" title="Overlaps another block">!</span> : null}
      <button className="calendar-block__resize" aria-label="Resize time block" onPointerDown={beginResize} />
    </article>
  )
}

function CurrentTimeLine() {
  const now = new Date()
  const minute = now.getHours() * 60 + now.getMinutes()
  if (minute < CALENDAR_START_MINUTE || minute > CALENDAR_END_MINUTE) return null
  return <span className="calendar-now-line" style={{ top: (minute - CALENDAR_START_MINUTE) * CALENDAR_PX_PER_MINUTE }}><i /></span>
}

function taskRemaining(task: TaskPreview, blocks: TimeBlockEntity[]) {
  if (!task.durationMinutes) return blocks.some((block) => block.taskId === task.id) ? 0 : 30
  return Math.max(15, remainingTaskMinutes(task.durationMinutes, blocks, task.id))
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`
}

function formatWeekRange(start: LocalDate, end: LocalDate) {
  const startMonth = formatLocalDate(start, { month: 'short' })
  const endMonth = formatLocalDate(end, { month: 'short' })
  const startDay = formatLocalDate(start, { day: 'numeric' })
  const endDay = formatLocalDate(end, { day: 'numeric' })
  return startMonth === endMonth ? `${startMonth} ${startDay}–${endDay}` : `${startMonth} ${startDay} – ${endMonth} ${endDay}`
}
