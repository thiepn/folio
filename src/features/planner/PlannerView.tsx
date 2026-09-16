import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { addLocalDays, addLocalMonths, startOfLocalMonth, startOfLocalWeek } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import { usePlannerData } from '../../hooks/usePlannerData'
import { CalendarView } from './CalendarView'
import { AdvancedPlanningView } from './AdvancedPlanningView'
import { AgendaPlanner, DayPlanner, MonthPlanner, WeekPlannerV14 } from './PlannerOverhaulViews'
import type { SavedTaskView } from './advancedPlanning'
import type { UndoableMutation } from '../../services/undo'

type PlannerTab = 'agenda' | 'day' | 'week' | 'month' | 'calendar' | 'advanced'

interface PlannerViewProps {
  today: LocalDate
  onToggle?: (id: string) => void
  onOpen?: (id: string) => void
  onMoveDate: (id: string, date?: LocalDate) => void
  onSetCapacity: (date: LocalDate, minutes?: number) => void
  onAddForDate?: (date: LocalDate) => void
  onCreateTaskBlock: (taskId: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onCreateEvent: (title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onUpdateBlock: (id: string, date: LocalDate, startMinute: number, durationMinutes: number) => void | Promise<void>
  onUpdateEvent: (id: string, title: string, date: LocalDate, startMinute: number, durationMinutes: number, details?: { description?: string; location?: string }) => void | Promise<void>
  onResizeBlock: (id: string, durationMinutes: number) => void | Promise<void>
  onDeleteBlock: (id: string) => void | Promise<void>
  onSaveSavedView: (view: Omit<SavedTaskView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<UndoableMutation>
  onDeleteSavedView: (id: string) => Promise<UndoableMutation>
}

export function PlannerView({ today, onToggle, onOpen, onMoveDate, onSetCapacity, onAddForDate, onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock, onSaveSavedView, onDeleteSavedView }: PlannerViewProps) {
  const [tab, setTab] = useState<PlannerTab>('agenda')
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today)
  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek(today))
  const data = usePlannerData(weekStart, today, selectedDate)

  useEffect(() => {
    if (selectedDate < weekStart || selectedDate > addLocalDays(weekStart, 6)) setWeekStart(startOfLocalWeek(selectedDate))
  }, [selectedDate, weekStart])

  function openDay(date: LocalDate) {
    setSelectedDate(date)
    setWeekStart(startOfLocalWeek(date))
    setTab('day')
  }

  function moveMonth(delta: -1 | 1) {
    const next = startOfLocalMonth(addLocalMonths(selectedDate, delta))
    setSelectedDate(next)
    setWeekStart(startOfLocalWeek(next))
  }

  return <>
    <PageHeader
      kicker="Plan work without confusing it with deadlines"
      title="Planner"
      subtitle="Agenda tracks commitments. Day and Week manage capacity. Month shows workload and deadlines. Calendar assigns exact time. Forecast looks farther ahead."
    />
    <Tabs<PlannerTab>
      value={tab}
      tabs={[
        { value: 'agenda', label: 'Agenda' },
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'calendar', label: 'Calendar' },
        { value: 'advanced', label: 'Forecast' },
      ]}
      onChange={setTab}
    />

    {!data ? <div className="planner-loading">Loading planner…</div> : null}

    {data && tab === 'agenda' ? <AgendaPlanner
      today={today}
      tasks={data.upcoming}
      overdue={data.overdue}
      backlog={data.backlog}
      deadlineOnly={data.deadlineOnly}
      onToggle={onToggle}
      onOpen={onOpen}
      onMoveDate={onMoveDate}
    /> : null}

    {data && tab === 'day' ? <DayPlanner
      today={today}
      day={data.selectedDay}
      backlog={data.backlog}
      onPrevious={() => setSelectedDate((date) => addLocalDays(date, -1))}
      onNext={() => setSelectedDate((date) => addLocalDays(date, 1))}
      onToday={() => setSelectedDate(today)}
      onOpenCalendar={() => setTab('calendar')}
      onSetCapacity={onSetCapacity}
      onAddForDate={onAddForDate}
      onToggle={onToggle}
      onOpen={onOpen}
      onMoveDate={onMoveDate}
    /> : null}

    {data && tab === 'week' ? <WeekPlannerV14
      today={today}
      weekStart={weekStart}
      days={data.days}
      backlog={data.backlog}
      dueBacklog={data.weekUnplannedDue}
      onPrevious={() => { const next = addLocalDays(weekStart, -7); setWeekStart(next); setSelectedDate(next) }}
      onNext={() => { const next = addLocalDays(weekStart, 7); setWeekStart(next); setSelectedDate(next) }}
      onCurrent={() => { const next = startOfLocalWeek(today); setWeekStart(next); setSelectedDate(today) }}
      onToggle={onToggle}
      onOpen={onOpen}
      onMoveDate={onMoveDate}
      onSetCapacity={onSetCapacity}
      onAddForDate={onAddForDate}
    /> : null}

    {data && tab === 'month' ? <MonthPlanner
      today={today}
      anchorDate={selectedDate}
      days={data.monthDays}
      backlog={data.backlog}
      onPrevious={() => moveMonth(-1)}
      onNext={() => moveMonth(1)}
      onCurrent={() => { setSelectedDate(today); setWeekStart(startOfLocalWeek(today)) }}
      onOpenDay={openDay}
      onAddForDate={onAddForDate}
      onToggle={onToggle}
      onOpen={onOpen}
      onMoveDate={onMoveDate}
    /> : null}

    {tab === 'calendar' ? <CalendarView
      today={today}
      anchorDate={selectedDate}
      onSelectedDateChange={setSelectedDate}
      onOpenTask={onOpen}
      onCreateTaskBlock={onCreateTaskBlock}
      onCreateEvent={onCreateEvent}
      onUpdateBlock={onUpdateBlock}
      onUpdateEvent={onUpdateEvent}
      onResizeBlock={onResizeBlock}
      onDeleteBlock={onDeleteBlock}
    /> : null}

    {tab === 'advanced' ? <AdvancedPlanningView today={today} onOpenTask={onOpen} onToggleTask={onToggle} onSaveView={onSaveSavedView} onDeleteView={onDeleteSavedView} /> : null}
  </>
}
