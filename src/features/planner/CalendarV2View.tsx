import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import {
  addLocalDays, addLocalMonths, dateKeyInTimeZone, formatLocalDate, formatTimeInZone,
  localDateRange, localDateToDate, localMonthGrid, minuteOfDayInTimeZone, startOfLocalMonth, startOfLocalWeek, weekdayShort,
} from '../../domain/date'
import type { LocalDate, TimeBlockEntity } from '../../domain/models'
import { useCalendarData } from '../../hooks/useCalendarData'
import { useHabitData } from '../../hooks/useHabitData'
import { useLiveQuery } from 'dexie-react-hooks'
import { timeBlockRepository } from '../../repositories/timeBlockRepository'
import type { HabitPreview, TaskPreview } from '../../types/ui'
import {
  allDayBlocksForDate, blockConflicts, blockEndMinuteForDate, blockStartMinuteForDate,
  blockTouchesDate, CALENDAR_END_MINUTE, CALENDAR_PX_PER_MINUTE, CALENDAR_START_MINUTE,
  calendarRangeForMode, clampMinute, durationMinutes, formatClockMinute, layoutTimedBlocks,
  openMinutesInWindow, remainingTaskMinutes, roundMinute,
} from './calendarLogic'
import { TimeBlockModal, type TimeBlockEditorPayload, type TimeBlockEditorState } from './TimeBlockModal'
import { CalendarSourcesC2 } from './CalendarSourcesC2'
import { suggestFreeCalendarSlots, type CalendarSlotC2 } from './calendarSlotSuggestionsC2'
import { calendarSourceGroups, visibleCalendarBlocks } from './calendarSourceGroupsC2'
import { planMultiDayTaskC3,type AllocationOptionsC3 } from './calendarMultiSessionC3'
import { calendarBatchAllocationC3 } from '../../services/calendarBatchAllocationC3'
import type { UndoableMutation } from '../../services/undo'

function isRemoteCalendarBlock(block: TimeBlockEntity) { return block.source === 'klips' || block.source === 'google' }

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
  onHabitToggle, onHabitIncrement, onHabitSkip, onViewHabits,
  onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock, onDuplicateBlock,
}: {
  today: LocalDate
  anchorDate?: LocalDate
  onSelectedDateChange?: (date: LocalDate) => void
  onOpenTask?: (id: string) => void
  onHabitToggle?: (id: string, date: LocalDate) => void | Promise<void>
  onHabitIncrement?: (id: string, amount: number, date: LocalDate) => void | Promise<void>
  onHabitSkip?: (id: string, date: LocalDate) => void | Promise<void>
  onViewHabits?: () => void
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
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(()=>new Set())
  const [editor, setEditor] = useState<TimeBlockEditorState | null>(null)
  const [slotTask, setSlotTask] = useState<TaskPreview | null>(null)
  const [slotMinutes, setSlotMinutes] = useState(60)
  const [slotStart, setSlotStart] = useState(9)
  const [slotEnd, setSlotEnd] = useState(19)
  const [spreadTask,setSpreadTask] = useState<TaskPreview|null>(null)
  const [spreadDays,setSpreadDays] = useState<7|14>(7)
  const [spreadMax,setSpreadMax] = useState<30|45|60|90|120>(60)
  const [spreadPerDay,setSpreadPerDay] = useState<1|2>(1)
  const [spreadBusy,setSpreadBusy] = useState(false)
  const [spreadError,setSpreadError] = useState('')
  const [allocationReceipt,setAllocationReceipt] = useState<{message:string;undo:UndoableMutation}|null>(null)
  const [undoingAllocation,setUndoingAllocation] = useState(false)

  const range = useMemo(() => calendarRangeForMode(mode, selectedDate), [mode, selectedDate])
  const data = useCalendarData(range.from, range.through, timeZone)
  const habitData = useHabitData(selectedDate)
  const weekBlocks = useLiveQuery(()=>timeBlockRepository.listBetween(selectedDate,addLocalDays(selectedDate,13),timeZone),[selectedDate,timeZone])

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
  const sourceGroups=useMemo(()=>calendarSourceGroups(data?.blocks??[]),[data?.blocks])
  const visibleBlocks=useMemo(()=>visibleCalendarBlocks(data?.blocks??[],hiddenSources),[data?.blocks,hiddenSources])
  const selectedVisibleBlocks=useMemo(()=>visibleBlocks.filter(block=>blockTouchesDate(block,selectedDate,timeZone)),
    [visibleBlocks,selectedDate,timeZone])
  const deadlineTasks=useMemo(()=>{
    if(!data)return []
    return data.tasks.filter(task=>task.status==='todo'&&!task.completed&&
      Boolean(task.deadline&&task.deadline<=selectedDate)).sort((a,b)=>
       (a.deadline??'').localeCompare(b.deadline??'')||
       ({critical:0,high:1,normal:2}[a.priority]-{critical:0,high:1,normal:2}[b.priority]))
  },[data,selectedDate])
  const habitDue=(habitData?.todayHabits??[]).filter(h=>h.scheduledToday&&!h.completed&&!h.skipped&&!h.paused).length
  const nextSevenDays=useMemo(()=>{
    if(!data||!weekBlocks)return []
    return localDateRange(selectedDate,7).map(date=>{
      const due=data.tasks.filter(t=>!t.completed&&(t.status==='todo'||t.status==='inbox')&&t.deadline===date).length
      const planned=data.tasks.filter(t=>!t.completed&&t.status==='todo'&&t.plannedDate===date).length
      const free=openMinutesInWindow(weekBlocks,date,6*60,22*60,timeZone)
      return {date,free,due,planned}
    })
  },[data,weekBlocks,selectedDate,timeZone])

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
        if (taskSource === 'due') return Boolean(task.deadline && task.deadline <= selectedDate)
        if (taskSource === 'unplanned') return !task.plannedDate
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

  const suggestedSlots = useMemo(()=>{
    if(!slotTask||!data||!weekBlocks)return [] as CalendarSlotC2[]
    const remaining=taskRemaining(slotTask,data.allTaskBlocks)
    const minutes=Math.min(slotMinutes,remaining,240)
    return suggestFreeCalendarSlots(weekBlocks,{from:selectedDate,
      deadline:slotTask.deadline,timeZone,minutes,dailyStart:slotStart*60,
      dailyEnd:slotEnd*60,through:addLocalDays(selectedDate,6),limit:5,
      afterIso:selectedDate===today?new Date().toISOString():undefined})
  },[data,weekBlocks,selectedDate,slotTask,slotMinutes,slotStart,slotEnd,timeZone,today])

  const spreadOptions=useMemo<AllocationOptionsC3>(()=>({
    from:selectedDate,days:spreadDays,sessionMinutes:spreadMax,sessionsPerDay:spreadPerDay,
    dailyStart:slotStart*60,dailyEnd:slotEnd*60,timeZone,
    afterIso:selectedDate===today?new Date().toISOString():undefined,
  }),[selectedDate,spreadDays,spreadMax,spreadPerDay,slotStart,slotEnd,timeZone,today])
  const spreadPlan=useMemo(()=>{
    if(!spreadTask||!data||!weekBlocks)return null
    const task=data.taskEntities.find(t=>t.id===spreadTask.id)
    return task?planMultiDayTaskC3(task,weekBlocks,spreadOptions):null
  },[spreadTask,data,weekBlocks,spreadOptions])

  async function applySpread(){
    if(!spreadPlan||spreadBusy)return
    setSpreadBusy(true);setSpreadError('')
    try{
      const applied=await calendarBatchAllocationC3.apply(spreadPlan,spreadOptions)
      setAllocationReceipt({message:applied.blocks.length+' work sessions created across '+
        new Set(applied.blocks.map(b=>dateKeyInTimeZone(b.start,timeZone))).size+' days.',undo:applied.undo})
      setSpreadTask(null)
    }catch(error){setSpreadError(error instanceof Error?error.message:'The calendar changed. Review and try again.')}
    finally{setSpreadBusy(false)}
  }

  function scheduleTask(task: TaskPreview, date = selectedDate, startMinute = 9 * 60, durationOverride?:number) {
    setEditor({ type: 'new-task', task, date, startMinute, durationMinutes: Math.min(durationOverride??Number.POSITIVE_INFINITY,taskRemaining(task, data?.allTaskBlocks ?? [])), timeZone })
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
    const block = data?.blocks.find((item) => item.id === id)
    const zone = block?.allDay ? (block.timeZone ?? 'local') : timeZone
    await onDuplicateBlock(id, undefined, undefined, zone)
    setEditor(null)
  }

  function editBlock(block: TimeBlockEntity) {
    setEditor({ type: 'edit', block, task: block.taskId ? data?.taskMap.get(block.taskId) : undefined, timeZone: block.allDay ? (block.timeZone ?? 'local') : timeZone })
  }

  async function moveBlock(block: TimeBlockEntity, date: LocalDate, startMinute?: number) {
    if (block.allDay && block.kind === 'event') {
      const allDayZone = block.timeZone ?? 'local'
      const startDate = dateKeyInTimeZone(block.start, allDayZone)
      const endDateExclusive = dateKeyInTimeZone(block.end, allDayZone)
      const days = Math.max(1, Math.round((localDateToDate(endDateExclusive).getTime() - localDateToDate(startDate).getTime()) / 86_400_000))
      await onUpdateEvent(block.id, block.title, date, 0, days * 24 * 60, {
        description: block.description,
        location: block.location,
        allDay: true,
        endDateExclusive: addLocalDays(date, days),
        timeZone: allDayZone,
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

      <section className="calendar-c2-sources-filter" aria-label="Displayed calendar sources">
        <div className="calendar-c2-sources-filter__heading">
          <strong>Calendars</strong>
          <span>{sourceGroups.filter(group=>!hiddenSources.has(group.key)).length}/{sourceGroups.length} sources visible · visibility only, not availability</span>
          {hiddenSources.size>0?<button type="button" onClick={()=>setHiddenSources(new Set())}>Show all</button>:null}
        </div>
        <div className="calendar-c2-sources-filter__list">
          {sourceGroups.map(group=><label key={group.key} title={group.description} className="calendar-c2-source-choice">
            <input type="checkbox" checked={!hiddenSources.has(group.key)} onChange={event=>setHiddenSources(prev=>{
              const next=new Set(prev)
              if(event.target.checked)next.delete(group.key);else next.add(group.key)
              return next
            })}/>
            <span><b>{group.label}</b><small>{group.description}</small></span>
            <em>{group.count}</em>
          </label>)}
          {!sourceGroups.length?<span className="calendar-empty">No events in the displayed calendar range.</span>:null}
        </div>
      </section>
      {allocationReceipt?<section className="calendar-c3-receipt" role="status">
        <span>{allocationReceipt.message} Task dates and deadlines unchanged.</span>
        <button type="button" disabled={undoingAllocation} onClick={async()=>{
          setUndoingAllocation(true)
          try{await allocationReceipt.undo.undo();setAllocationReceipt(null)}
          catch(error){setAllocationReceipt({message:error instanceof Error?error.message:'Undo unavailable.',undo:allocationReceipt.undo})}
          finally{setUndoingAllocation(false)}
        }}>Undo allocation</button>
      </section>:null}
      <section className="calendar-v2-summary">
        <span><b>{formatDuration(scheduledTaskMinutes)}</b> task time</span>
        <span><b>{formatDuration(unscheduledMinutes)}</b> selected-day work left</span>
        <span><b>{formatDuration(capacityTarget)}</b> capacity</span>
        <span><b>{formatDuration(workingOpenMinutes)}</b> open 06–22</span>
        <span><b>{selectedAllDay.length}</b> all-day</span>
        <span className={conflictCount ? 'is-warning' : ''}><b>{conflictCount}</b> conflict{conflictCount === 1 ? '' : 's'}</span>
      </section>

      <section className="calendar-c2-week-strip" aria-label="Upcoming seven days">
        <div className="calendar-c2-week-strip__header"><strong>Next seven days</strong><small>Free time 06–22 · all calendars count toward availability</small></div>
        <div className="calendar-c2-week-strip__days">
          {nextSevenDays.map(day=><button type="button" key={day.date}
            aria-current={selectedDate===day.date?'date':undefined}
            onClick={()=>{setSelectedDate(day.date);setMode('day')}}>
            <strong>{formatLocalDate(day.date,{weekday:'short',month:'short',day:'numeric'})}</strong>
            <span>{formatDuration(day.free)} free</span>
            <small>{day.planned} planned · {day.due} due</small>
          </button>)}
          {!nextSevenDays.length?<span className="calendar-empty">Loading the seven-day schedule…</span>:null}
        </div>
      </section>
      <section className="calendar-c2-day-brief" aria-label="Selected day overview">
        <div className="calendar-c2-day-brief__heading">
          <div><span className="eyebrow">Selected day</span>
            <strong>{formatLocalDate(selectedDate,{weekday:'long',month:'long',day:'numeric'})}</strong></div>
          <button type="button" onClick={()=>setMode('day')}>Open day</button>
        </div>
        <div className="calendar-c2-day-brief__columns">
          <div className="calendar-c2-day-brief__column">
            <strong>Events and sessions <small>{selectedVisibleBlocks.length}{selectedBlocks.length!==selectedVisibleBlocks.length?' displayed of '+selectedBlocks.length:''}</small></strong>
            {selectedVisibleBlocks.slice().sort((a,b)=>a.start.localeCompare(b.start)).slice(0,4).map(block=>
              <button type="button" key={block.id} onClick={()=>editBlock(block)}>
                <span>{block.allDay?'All day':formatTimeInZone(block.start,timeZone)}</span>
                <b>{data?.taskMap.get(block.taskId??'')?.title??block.title}</b>
                <small>{block.source==='klips'?'KLIPS':block.source==='google'?'Google mirror':block.source==='ics'?'ICS import':block.kind==='task'?'Folio task':'Folio event'}</small>
              </button>)}
            {!selectedVisibleBlocks.length?<p>{selectedBlocks.length?'No events shown from selected sources.':'No scheduled events.'}</p>:null}
          </div>
          <div className="calendar-c2-day-brief__column">
            <strong>Due or overdue <small>{deadlineTasks.length}</small></strong>
            {deadlineTasks.slice(0,4).map(task=><button type="button" key={task.id} onClick={()=>onOpenTask?.(task.id)}>
              <span>{task.deadline===selectedDate?'Due today':'Overdue · '+task.deadline}</span><b>{task.title}</b>
              <small>{task.project??'Folio task'}</small>
            </button>)}
            {!deadlineTasks.length?<p>No tasks due or overdue by this date.</p>:null}
          </div>
          <div className="calendar-c2-day-brief__column calendar-c2-day-brief__habits">
            <strong>Habits <small>{habitDue} due</small></strong>
            {(habitData?.todayHabits??[]).filter(h=>h.scheduledToday).slice(0,4).map(h=>
              <button key={h.id} type="button" disabled={h.paused||(h.kind==='check'?!onHabitToggle:!onViewHabits)}
                onClick={()=>h.kind==='check'?onHabitToggle?.(h.id,selectedDate):onViewHabits?.()}>
                <span>{h.completed?'Completed':h.skipped?'Rest day':h.paused?'Paused':'Not completed'}</span>
                <b>{h.title}</b><small>{h.kind==='check'?'Toggle completion':'See progress in Habits'}</small>
              </button>)}
            {!habitData?.todayHabits?.some(h=>h.scheduledToday)?<p>No scheduled habits for this date.</p>:null}
          </div>
        </div>
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
          onFindTime={(task)=>{setSlotTask(task);setSlotMinutes(Math.min(60,taskRemaining(task,data.allTaskBlocks)))}}
          onSpreadWork={(task)=>{setSpreadTask(task);setSpreadError('');setSpreadMax(60)}}
          compact={compact}
          habits={habitData?.todayHabits ?? []}
          habitLoaded={Boolean(habitData)}
          onHabitToggle={onHabitToggle}
          onHabitIncrement={onHabitIncrement}
          onHabitSkip={onHabitSkip}
          onViewHabits={onViewHabits}
        />

        <main className="calendar-v2-main">
          {mode === 'agenda' ? <AgendaCalendar
            from={range.from}
            through={range.through}
            blocks={visibleBlocks}
            taskMap={data.taskMap}
            timeZone={timeZone}
            onSelectDate={setSelectedDate}
            onOpenBlock={editBlock}
          /> : null}

          {mode === 'day' || mode === '3day' || mode === 'week' ? <CalendarTimeGridV2
            dates={timeGridDates}
            today={today}
            selectedDate={selectedDate}
            blocks={visibleBlocks}
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
            onDuplicateBlock={(id, date, minute) => { const block = data.blocks.find((item) => item.id === id); return onDuplicateBlock(id, date, minute, block?.allDay ? (block.timeZone ?? 'local') : timeZone) }}
            onResizeBlock={onResizeBlock}
            dragEnabled={!compact}
          /> : null}

          {mode === 'multiweek' || mode === 'month' ? <CalendarDateMatrix
            dates={matrixDates}
            anchorMonth={startOfLocalMonth(selectedDate)}
            today={today}
            selectedDate={selectedDate}
            blocks={visibleBlocks}
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
            onDuplicateBlock={(id, date) => { const block = data.blocks.find((item) => item.id === id); return onDuplicateBlock(id, date, undefined, block?.allDay ? (block.timeZone ?? 'local') : timeZone) }}
          /> : null}

          {mode === 'year' ? <CalendarYearView
            year={Number(selectedDate.slice(0, 4))}
            today={today}
            blocks={visibleBlocks}
            timeZone={timeZone}
            onSelectDate={(date) => { setSelectedDate(date); setMode('day') }}
          /> : null}
        </main>
      </div>

      {spreadTask?<section className="calendar-slot-overlay" role="dialog" aria-modal="true" aria-label="Spread task over multiple days">
        <div className="calendar-slot-modal calendar-c3-spread">
          <header><strong>Spread work across days</strong><button type="button" onClick={()=>setSpreadTask(null)} disabled={spreadBusy} aria-label="Close multi-day planner">Close</button></header>
          <p><b>{spreadTask.title}</b> · Review every proposed Folio session before committing.
            {spreadTask.deadline?' Deadline '+spreadTask.deadline+'.':''} Existing task dates are not changed.</p>
          <div className="calendar-slot-options">
            <label>Horizon <select aria-label="Allocation horizon" value={spreadDays} onChange={e=>setSpreadDays(Number(e.target.value) as 7|14)}>
              <option value={7}>7 days</option><option value={14}>14 days</option></select></label>
            <label>Maximum session <select aria-label="Allocation session minutes" value={spreadMax} onChange={e=>setSpreadMax(Number(e.target.value) as 30|45|60|90|120)}>
              {[30,45,60,90,120].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
            <label>Per day <select aria-label="Allocation sessions per day" value={spreadPerDay} onChange={e=>setSpreadPerDay(Number(e.target.value) as 1|2)}>
              <option value={1}>One session</option><option value={2}>Up to two</option></select></label>
            <label>Start hour <select aria-label="Allocation start hour" value={slotStart} onChange={e=>setSlotStart(Number(e.target.value))}>
              {Array.from({length:18},(_,i)=>i+5).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}:00</option>)}</select></label>
            <label>End hour <select aria-label="Allocation end hour" value={slotEnd} onChange={e=>setSlotEnd(Number(e.target.value))}>
              {Array.from({length:16},(_,i)=>i+9).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}:00</option>)}</select></label>
          </div>
          <p>Uses all visible and hidden Folio/ICS/KLIPS/Google occupancy. A preview does not reserve any time; all sessions will be created together or none.</p>
          <div className="calendar-c3-spread__summary">
            <strong>{spreadPlan?.slots.length??0} sessions</strong>
            <span>{formatDuration(spreadPlan?.allocatedMinutes??0)} covered</span>
            <span>{formatDuration(spreadPlan?.uncoveredMinutes??0)} remaining unscheduled</span>
          </div>
          <div className="calendar-slot-results" aria-label="Proposed multi-day sessions">
            {spreadPlan?.slots.map(slot=><div className="calendar-c3-spread__item" key={slot.start}>
              <strong>{formatLocalDate(slot.date,{weekday:'short',month:'short',day:'numeric'})}</strong>
              <span>{formatClockMinute(slot.startMinute)}–{formatClockMinute(slot.startMinute+slot.durationMinutes)}</span>
              <small>{formatDuration(slot.durationMinutes)}</small>
            </div>)}
            {!spreadPlan?.slots.length?<p>No fitting sessions before the deadline. Adjust the horizon, session duration or hours.</p>:null}
          </div>
          {spreadError?<p role="alert">{spreadError}</p>:null}
          <button type="button" disabled={spreadBusy||!spreadPlan?.slots.length} onClick={()=>void applySpread()}>
            {spreadBusy?'Checking calendar…':'Confirm all sessions'}
          </button>
        </div>
      </section>:null}
      {slotTask?<section className="calendar-slot-overlay" role="dialog" aria-modal="true" aria-label="Find time for task">
        <div className="calendar-slot-modal">
          <header><strong>Find free time</strong><button type="button" onClick={()=>setSlotTask(null)} aria-label="Close free time suggestions">Close</button></header>
          <p><b>{slotTask.title}</b> · {formatDuration(taskRemaining(slotTask,data.allTaskBlocks))} work left
            {slotTask.deadline?' · Deadline '+slotTask.deadline:''}</p>
          <div className="calendar-slot-options">
            <label>Session length <select aria-label="Suggested session length" value={slotMinutes} onChange={e=>setSlotMinutes(Number(e.target.value))}>
              {[30,60,90,120,180,240].map(v=><option key={v} value={v}>{v} minutes maximum</option>)}
            </select></label>
            <label>From hour <select aria-label="Daily start hour" value={slotStart} onChange={e=>setSlotStart(Number(e.target.value))}>
              {Array.from({length:18},(_,i)=>i+5).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}:00</option>)}
            </select></label>
            <label>Until hour <select aria-label="Daily end hour" value={slotEnd} onChange={e=>setSlotEnd(Number(e.target.value))}>
              {Array.from({length:16},(_,i)=>i+9).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}:00</option>)}
            </select></label>
          </div>
          <p>Available slots from the selected date through the next seven days, bounded by the task deadline. Existing Folio and imported events count as busy; all-day events block their dates. Nothing is scheduled without confirmation.</p>
          <div className="calendar-slot-results">
            {suggestedSlots.map(slot=><button type="button" key={slot.start} onClick={()=>{
              setSlotTask(null);setSelectedDate(slot.date);scheduleTask(slotTask,slot.date,slot.startMinute,slot.durationMinutes)
            }}>
              <strong>{formatLocalDate(slot.date,{weekday:'short',month:'short',day:'numeric'})}</strong>
              <span>{formatClockMinute(slot.startMinute)}–{formatClockMinute(slot.startMinute+slot.durationMinutes)} · {slot.durationMinutes} min</span>
              <small>Review time block</small>
            </button>)}
            {!suggestedSlots.length?<p>No free slot found within these hours and deadline. Adjust hours or choose another date.</p>:null}
          </div>
        </div>
      </section>:null}
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

function CalendarSidebar({ today, selectedDate, onSelectDate, tasks, allBlocks, taskSource, onTaskSource, smartViews, search, onSearch, onOpenTask, onSchedule, onFindTime, onSpreadWork, compact, habits, habitLoaded, onHabitToggle, onHabitIncrement, onHabitSkip, onViewHabits }: {
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
  onFindTime: (task: TaskPreview) => void
  onSpreadWork: (task: TaskPreview) => void
  compact: boolean
  habits: HabitPreview[]
  habitLoaded: boolean
  onHabitToggle?: (id: string, date: LocalDate) => void | Promise<void>
  onHabitIncrement?: (id: string, amount: number, date: LocalDate) => void | Promise<void>
  onHabitSkip?: (id: string, date: LocalDate) => void | Promise<void>
  onViewHabits?: () => void
}) {
  return <aside className="calendar-v2-sidebar">
    <MiniCalendar selectedDate={selectedDate} today={today} onSelect={onSelectDate} />
    <section className="calendar-task-source">
      <header><span className="eyebrow">Schedule tasks</span><strong>{tasks.length}</strong></header>
      <select value={taskSource} onChange={(event) => onTaskSource(event.target.value)}>
        <option value="day">Planned for selected day</option>
        <option value="all">All work needing time</option>
        <option value="due">Due or overdue by selected date</option>
        <option value="unplanned">No planned work date</option>
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
            <span>{[task.project, task.list, task.plannedDate ? 'Plan ' + task.plannedDate : 'No planned date', task.deadline ? 'Due ' + task.deadline : ''].filter(Boolean).join(' · ')}</span>
          </button>
          <div><span>{formatDuration(taskRemaining(task, allBlocks))}</span>
            <button type="button" onClick={() => onFindTime(task)}>Find time</button>
            <button type="button" onClick={() => onSpreadWork(task)}>Spread work</button>
            <button type="button" onClick={() => onSchedule(task)}>Schedule</button></div>
        </article>)}
        {!tasks.length ? <div className="calendar-empty">No tasks in this source need more clock time.</div> : null}
      </div>
    </section>
    <section className="calendar-habit-source" aria-label="Habit progress for selected day">
      <header><span className="eyebrow">Habits · {selectedDate}</span><button type="button" onClick={onViewHabits}>Manage</button></header>
      <p>Folio activity entries determine completion; a scheduled habit is not automatically completed.</p>
      {!habitLoaded ? <span className="calendar-empty">Loading habits…</span> : null}
      {habitLoaded && !habits.length ? <span className="calendar-empty">No habits scheduled or in progress on this date.</span> : null}
      <div className="calendar-habit-source__list">
        {habits.map((habit) => <div key={habit.id} className="calendar-habit-row">
          <div className="calendar-habit-row__meta"><strong>{habit.title}</strong><span>{habit.paused ? 'Paused' : habit.skipped ? 'Rest day' : habit.completed ? 'Completed' : habit.progress ?? habit.periodProgress ?? 'Not yet completed'}</span></div>
          <div className="calendar-habit-row__actions">
            <button type="button" disabled={habit.paused || !onHabitToggle} onClick={() => onHabitToggle?.(habit.id, selectedDate)} aria-label={(habit.completed ? 'Clear completion for ' : 'Complete ') + habit.title}>{habit.completed ? 'Undo' : 'Done'}</button>
            {habit.kind !== 'check' ? <button type="button" disabled={habit.paused || !onHabitIncrement} onClick={() => onHabitIncrement?.(habit.id, habit.kind === 'duration' ? 15 : 1, selectedDate)} aria-label={'Add progress to ' + habit.title}>+{habit.kind === 'duration' ? '15m' : '1'}</button> : null}
            <button type="button" disabled={habit.paused || !onHabitSkip} onClick={() => onHabitSkip?.(habit.id, selectedDate)}>{habit.skipped ? 'Rest ✓' : 'Rest'}</button>
          </div>
        </div>)}
      </div>
    </section>
    <CalendarSourcesC2 selectedDate={selectedDate} />
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
    if (isRemoteCalendarBlock(block) && !(event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1')) return
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
    if (isRemoteCalendarBlock(block) && !(event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1')) return
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
          draggable={dragEnabled && !isRemoteCalendarBlock(block)}
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
               dragEnabled={dragEnabled && !isRemoteCalendarBlock(layout.block)}
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

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!isStartDay || isRemoteCalendarBlock(block)) return
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
    draggable={dragEnabled && isStartDay && !isRemoteCalendarBlock(block)}
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
    {isStartDay && !isRemoteCalendarBlock(block) ? <button className="calendar-block-v2__resize" aria-label="Resize calendar block" onPointerDown={beginResize} /> : null}
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
             if (isRemoteCalendarBlock(block) && !(event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1')) return
             if (event.altKey || event.dataTransfer.getData('calendar/duplicate') === '1') void onDuplicateBlock(block.id, date)
            else void onMoveBlock(block, date)
          }}
        >
          <header><button onClick={() => onSelectDate(date)} onDoubleClick={() => onOpenDay(date)}>{formatLocalDate(date, { day: 'numeric' })}</button><button onClick={() => onCreateEvent(date)}>+</button></header>
          <div className="calendar-date-cell__items">
            {items.slice(0, 4).map((block) => <button
              key={block.id}
              className={block.allDay ? 'is-all-day' : ''}
              draggable={!isRemoteCalendarBlock(block)}
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
