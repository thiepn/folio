import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import {
  addLocalDays, addLocalMonths, dateKeyInTimeZone, formatLocalDate, formatTimeInZone,
  localDateRange, localDateToDate, localMonthGrid, minuteOfDayInTimeZone, startOfLocalMonth, startOfLocalWeek, weekdayShort,
} from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import { useCalendarData } from '../../hooks/useCalendarData'
import type { TaskPreview } from '../../types/ui'
import {
  allDayBlocksForDate, blockConflicts, blockEndMinuteForDate, blockStartMinuteForDate,
  blockTouchesDate, CALENDAR_END_MINUTE, CALENDAR_PX_PER_MINUTE, CALENDAR_START_MINUTE,
  calendarRangeForMode, clampMinute, durationMinutes, formatClockMinute, layoutTimedBlocks,
  openMinutesInWindow, remainingTaskMinutes, roundMinute,
} from './calendarLogic'
import { TimeBlockModal, type TimeBlockEditorPayload, type TimeBlockEditorState } from './TimeBlockModal'

export type CalendarV2Mode = 'agenda' | 'day' | '3day' | 'week' | 'multiweek' | 'month' | 'year'

interface CalendarEventDetails {
  description?: string
  location?: string
  allDay?: boolean
  endDateExclusive?: LocalDate
  timeZone?: string
}

export function CalendarV2View({
  today, anchorDate, onSelectedDateChange, onOpenTask,
  onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock, onDuplicateBlock,
}: {
  today: LocalDate
  anchorDate?: LocalDate
  onSelectedDateChange?: (date: LocalDate) => void
  onOpenTask?: (id: string) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number, durationMinutes: number, timeZone?: string) => void | Promise<void>
  onCreateEvent: (title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: CalendarEventDetails) => void | Promise<void>
  onUpdateBlock: (id: string, date: LocalDate, startMinute: number, durationMinutes: number, timeZone?: string) => void | Promise<void>
  onUpdateEvent: (id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: CalendarEventDetails) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  onDeleteBlock: (id: string) => void | Promise<void>
  onDuplicateBlock: (id: string, date?: LocalDate, startMinute?: number, timeZone?: string) => void | Promise<void>
}) {
  const initialCompact = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  const [compact, setCompact] = useState(initialCompact)
  const [mode, setMode] = useState<CalendarV2Mode>(initialCompact ? 'day' : 'week')
  const [selectedDate, setSelectedDate] = useState<LocalDate>(anchorDate ?? today)
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const [timeZone, setTimeZone] = useState(localZone)
  const [taskSource, setTaskSource] = useState('day')
  const [taskSearch, setTaskSearch] = useState('')
  const [editor, setEditor] = useState<TimeBlockEditorState | null>(null)

  const range = useMemo(() => calendarRangeForMode(mode, selectedDate), [mode, selectedDate])
  const data = useCalendarData(range.from, range.through, timeZone)

  useEffect(() => {
    if (!anchorDate) return
    setSelectedDate(anchorDate)
  }, [anchorDate])

  useEffect(() => {
    onSelectedDateChange?.(selectedDate)
  }, [selectedDate, onSelectedDateChange])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const sync = () => {
      setCompact(media.matches)
      if (media.matches && (mode === 'week' || mode === '3day')) setMode('day')
    }
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [mode])

  const timeZoneOptions = useMemo(() => {
    const values = [localZone, 'UTC', ...(data?.timeZones ?? [])]
    return [...new Set(values.filter(Boolean))]
  }, [data?.timeZones, localZone])

  const conflicts = useMemo(() => blockConflicts(data?.blocks ?? []), [data?.blocks])

  const sourceIds = useMemo(() => {
    if (!data || !taskSource.startsWith('smart:')) return undefined
    return new Set(data.smartViewTaskIds[taskSource.slice('smart:'.length)] ?? [])
  }, [data, taskSource])

  const sidebarTasks = useMemo(() => {
    if (!data) return []
    const query = taskSearch.trim().toLocaleLowerCase()
    return data.tasks
      .filter((task) => task.status === 'todo' && !task.completed)
      .filter((task) => {
        if (taskSource === 'day') return task.plannedDate === selectedDate
        if (taskSource === 'all') return true
        return sourceIds?.has(task.id)
      })
      .filter((task) => taskRemaining(task, data.allTaskBlocks) > 0)
      .filter((task) => !query || [task.title, task.project, task.list, ...(task.tags ?? [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const planned = (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999')
        if (planned) return planned
        const rank = { critical: 0, high: 1, normal: 2 }
        return rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title)
      })
  }, [data, taskSource, sourceIds, selectedDate, taskSearch])

  const selectedBlocks = useMemo(() => (data?.blocks ?? []).filter((block) => blockTouchesDate(block, selectedDate, timeZone)), [data?.blocks, selectedDate, timeZone])
  const selectedTimed = selectedBlocks.filter((block) => !block.allDay)
  const selectedAllDay = selectedBlocks.filter((block) => block.allDay)
  const scheduledTaskMinutes = selectedTimed
    .filter((block) => block.kind === 'task')
    .reduce((sum, block) => sum + Math.max(0, blockEndMinuteForDate(block, selectedDate, timeZone) - blockStartMinuteForDate(block, selectedDate, timeZone)), 0)
  const unscheduledMinutes = sidebarTasks.filter((task) => task.plannedDate === selectedDate).reduce((sum, task) => sum + taskRemaining(task, data?.allTaskBlocks ?? []), 0)
  const workingOpenMinutes = openMinutesInWindow(data?.blocks ?? [], selectedDate, 6 * 60, 22 * 60, timeZone)
  const conflictCount = selectedTimed.filter((block) => conflicts.has(block.id)).length
  const capacityTarget = data?.capacityByDate.get(selectedDate) ?? data?.defaultCapacity ?? 0

  function navigate(direction: -1 | 1) {
    if (mode === 'day') setSelectedDate((date) => addLocalDays(date, direction))
    else if (mode === '3day') setSelectedDate((date) => addLocalDays(date, direction * 3))
    else if (mode === 'week') setSelectedDate((date) => addLocalDays(date, direction * 7))
    else if (mode === 'multiweek') setSelectedDate((date) => addLocalDays(date, direction * 28))
    else if (mode === 'month') setSelectedDate((date) => addLocalMonths(date, direction))
    else if (mode === 'year') setSelectedDate((date) => addLocalMonths(date, direction * 12))
    else setSelectedDate((date) => addLocalDays(date, direction * 30))
  }

  function resetToday() {
    setSelectedDate(today)
  }

  function scheduleTask(task: TaskPreview, date = selectedDate, startMinute = 9 * 60) {
    setEditor({ type: 'new-task', task, date, startMinute, durationMinutes: taskRemaining(task, data?.allTaskBlocks ?? []), timeZone })
  }

  async function saveEditor(payload: TimeBlockEditorPayload) {
    if (!editor) return
    if (editor.type === 'new-event') {
      await onCreateEvent(payload.title, payload.date, payload.startMinute, payload.durationMinutes, payload)
    } else if (editor.type === 'new-task') {
      await onCreateTaskBlock(editor.task.id, payload.date, payload.startMinute, payload.durationMinutes, payload.timeZone)
    } else if (editor.block.kind === 'event') {
      await onUpdateEvent(editor.block.id, payload.title, payload.date, payload.startMinute, payload.durationMinutes, payload)
    } else {
      await onUpdateBlock(editor.block.id, payload.date, payload.startMinute, payload.durationMinutes, payload.timeZone)
    }
    setEditor(null)
  }

  async function deleteEditor(id: string) {
    await onDeleteBlock(id)
    setEditor(null)
  }

  async function duplicateEditor(id: string) {
    await onDuplicateBlock(id, undefined, undefined, timeZone)
    setEditor(null)
  }

  function editBlock(block: TimeBlockEntity) {
    setEditor({ type: 'edit', block, task: block.taskId ? data?.taskMap.get(block.taskId) : undefined, timeZone })
  }

  async function moveBlock(block: TimeBlockEntity, date: LocalDate, startMinute?: number) {
    if (block.allDay && block.kind === 'event') {
      const startDate = dateKeyInTimeZone(block.start, timeZone)
      const endDateExclusive = dateKeyInTimeZone(block.end, timeZone)
      const days = Math.max(1, Math.round((localDateToDate(endDateExclusive).getTime() - localDateToDate(startDate).getTime()) / 86_400_000))
      await onUpdateEvent(block.id, block.title, date, 0, days * 24 * 60, {
        description: block.description,
        location: block.location,
        allDay: true,
        endDateExclusive: addLocalDays(date, days),
        timeZone,
      })
      return
    }
    const minute = startMinute ?? minuteOfDayInTimeZone(block.start, timeZone)
    const duration = durationMinutes(block.start, block.end)
    if (block.kind === 'event') {
      await onUpdateEvent(block.id, block.title, date, minute, duration, {
        description: block.description,
        location: block.location,
        allDay: false,
        timeZone,
      })
    } else {
      await onUpdateBlock(block.id, date, minute, duration, timeZone)
    }
  }

  if (!data) return <div className="planner-loading">Loading Calendar V2…</div>

  const timeGridDates =
    mode === 'day' ? [selectedDate]
      : mode === '3day' ? localDateRange(selectedDate, 3)
        : localDateRange(startOfLocalWeek(selectedDate), 7)

  const matrixDates =
    mode === 'multiweek' ? localDateRange(startOfLocalWeek(selectedDate), 28)
      : mode === 'month' ? localMonthGrid(selectedDate)
        : []

  return (
    <div className="calendar-v2">
      <header className="calendar-v2-toolbar">
        <div className="calendar-v2-toolbar__nav">
          <button onClick={() => navigate(-1)} aria-label="Previous calendar range">←</button>
          <Button variant="ghost" onClick={resetToday}>Today</Button>
          <button onClick={() => navigate(1)} aria-label="Next calendar range">→</button>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Selected calendar date" />
        </div>
        <div className="calendar-v2-toolbar__title">
          <strong>{rangeLabel(mode, selectedDate, range.from, range.through)}</strong>
          <span>{timeZone} · exact scheduling + all-day lanes</span>
        </div>
        <div className="calendar-v2-toolbar__actions">
          <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} aria-label="Calendar time zone">
            {timeZoneOptions.map((zone) => <option value={zone} key={zone}>{zone === localZone ? zone + ' · local' : zone}</option>)}
          </select>
          <Button variant="outline" onClick={() => setEditor({ type: 'new-event', date: selectedDate, startMinute: 9 * 60, timeZone })}>+ Event</Button>
          <Button variant="outline" onClick={() => setEditor({ type: 'new-event', date: selectedDate, startMinute: 0, allDay: true, timeZone })}>+ All-day</Button>
        </div>
      </header>

      <Tabs<CalendarV2Mode>
        value={mode}
        tabs={[
          { value: 'agenda', label: 'Agenda' },
          { value: 'day', label: 'Day' },
          { value: '3day', label: '3 Day' },
          { value: 'week', label: 'Week' },
          { value: 'multiweek', label: '4 Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        onChange={(next) => setMode(compact && (next === 'week' || next === '3day') ? 'day' : next)}
      />

      <section className="calendar-v2-summary">
        <span><b>{formatDuration(scheduledTaskMinutes)}</b> task time</span>
        <span><b>{formatDuration(unscheduledMinutes)}</b> selected-day work left</span>
        <span><b>{formatDuration(capacityTarget)}</b> capacity</span>
        <span><b>{formatDuration(workingOpenMinutes)}</b> open 06–22</span>
        <span><b>{selectedAllDay.length}</b> all-day</span>
        <span className={conflictCount ? 'is-warning' : ''}><b>{conflictCount}</b> conflict{conflictCount === 1 ? '' : 's'}</span>
      </section>

      <div className="calendar-v2-layout">
        <CalendarSidebar
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={sidebarTasks}
          allBlocks={data.allTaskBlocks}
          taskSource={taskSource}
          onTaskSource={setTaskSource}
          smartViews={data.smartViews}
          search={taskSearch}
          onSearch={setTaskSearch}
          onOpenTask={onOpenTask}
          onSchedule={scheduleTask}
          compact={compact}
        />

        <main className="calendar-v2-main">
          {mode === 'agenda' ? <AgendaCalendar
            from={range.from}
            through={range.through}
            blocks={data.blocks}
            taskMap={data.taskMap}
            timeZone={timeZone}
            onSelectDate={setSelectedDate}
            onOpenBlock={editBlock}
          /> : null}

          {mode === 'day' || mode === '3day' || mode === 'week' ? <CalendarTimeGridV2
            dates={timeGridDates}
            today={today}
            selectedDate={selectedDate}
            blocks={data.blocks}
            taskMap={data.taskMap}
            conflicts={conflicts}
            timeZone={timeZone}
            onSelectDate={setSelectedDate}
            onOpenBlock={editBlock}
            onCreateEvent={(date, minute) => { setSelectedDate(date); setEditor({ type: 'new-event', date, startMinute: minute, timeZone }) }}
            onCreateAllDay={(date) => { setSelectedDate(date); setEditor({ type: 'new-event', date, startMinute: 0, allDay: true, timeZone }) }}
            onCreateTaskBlock={(taskId, date, minute) => {
              const task = data.taskMap.get(taskId)
              if (task) scheduleTask(task, date, minute)
            }}
            onMoveBlock={moveBlock}
            onDuplicateBlock={(id, date, minute) => onDuplicateBlock(id, date, minute, timeZone)}
            onResizeBlock={onResizeBlock}
            dragEnabled={!compact}
          /> : null}

          {mode === 'multiweek' || mode === 'month' ? <CalendarDateMatrix
            dates={matrixDates}
            anchorMonth={startOfLocalMonth(selectedDate)}
            today={today}
            selectedDate={selectedDate}
            blocks={data.blocks}
            taskMap={data.taskMap}
            timeZone={timeZone}
            onSelectDate={setSelectedDate}
            onOpenDay={(date) => { setSelectedDate(date); setMode('day') }}
            onOpenBlock={editBlock}
            onCreateEvent={(date) => setEditor({ type: 'new-event', date, startMinute: 9 * 60, timeZone })}
            onCreateTaskBlock={(taskId, date) => {
              const task = data.taskMap.get(taskId)
              if (task) scheduleTask(task, date, 9 * 60)
            }}
            onMoveBlock={moveBlock}
            onDuplicateBlock={(id, date) => onDuplicateBlock(id, date, undefined, timeZone)}
          /> : null}

          {mode === 'year' ? <CalendarYearView
            year={Number(selectedDate.slice(0, 4))}
            today={today}
            blocks={data.blocks}
            timeZone={timeZone}
            onSelectDate={(date) => { setSelectedDate(date); setMode('day') }}
          /> : null}
        </main>
      </div>

      <TimeBlockModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSave={saveEditor}
        onDelete={deleteEditor}
        onDuplicate={duplicateEditor}
        onOpenTask={(id) => { setEditor(null); onOpenTask?.(id) }}
      />
    </div>
  )
}

function CalendarSidebar({ today, selectedDate, onSelectDate, tasks, allBlocks, taskSource, onTaskSource, smartViews, search, onSearch, onOpenTask, onSchedule, compact }: {
  today: LocalDate
  selectedDate: LocalDate
  onSelectDate: (date: LocalDate) => void
  tasks: TaskPreview[]
  allBlocks: TimeBlockEntity[]
  taskSource: string
  onTaskSource: (value: string) => void
  smartViews: Array<{ id: string; name: string; builtin?: boolean }>
  search: string
  onSearch: (value: string) => void
  onOpenTask?: (id: string) => void
  onSchedule: (task: TaskPreview, date?: LocalDate, startMinute?: number) => void
  compact: boolean
}) {
  return <aside className="calendar-v2-sidebar">
    <MiniCalendar selectedDate={selectedDate} today={today} onSelect={onSelectDate} />
    <section className="calendar-task-source">
      <header><span className="eyebrow">Schedule tasks</span><strong>{tasks.length}</strong></header>
      <select value={taskSource} onChange={(event) => onTaskSource(event.target.value)}>
        <option value="day">Planned for selected day</option>
        <option value="all">All work needing time</option>
        <optgroup label="Smart Views">
          {smartViews.map((view) => <option value={'smart:' + view.id} key={view.id}>{view.name}</option>)}
        </optgroup>
      </select>
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter tasks…" />
      <div className="calendar-task-source__list">
        {tasks.map((task) => <article
          key={task.id}
          className="calendar-task-card"
          draggable={!compact}
          onDragStart={(event) => {
            event.dataTransfer.setData('calendar/task-id', task.id)
            event.dataTransfer.effectAllowed = 'copy'
          }}
        >
          <button onClick={() => onOpenTask?.(task.id)}>
            <strong>{task.title}</strong>
            <span>{[task.project, task.list, task.plannedDate ? 'Plan ' + task.plannedDate : 'No planned date'].filter(Boolean).join(' · ')}</span>
          </button>
          <div><span>{formatDuration(taskRemaining(task, allBlocks))}</span><button onClick={() => onSchedule(task)}>Schedule</button></div>
        </article>)}
        {!tasks.length ? <div className="calendar-empty">No tasks in this source need more clock time.</div> : null}
      </div>
    </section>
  </aside>
}

function MiniCalendar({ selectedDate, today, onSelect }: { selectedDate: LocalDate; today: LocalDate; onSelect: (date: LocalDate) => void }) {
  const dates = localMonthGrid(selectedDate)
  const month = startOfLocalMonth(selectedDate)
  const [year, monthNumber] = month.split('-').map(Number)
  const monthLabel = formatLocalDate(month, { month: 'long', year: 'numeric' })
  return <section className="mini-calendar">
    <header><button onClick={() => onSelect(addLocalMonths(selectedDate, -1))}>←</button><strong>{monthLabel}</strong><button onClick={() => onSelect(addLocalMonths(selectedDate, 1))}>→</button></header>
    <div className="mini-calendar__weekdays">{['M','T','W','T','F','S','S'].map((label, index) => <span key={String(index) + label}>{label}</span>)}</div>
    <div className="mini-calendar__grid">
      {dates.map((date) => {
        const d = localDateToDate(date)
        const outside = d.getFullYear() !== year || d.getMonth() + 1 !== monthNumber
        return <button
          key={date}
          className={(outside ? 'is-outside ' : '') + (date === selectedDate ? 'is-selected ' : '') + (date === today ? 'is-today' : '')}
          onClick={() => onSelect(date)}
        >{String(d.getDate())}</button>
      })}
    </div>
  </section>
}

function CalendarTimeGridV2({ dates, today, selectedDate, blocks, taskMap, conflicts, timeZone, onSelectDate, onOpenBlock, onCreateEvent, onCreateAllDay, onCreateTaskBlock, onMoveBlock, onDuplicateBlock, onResizeBlock, dragEnabled }: {
  dates: LocalDate[]
  today: LocalDate
  selectedDate: LocalDate
  blocks: TimeBlockEntity[]
  taskMap: Map<string, TaskPreview>
  conflicts: Set<string>
  timeZone: string
  onSelectDate: (date: LocalDate) => void
  onOpenBlock: (block: TimeBlockEntity) => void
  onCreateEvent: (date: LocalDate, startMinute: number) => void
  onCreateAllDay: (date: LocalDate) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number) => void
  onMoveBlock: (block: TimeBlockEntity, date: LocalDate, startMinute?: number) => void | Promise<void>
  onDuplicateBlock: (id: string, date: LocalDate, startMinute?: number) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  dragEnabled: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hours = Array.from({ length: 25 }, (_, index) => index * 60)

  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollTop < 100) el.scrollTop = 7 * 60 * CALENDAR_PX_PER_MINUTE
  }, [dates.join('|')])

  function dropTimed(event: DragEvent<HTMLDivElement>, date: LocalDate) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const minute = clampMinute(roundMinute((event.clientY - rect.top) / CALENDAR_PX_PER_MINUTE))
    const taskId = event.dataTransfer.getData('calendar/task-id')
    if (taskId) return onCreateTaskBlock(taskId, date, minute)
    const blockId = event.dataTransfer.getData('calendar/block-id')
    const block = blocks.find((item) => item.id === blockId)
    if (!block) return
    if (event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1') void onDuplicateBlock(block.id, date, minute)
    else void onMoveBlock(block, date, minute)
  }

  function dropAllDay(event: DragEvent<HTMLDivElement>, date: LocalDate) {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('calendar/task-id')
    if (taskId) return onCreateTaskBlock(taskId, date, 9 * 60)
    const blockId = event.dataTransfer.getData('calendar/block-id')
    const block = blocks.find((item) => item.id === blockId)
    if (!block) return
    if (event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1') void onDuplicateBlock(block.id, date)
    else void onMoveBlock(block, date)
  }

  return <div className={'calendar-timegrid-v2 ' + (dates.length > 1 ? 'is-multi-day' : 'is-day')} style={{ '--calendar-days': dates.length } as CSSProperties}>
    <div className="calendar-timegrid-v2__headers">
      <div className="calendar-timegrid-v2__gutter" />
      {dates.map((date) => <button key={date} className={(date === today ? 'is-today ' : '') + (date === selectedDate ? 'is-selected' : '')} onClick={() => onSelectDate(date)}>
        <span>{weekdayShort(date)}</span><strong>{formatLocalDate(date, { day: 'numeric', month: dates.length <= 3 ? 'short' : undefined })}</strong>
      </button>)}
    </div>

    <div className="calendar-all-day-row">
      <div className="calendar-all-day-row__label"><span>All-day</span></div>
      {dates.map((date) => <div
        key={date}
        className="calendar-all-day-cell"
        onDoubleClick={() => onCreateAllDay(date)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => dropAllDay(event, date)}
      >
        {allDayBlocksForDate(blocks, date, timeZone).map((block) => <button
          key={block.id}
          className={'calendar-all-day-chip calendar-all-day-chip--' + block.kind}
          draggable={dragEnabled}
          onDragStart={(event) => {
            event.dataTransfer.setData('calendar/block-id', block.id)
            if (event.altKey) event.dataTransfer.setData('calendar/duplicate', '1')
            event.dataTransfer.effectAllowed = 'copyMove'
          }}
          onClick={() => onOpenBlock(block)}
          title={(block.sourceCalendar ? block.sourceCalendar + ' · ' : '') + block.title}
        >{block.title}</button>)}
        {!allDayBlocksForDate(blocks, date, timeZone).length ? <button className="calendar-all-day-add" onClick={() => onCreateAllDay(date)}>+</button> : null}
      </div>)}
    </div>

    <div className="calendar-timegrid-v2__scroll" ref={scrollRef}>
      <div className="calendar-timegrid-v2__labels">
        {hours.map((minute) => <span key={minute} style={{ top: minute * CALENDAR_PX_PER_MINUTE }}>{formatClockMinute(minute)}</span>)}
      </div>
      <div className="calendar-timegrid-v2__days">
        {dates.map((date) => {
          const layouts = layoutTimedBlocks(blocks, date, timeZone)
          return <div
            className={'calendar-day-column-v2 ' + (date === today ? 'is-today' : '')}
            key={date}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropTimed(event, date)}
            onDoubleClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onCreateEvent(date, clampMinute(roundMinute((event.clientY - rect.top) / CALENDAR_PX_PER_MINUTE)))
            }}
          >
            {hours.map((minute) => <i className="calendar-hour-rule" key={minute} style={{ top: minute * CALENDAR_PX_PER_MINUTE }} />)}
            {date === dateKeyInTimeZone(new Date(), timeZone) ? <CurrentTimeLine timeZone={timeZone} /> : null}
            {layouts.map((layout) => <TimedCalendarBlock
              key={layout.block.id + ':' + date}
              block={layout.block}
              date={date}
              task={layout.block.taskId ? taskMap.get(layout.block.taskId) : undefined}
              conflict={conflicts.has(layout.block.id)}
              timeZone={timeZone}
              column={layout.column}
              columns={layout.columns}
              onOpen={() => onOpenBlock(layout.block)}
              onResize={(minutes) => void onResizeBlock(layout.block.id, minutes)}
              dragEnabled={dragEnabled}
            />)}
          </div>
        })}
      </div>
    </div>
  </div>
}

function TimedCalendarBlock({ block, date, task, conflict, timeZone, column, columns, onOpen, onResize, dragEnabled }: {
  block: TimeBlockEntity
  date: LocalDate
  task?: TaskPreview
  conflict: boolean
  timeZone: string
  column: number
  columns: number
  onOpen: () => void
  onResize: (durationMinutes: number) => void
  dragEnabled: boolean
}) {
  const wholeDuration = durationMinutes(block.start, block.end)
  const [previewDuration, setPreviewDuration] = useState(wholeDuration)
  useEffect(() => setPreviewDuration(wholeDuration), [wholeDuration])
  const segmentStart = blockStartMinuteForDate(block, date, timeZone)
  const segmentEnd = blockEndMinuteForDate(block, date, timeZone)
  const isStartDay = dateKeyInTimeZone(block.start, timeZone) === date
  const visibleEnd = isStartDay ? Math.min(CALENDAR_END_MINUTE, segmentStart + previewDuration) : segmentEnd
  const top = segmentStart * CALENDAR_PX_PER_MINUTE
  const height = Math.max(22, (visibleEnd - segmentStart) * CALENDAR_PX_PER_MINUTE)
  const width = 100 / columns
  const style: CSSProperties = {
    top,
    height,
    left: 'calc(' + String(column * width) + '% + 2px)',
    width: 'calc(' + String(width) + '% - 4px)',
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!isStartDay) return
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
      if (nextDuration !== wholeDuration) onResize(nextDuration)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return <article
    className={'calendar-block-v2 calendar-block-v2--' + block.kind + (conflict ? ' is-conflict' : '')}
    style={style}
    draggable={dragEnabled && isStartDay}
    onDragStart={(event) => {
      event.dataTransfer.setData('calendar/block-id', block.id)
      if (event.altKey) event.dataTransfer.setData('calendar/duplicate', '1')
      event.dataTransfer.effectAllowed = 'copyMove'
    }}
  >
    <button className="calendar-block-v2__main" onClick={onOpen}>
      <strong>{task?.title ?? block.title}</strong>
      <span>{formatTimeInZone(block.start, timeZone)}–{formatTimeInZone(block.end, timeZone)}</span>
      <em>{task?.project ?? block.sourceCalendar ?? block.location ?? (block.kind === 'event' ? 'Event' : 'Work block')}</em>
    </button>
    {conflict ? <span className="calendar-block-v2__conflict">!</span> : null}
    {isStartDay ? <button className="calendar-block-v2__resize" aria-label="Resize calendar block" onPointerDown={beginResize} /> : null}
  </article>
}

function CurrentTimeLine({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const minute = minuteOfDayInTimeZone(now, timeZone)
  return <span className="calendar-now-line-v2" style={{ top: minute * CALENDAR_PX_PER_MINUTE }}><i /><b>{formatTimeInZone(now, timeZone)}</b></span>
}

function CalendarDateMatrix({ dates, anchorMonth, today, selectedDate, blocks, taskMap, timeZone, onSelectDate, onOpenDay, onOpenBlock, onCreateEvent, onCreateTaskBlock, onMoveBlock, onDuplicateBlock }: {
  dates: LocalDate[]
  anchorMonth: LocalDate
  today: LocalDate
  selectedDate: LocalDate
  blocks: TimeBlockEntity[]
  taskMap: Map<string, TaskPreview>
  timeZone: string
  onSelectDate: (date: LocalDate) => void
  onOpenDay: (date: LocalDate) => void
  onOpenBlock: (block: TimeBlockEntity) => void
  onCreateEvent: (date: LocalDate) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate) => void
  onMoveBlock: (block: TimeBlockEntity, date: LocalDate) => void | Promise<void>
  onDuplicateBlock: (id: string, date: LocalDate) => void | Promise<void>
}) {
  const anchorMonthId = anchorMonth.slice(0, 7)
  return <div className="calendar-date-matrix">
    <div className="calendar-date-matrix__weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-date-matrix__grid">
      {dates.map((date) => {
        const items = blocks.filter((block) => blockTouchesDate(block, date, timeZone))
        const outside = date.slice(0, 7) !== anchorMonthId
        return <section
          key={date}
          className={'calendar-date-cell ' + (outside ? 'is-outside ' : '') + (date === today ? 'is-today ' : '') + (date === selectedDate ? 'is-selected' : '')}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const taskId = event.dataTransfer.getData('calendar/task-id')
            if (taskId) return onCreateTaskBlock(taskId, date)
            const blockId = event.dataTransfer.getData('calendar/block-id')
            const block = blocks.find((item) => item.id === blockId)
            if (!block) return
            if (event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1') void onDuplicateBlock(block.id, date)
            else void onMoveBlock(block, date)
          }}
        >
          <header><button onClick={() => onSelectDate(date)} onDoubleClick={() => onOpenDay(date)}>{formatLocalDate(date, { day: 'numeric' })}</button><button onClick={() => onCreateEvent(date)}>+</button></header>
          <div className="calendar-date-cell__items">
            {items.slice(0, 4).map((block) => <button
              key={block.id}
              className={block.allDay ? 'is-all-day' : ''}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('calendar/block-id', block.id)
                if (event.altKey) event.dataTransfer.setData('calendar/duplicate', '1')
                event.dataTransfer.effectAllowed = 'copyMove'
              }}
              onClick={() => onOpenBlock(block)}
            ><span>{block.allDay ? 'All day' : formatTimeInZone(block.start, timeZone)}</span>{taskMap.get(block.taskId ?? '')?.title ?? block.title}</button>)}
            {items.length > 4 ? <span>+{String(items.length - 4)} more</span> : null}
          </div>
        </section>
      })}
    </div>
  </div>
}

function CalendarYearView({ year, today, blocks, timeZone, onSelectDate }: {
  year: number
  today: LocalDate
  blocks: TimeBlockEntity[]
  timeZone: string
  onSelectDate: (date: LocalDate) => void
}) {
  return <div className="calendar-year-grid">
    {Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0')
      const first = String(year) + '-' + month + '-01'
      const dates = localMonthGrid(first)
      return <section className="calendar-year-month" key={month}>
        <header>{formatLocalDate(first, { month: 'long' })}</header>
        <div className="calendar-year-weekdays">{['M','T','W','T','F','S','S'].map((d, i) => <span key={String(i) + d}>{d}</span>)}</div>
        <div className="calendar-year-days">
          {dates.map((date) => {
            const outside = date.slice(0, 7) !== first.slice(0, 7)
            const count = outside ? 0 : blocks.filter((block) => blockTouchesDate(block, date, timeZone)).length
            return <button key={date} disabled={outside} className={(date === today ? 'is-today ' : '') + (count ? 'has-items' : '')} onClick={() => onSelectDate(date)}>
              <span>{formatLocalDate(date, { day: 'numeric' })}</span>{count ? <i>{count > 9 ? '9+' : count}</i> : null}
            </button>
          })}
        </div>
      </section>
    })}
  </div>
}

function AgendaCalendar({ from, through, blocks, taskMap, timeZone, onSelectDate, onOpenBlock }: {
  from: LocalDate
  through: LocalDate
  blocks: TimeBlockEntity[]
  taskMap: Map<string, TaskPreview>
  timeZone: string
  onSelectDate: (date: LocalDate) => void
  onOpenBlock: (block: TimeBlockEntity) => void
}) {
  const days = localDateRange(from, Math.max(1, Math.round((localDateToDate(through).getTime() - localDateToDate(from).getTime()) / 86_400_000) + 1))
  const groups = days.map((date) => ({ date, blocks: blocks.filter((block) => blockTouchesDate(block, date, timeZone)) })).filter((group) => group.blocks.length)
  return <div className="calendar-agenda-v2">
    {groups.map((group) => <section key={group.date}>
      <header><button onClick={() => onSelectDate(group.date)}><strong>{formatLocalDate(group.date, { weekday: 'long', month: 'long', day: 'numeric' })}</strong></button><span>{group.blocks.length} item{group.blocks.length === 1 ? '' : 's'}</span></header>
      <div>{group.blocks.map((block) => <button key={block.id} onClick={() => onOpenBlock(block)}>
        <span>{block.allDay ? 'All day' : formatTimeInZone(block.start, timeZone) + '–' + formatTimeInZone(block.end, timeZone)}</span>
        <strong>{taskMap.get(block.taskId ?? '')?.title ?? block.title}</strong>
        <em>{block.sourceCalendar ?? taskMap.get(block.taskId ?? '')?.project ?? block.location ?? ''}</em>
      </button>)}</div>
    </section>)}
    {!groups.length ? <div className="empty-state">No calendar items in this range.</div> : null}
  </div>
}

function taskRemaining(task: TaskPreview, blocks: TimeBlockEntity[]) {
  if (!task.durationMinutes) return blocks.some((block) => block.taskId === task.id) ? 0 : 30
  return remainingTaskMinutes(task.durationMinutes, blocks, task.id)
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? String(hours) + 'h' + (rest ? ' ' + String(rest) + 'm' : '') : String(rest) + 'm'
}

function rangeLabel(mode: CalendarV2Mode, selectedDate: LocalDate, from: LocalDate, through: LocalDate) {
  if (mode === 'day') return formatLocalDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  if (mode === 'year') return selectedDate.slice(0, 4)
  if (mode === 'month') return formatLocalDate(selectedDate, { month: 'long', year: 'numeric' })
  return formatLocalDate(from, { month: 'short', day: 'numeric' }) + ' – ' + formatLocalDate(through, { month: 'short', day: 'numeric', year: 'numeric' })
}
