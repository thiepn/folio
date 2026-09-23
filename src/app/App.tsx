import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sidebar } from '../components/layout/Sidebar'
import { Topbar } from '../components/layout/Topbar'
import { MobileNav } from '../components/layout/MobileNav'
import { MobileMoreSheet } from '../components/layout/MobileMoreSheet'
import { AppearanceDrawer } from '../components/layout/AppearanceDrawer'
import { DataDrawer } from '../components/layout/DataDrawer'
import { PwaStatusBanner } from '../components/layout/PwaStatusBanner'
import { BackupReminderBanner } from '../components/layout/BackupReminderBanner'
import { RuntimeIssueBanner } from '../components/layout/RuntimeIssueBanner'
import { TodayView } from '../features/today/TodayView'
import { PlanDayModal } from '../features/today/PlanDayModal'
import { InboxView } from '../features/inbox/InboxView'
import { PlannerView } from '../features/planner/PlannerView'
import { ProjectsView } from '../features/projects/ProjectsView'
import { OrganizationView } from '../features/organization/OrganizationView'
import { ProjectDetailView } from '../features/projects/ProjectDetailView'
import { ProjectEditorModal } from '../features/projects/ProjectEditorModal'
import { ArchivedProjectsDrawer } from '../features/projects/ArchivedProjectsDrawer'
import { HabitsView } from '../features/habits/HabitsView'
import { HabitEditorModal } from '../features/habits/HabitEditorModal'
import { HabitDetailDrawer } from '../features/habits/HabitDetailDrawer'
import { ArchivedHabitsDrawer } from '../features/habits/ArchivedHabitsDrawer'
import { ReviewView } from '../features/review/ReviewView'
import { ReviewWorkflowModal } from '../features/review/ReviewWorkflowModal'
import { ReviewRecordModal } from '../features/review/ReviewRecordModal'
import { QuickAddModal } from '../features/capture/QuickAddModal'
import { ImportPlanModal } from '../features/import/ImportPlanModal'
import { PatchPlanModal } from '../features/patch/PatchPlanModal'
import { InteroperabilityModal } from '../features/interop/InteroperabilityModal'
import { RecurrenceEditorModal, type RecurrenceEditorValue } from '../features/recurrence/RecurrenceEditorModal'
import { TaskInspector } from '../features/tasks/TaskInspector'
import { TrashDrawer } from '../features/tasks/TrashDrawer'
import { UndoToast } from '../features/tasks/UndoToast'
import { FocusOverlay } from '../features/focus/FocusOverlay'
import { ReminderCenterDrawer } from '../features/reminders/ReminderCenterDrawer'
import { applyAppearance } from '../lib/theme'
import { useAppData } from '../hooks/useAppData'
import { useFocusData } from '../hooks/useFocusData'
import { useHabitData } from '../hooks/useHabitData'
import { useReviewData } from '../hooks/useReviewData'
import { useHistoryData } from '../hooks/useHistoryData'
import { useReminderData } from '../hooks/useReminderData'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { DEFAULT_APPEARANCE, settingsRepository } from '../repositories/settingsRepository'
import { addLocalDays, localDateKey } from '../domain/date'
import { taskService } from '../services/taskService'
import { dailyPlanningService } from '../services/dailyPlanningService'
import { projectService } from '../services/projectService'
import { timeBlockService } from '../services/timeBlockService'
import { recurrenceService } from '../services/recurrenceService'
import { focusService } from '../services/focusService'
import { habitService } from '../services/habitService'
import { dependencyService } from '../services/dependencyService'
import { savedViewService } from '../services/savedViewService'
import { reviewRecordService } from '../services/reviewRecordService'
import { reminderService } from '../services/reminderService'
import { createCapturedBatch, createCapturedItem } from '../services/captureService'
import { organizationService } from '../services/organizationService'
import type { UndoableMutation } from '../services/undo'
import type { TaskUpdateInput } from '../repositories/taskRepository'
import type { ProjectCreateInput, ProjectUpdateInput } from '../repositories/projectRepository'
import type { RecurringSeriesUpdateInput } from '../repositories/recurrenceRepository'
import type { HabitCreateInput, HabitUpdateInput } from '../repositories/habitRepository'
import type { NavView, TaskPreview } from '../types/ui'
import type { DailyPlanBucket, ReminderOccurrenceEntity, ReviewKind } from '../domain/models'
import { CommandPalette, type PowerCommand } from '../features/power/CommandPalette'
import { buildHabitCommandChildren, buildProjectCommandChildren, buildTaskCommandChildren } from '../features/power/commandBuilders'
import { ShortcutHelpModal } from '../features/power/ShortcutHelpModal'
import { KeyboardSettingsDrawer } from '../features/power/KeyboardSettingsDrawer'
import { BulkActionBar } from '../features/power/BulkActionBar'
import { TaskSelectionProvider, useTaskSelection } from '../features/power/TaskSelectionContext'
import { DEFAULT_SHORTCUTS, isEditableTarget, matchesShortcut, normalizeShortcutMap, type ShortcutMap } from '../features/power/shortcuts'
import { currentTaskId, focusRelativeTask } from '../features/power/taskKeyboard'
import { LEGACY_LAST_VIEW_KEY } from '../legacy/compat'

const LAST_VIEW_KEY = 'folio:last-view:v1'
const NAV_VIEWS: NavView[] = ['today', 'inbox', 'planner', 'projects', 'lists', 'habits', 'review']

function initialView(): NavView {
  try {
    const current = window.localStorage.getItem(LAST_VIEW_KEY) as NavView | null
    if (current && NAV_VIEWS.includes(current)) return current
    const legacy = window.localStorage.getItem(LEGACY_LAST_VIEW_KEY) as NavView | null
    if (legacy && NAV_VIEWS.includes(legacy)) {
      window.localStorage.setItem(LAST_VIEW_KEY, legacy)
      window.localStorage.removeItem(LEGACY_LAST_VIEW_KEY)
      return legacy
    }
    return 'today'
  } catch {
    return 'today'
  }
}

function rememberView(view: NavView) {
  try { window.localStorage.setItem(LAST_VIEW_KEY, view) } catch { /* Navigation still works if storage is unavailable. */ }
}

function AppContent() {
  const [view, setView] = useState<NavView>(initialView)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [patchOpen, setPatchOpen] = useState(false)
  const [interopOpen, setInteropOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addDefaultStatus, setAddDefaultStatus] = useState<'todo' | 'inbox'>('todo')
  const [addDefaultProjectId, setAddDefaultProjectId] = useState('')
  const [addDefaultListId, setAddDefaultListId] = useState('')
  const [addDefaultPlannedDate, setAddDefaultPlannedDate] = useState<string | undefined>(undefined)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [projectEditorOpen, setProjectEditorOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [archivedProjectsOpen, setArchivedProjectsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusPreferredTaskId, setFocusPreferredTaskId] = useState<string | undefined>(undefined)
  const [planDayOpen, setPlanDayOpen] = useState(false)
  const [habitEditorOpen, setHabitEditorOpen] = useState(false)
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [archivedHabitsOpen, setArchivedHabitsOpen] = useState(false)
  const [recurrenceEditorOpen, setRecurrenceEditorOpen] = useState(false)
  const [reviewWorkflowOpen, setReviewWorkflowOpen] = useState(false)
  const [reviewRecordOpen, setReviewRecordOpen] = useState(false)
  const [reviewRecordKind, setReviewRecordKind] = useState<ReviewKind>('daily')
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [undoAction, setUndoAction] = useState<UndoableMutation | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [keyboardSettingsOpen, setKeyboardSettingsOpen] = useState(false)
  const [reminderCenterOpen, setReminderCenterOpen] = useState(false)
  const [goChordPending, setGoChordPending] = useState(false)
  const goChordAt = useRef(0)
  const goChordTimer = useRef<number | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const selection = useTaskSelection()
  const data = useAppData()
  const focusData = useFocusData()
  const habitData = useHabitData()
  const reviewData = useReviewData(undefined, habitData?.weeklyAdherence ?? 100)
  const historyData = useHistoryData()
  const reminderData = useReminderData()
  useMobileViewport()
  const appearance = useLiveQuery(() => settingsRepository.getAppearance(), [], DEFAULT_APPEARANCE) ?? DEFAULT_APPEARANCE
  const storedShortcuts = useLiveQuery(() => settingsRepository.get<unknown>('power.shortcuts', DEFAULT_SHORTCUTS), [], DEFAULT_SHORTCUTS)
  const dailyWrapUpKey = `daily.wrapup.${data?.today ?? localDateKey()}`
  const dailyWrapUp = useLiveQuery(() => settingsRepository.get<string>(dailyWrapUpKey, ''), [dailyWrapUpKey], '') ?? ''
  const shortcuts = useMemo<ShortcutMap>(() => normalizeShortcutMap(storedShortcuts), [storedShortcuts])
  const viewAnnouncement = useMemo(() => ({ today: 'Today', inbox: 'Inbox', planner: 'Planner', projects: 'Projects', lists: 'Lists', habits: 'Habits', review: 'Review' }[view]), [view])

  const selectedTask = useMemo(() => data?.allTasks.find((task) => task.id === selectedTaskId) ?? data?.subtasks.find((task) => task.id === selectedTaskId) ?? null, [data?.allTasks, data?.subtasks, selectedTaskId])
  const selectedSeries = useMemo(() => selectedTask?.seriesId ? data?.recurringSeries.find((series) => series.id === selectedTask.seriesId) ?? null : null, [data?.recurringSeries, selectedTask])
  const selectedSubtasks = useMemo(() => data?.subtasks.filter((task) => task.parentTaskId === selectedTaskId) ?? [], [data?.subtasks, selectedTaskId])
  const selectedProject = useMemo(() => data?.projects.find((project) => project.id === selectedProjectId), [data?.projects, selectedProjectId])
  const editingProject = useMemo(() => data?.projects.find((project) => project.id === editingProjectId) ?? null, [data?.projects, editingProjectId])
  const selectedHabit = useMemo(() => habitData?.habitEntities.find((habit) => habit.id === selectedHabitId) ?? null, [habitData?.habitEntities, selectedHabitId])
  const selectedHabitPreview = useMemo(() => habitData?.todayHabits.find((habit) => habit.id === selectedHabitId) ?? habitData?.habits.find((habit) => habit.id === selectedHabitId) ?? null, [habitData?.todayHabits, habitData?.habits, selectedHabitId])
  const editingHabit = useMemo(() => habitData?.habitEntities.find((habit) => habit.id === editingHabitId) ?? null, [habitData?.habitEntities, editingHabitId])
  const editingReview = useMemo(() => historyData?.reviewRecords.find((record) => record.id === editingReviewId) ?? null, [historyData?.reviewRecords, editingReviewId])
  const currentWeeklyReview = useMemo(() => reviewData ? historyData?.reviewRecords.find((record) => record.kind === 'weekly' && record.periodStart === reviewData.weekStart) ?? null : null, [historyData?.reviewRecords, reviewData])

  useEffect(() => applyAppearance(appearance), [appearance])

  useEffect(() => {
    document.title = `${viewAnnouncement} — Folio`
  }, [viewAnnouncement])

  useEffect(() => {
    reminderService.start()
    return () => reminderService.stop()
  }, [])

  useEffect(() => {
    const handleUrlAction = async () => {
      const url = new URL(window.location.href)
      const occurrenceId = url.searchParams.get('reminderOccurrence')
      if (!occurrenceId) return
      const action = url.searchParams.get('reminderAction') || 'open'
      // Consume the URL action before awaiting so React StrictMode cannot
      // process the same notification action twice during its dev remount.
      url.searchParams.delete('reminderOccurrence')
      url.searchParams.delete('reminderAction')
      window.history.replaceState(null, '', url)
      if (action !== 'open') await reminderService.handleNotificationAction(occurrenceId, action)
      const occurrence = await reminderService.openTarget(occurrenceId)
      if (action === 'open' && occurrence) openReminderOccurrence(occurrence)
    }
    void handleUrlAction()
    const listener = (event: Event) => {
      const occurrenceId = (event as CustomEvent<{ occurrenceId?: string }>).detail?.occurrenceId
      if (!occurrenceId) return
      void reminderService.openTarget(occurrenceId).then((occurrence) => { if (occurrence) openReminderOccurrence(occurrence) })
    }
    window.addEventListener('folio:notification-open', listener)
    return () => window.removeEventListener('folio:notification-open', listener)
  }, [])

  useEffect(() => {
    function closeTransientSurfaces() {
      setAppearanceOpen(false)
      setMobileMoreOpen(false)
      setDataOpen(false)
      setImportOpen(false)
      setPatchOpen(false)
      setInteropOpen(false)
      setAddOpen(false)
      setTrashOpen(false)
      setFocusOpen(false)
      setPlanDayOpen(false)
      setHabitEditorOpen(false)
      setArchivedHabitsOpen(false)
      setSelectedHabitId(null)
      setRecurrenceEditorOpen(false)
      setReviewWorkflowOpen(false)
      setReviewRecordOpen(false)
      setEditingReviewId(null)
      setSelectedTaskId(null)
      setShortcutHelpOpen(false)
      setKeyboardSettingsOpen(false)
      setReminderCenterOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (paletteOpen) return
        closeTransientSurfaces()
        selection.clear()
        setGoChordPending(false)
        return
      }

      const blockingDialog = Boolean(document.querySelector('[role="dialog"]'))
      if (blockingDialog && !paletteOpen) return

      const editing = isEditableTarget(event.target)
      const paletteHasModifier = shortcuts.palette.includes('mod+') || shortcuts.palette.includes('alt+')
      if (matchesShortcut(event, shortcuts.palette) && (!editing || paletteHasModifier)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }

      if (paletteOpen || shortcutHelpOpen || keyboardSettingsOpen) return
      if (editing) return

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        if (event.shiftKey) selection.clear()
        else selection.selectVisible()
        return
      }

      if (matchesShortcut(event, shortcuts.quickAdd)) {
        event.preventDefault()
        setAddDefaultStatus(view === 'inbox' ? 'inbox' : 'todo')
        setAddDefaultProjectId(view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '')
        setAddDefaultListId(view === 'lists' && selectedListId && !selectedListId.startsWith('__') ? selectedListId : '')
        setAddDefaultPlannedDate(view === 'inbox' ? undefined : localDateKey())
        setAddOpen(true)
        return
      }
      if (matchesShortcut(event, shortcuts.focus)) {
        event.preventDefault()
        openFocus()
        return
      }
      if (matchesShortcut(event, shortcuts.help)) {
        event.preventDefault()
        setShortcutHelpOpen(true)
        return
      }
      if (matchesShortcut(event, shortcuts.nextTask)) {
        event.preventDefault()
        focusRelativeTask(1)
        return
      }
      if (matchesShortcut(event, shortcuts.previousTask)) {
        event.preventDefault()
        focusRelativeTask(-1)
        return
      }
      if (matchesShortcut(event, shortcuts.toggleSelection)) {
        const id = currentTaskId()
        if (id) { event.preventDefault(); selection.toggle(id, { additive: true }) }
        return
      }
      if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const id = currentTaskId()
        if (selection.selectedIds.size) { event.preventDefault(); void completeSelected(true) }
        else if (id) { event.preventDefault(); void toggleTask(id) }
        return
      }
      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        void nudgeTaskDates(event.key === 'ArrowLeft' ? -1 : 1)
        return
      }

      const key = event.key.toLowerCase()
      const now = Date.now()
      if (key === 'g' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        goChordAt.current = now
        setGoChordPending(true)
        if (goChordTimer.current) window.clearTimeout(goChordTimer.current)
        goChordTimer.current = window.setTimeout(() => { goChordAt.current = 0; setGoChordPending(false) }, 900)
        return
      }
      if (now - goChordAt.current < 900) {
        const destination: Record<string, NavView | undefined> = { t: 'today', i: 'inbox', p: 'planner', o: 'projects', l: 'lists', h: 'habits', r: 'review' }
        const next = destination[key]
        goChordAt.current = 0
        setGoChordPending(false)
        if (goChordTimer.current) window.clearTimeout(goChordTimer.current)
        if (next) { event.preventDefault(); navigate(next); return }
        return
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === '/') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'n') {
        event.preventDefault()
        openAdd(view === 'inbox' ? 'inbox' : 'todo', view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '', view === 'inbox' ? undefined : data?.today, view === 'lists' && selectedListId && !selectedListId.startsWith('__') ? selectedListId : '')
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'p') {
        event.preventDefault()
        navigate('projects')
        setEditingProjectId(null)
        setProjectEditorOpen(true)
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 't') {
        event.preventDefault()
        navigate('today')
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (goChordTimer.current) window.clearTimeout(goChordTimer.current)
    }
  }, [view, selectedProjectId, shortcuts, paletteOpen, shortcutHelpOpen, keyboardSettingsOpen, selection])

  const openAdd = useCallback((status: 'todo' | 'inbox' = 'todo', projectId = '', plannedDate?: string, listId = '') => {
    setAddDefaultStatus(status)
    setAddDefaultProjectId(projectId)
    setAddDefaultListId(status === 'inbox' ? '' : listId)
    setAddDefaultPlannedDate(status === 'inbox' ? undefined : plannedDate)
    setAddOpen(true)
  }, [])

  const openFocus = useCallback((taskId?: string) => {
    void focusService.reconcileActive()
    setFocusPreferredTaskId(taskId)
    setSelectedTaskId(null)
    setFocusOpen(true)
  }, [])

  function openReminderOccurrence(occurrence: ReminderOccurrenceEntity) {
    setReminderCenterOpen(false)
    if (occurrence.targetTaskId) {
      setSelectedTaskId(occurrence.targetTaskId)
      return
    }
    if (occurrence.ownerType === 'habit') {
      navigate('habits')
      setSelectedHabitId(occurrence.ownerId)
      return
    }
    if (occurrence.ownerType === 'system' && occurrence.ownerId === 'daily-planning') {
      navigate('today')
      setPlanDayOpen(true)
      return
    }
    if (occurrence.ownerType === 'system' && occurrence.ownerId === 'overdue-summary') {
      navigate('today')
      return
    }
    setReminderCenterOpen(true)
  }

  const registerUndo = useCallback((action: UndoableMutation) => setUndoAction(action), [])

  async function toggleTask(id: string) {
    registerUndo(await taskService.toggleCompleted(id))
  }

  async function taskChangeMutation(id: string, changes: TaskUpdateInput): Promise<UndoableMutation> {
    const before = data?.allTasks.find((task) => task.id === id) ?? data?.subtasks.find((task) => task.id === id)
    const hasDependencies = Object.prototype.hasOwnProperty.call(changes, 'blockedByTaskIds')
    const dependencyIds = hasDependencies ? (changes.blockedByTaskIds ?? []) : undefined
    const { blockedByTaskIds: _blockedByTaskIds, ...nonDependencyChanges } = changes
    const semanticChanges = nonDependencyChanges as TaskUpdateInput
    const applied: UndoableMutation[] = []

    try {
      const movingToInbox = semanticChanges.status === 'inbox'
      const hasPlannedDate = Object.prototype.hasOwnProperty.call(semanticChanges, 'plannedDate')
      const nextPlannedDate = movingToInbox ? undefined : hasPlannedDate ? (semanticChanges.plannedDate === null ? undefined : semanticChanges.plannedDate) : before?.plannedDate

      if (movingToInbox && before?.plannedDate) {
        const { plannedDate: _plannedDate, ...otherChanges } = semanticChanges
        applied.push(await dailyPlanningService.moveToExactDate(id, undefined))
        if (Object.keys(otherChanges).length) {
          const editUndo = await taskService.update(id, otherChanges)
          applied.push(editUndo)
          await dailyPlanningService.markTaskPlanningChange(before, otherChanges as Record<string, unknown>)
        }
      } else if (hasPlannedDate && nextPlannedDate !== before?.plannedDate) {
        const { plannedDate: _plannedDate, ...otherChanges } = semanticChanges
        if (Object.keys(otherChanges).length) {
          const editUndo = await taskService.update(id, otherChanges)
          applied.push(editUndo)
          await dailyPlanningService.markTaskPlanningChange(before, otherChanges as Record<string, unknown>)
        }
        applied.push(await dailyPlanningService.moveToExactDate(id, nextPlannedDate))
      } else if (Object.keys(semanticChanges).length) {
        const editUndo = await taskService.update(id, semanticChanges)
        applied.push(editUndo)
        await dailyPlanningService.markTaskPlanningChange(before, semanticChanges as Record<string, unknown>)
      }

      if (semanticChanges.status === 'inbox') applied.push(await dependencyService.clearEdgesForInbox(id))
      else if (hasDependencies) applied.push(await dependencyService.setBlockers(id, dependencyIds ?? []))
    } catch (error) {
      for (const action of [...applied].reverse()) await action.undo()
      throw error
    }

    if (!applied.length) return { message: 'Task unchanged', undo: async () => {} }
    return combineUndo('Task updated', applied)
  }

  async function saveTask(id: string, changes: TaskUpdateInput, scope: 'this' | 'future' | 'entire' = 'this') {
    const before = data?.allTasks.find((task) => task.id === id) ?? data?.subtasks.find((task) => task.id === id)
    if (!before) throw new Error('Task not found.')
    const effective = taskUpdateDiff(before, changes)
    if (!Object.keys(effective).length) return

    if (!before.seriesId) {
      registerUndo(await taskChangeMutation(id, effective))
      return
    }

    if (scope === 'this') {
      const taskUndo = await taskChangeMutation(id, effective)
      const exceptionChanges = recurrenceOverrideDiff(before, effective)
      const exceptionUndo = Object.keys(exceptionChanges).length
        ? await recurrenceService.recordOccurrenceException(id, exceptionChanges)
        : null
      registerUndo(exceptionUndo ? combineUndo('Occurrence updated', [taskUndo, exceptionUndo]) : taskUndo)
      return
    }

    const template: NonNullable<RecurringSeriesUpdateInput['taskTemplate']> = {}
    if (Object.prototype.hasOwnProperty.call(effective, 'title')) template.title = effective.title
    if (Object.prototype.hasOwnProperty.call(effective, 'description')) template.description = effective.description
    if (Object.prototype.hasOwnProperty.call(effective, 'projectId')) template.projectId = effective.projectId === null ? undefined : effective.projectId
    if (Object.prototype.hasOwnProperty.call(effective, 'listId')) template.listId = effective.listId === null ? undefined : effective.listId
    if (Object.prototype.hasOwnProperty.call(effective, 'sectionId')) template.sectionId = effective.sectionId === null ? undefined : effective.sectionId
    if (Object.prototype.hasOwnProperty.call(effective, 'priority')) template.priority = effective.priority
    if (Object.prototype.hasOwnProperty.call(effective, 'estimatedMinutes')) template.estimatedMinutes = effective.estimatedMinutes === null ? undefined : effective.estimatedMinutes
    if (Object.prototype.hasOwnProperty.call(effective, 'tags')) template.tags = effective.tags
    if (Object.prototype.hasOwnProperty.call(effective, 'tagIds')) template.tagIds = effective.tagIds
    if (Object.prototype.hasOwnProperty.call(effective, 'checklist')) {
      const beforeText = (before.checklist ?? []).map((item) => item.text)
      const nextText = effective.checklist?.map((item) => item.text) ?? []
      if (!sameValue(beforeText, nextText)) template.checklist = nextText
    }
    if (Object.prototype.hasOwnProperty.call(effective, 'sourceUrl')) template.sourceUrl = effective.sourceUrl === null ? undefined : effective.sourceUrl
    if (Object.prototype.hasOwnProperty.call(effective, 'location')) template.location = effective.location === null ? undefined : effective.location
    if (Object.prototype.hasOwnProperty.call(effective, 'pinned')) template.pinned = effective.pinned

    const templateChanged = Object.keys(template).length > 0
    const seriesUndo = templateChanged
      ? (scope === 'future'
          ? await recurrenceService.updateFuture(id, { taskTemplate: template })
          : await recurrenceService.updateEntire(before.seriesId, { taskTemplate: template }))
      : null

    const occurrenceChanges: TaskUpdateInput = {}
    if (Object.prototype.hasOwnProperty.call(effective, 'status')) occurrenceChanges.status = effective.status
    if (Object.prototype.hasOwnProperty.call(effective, 'plannedDate')) occurrenceChanges.plannedDate = effective.plannedDate
    if (Object.prototype.hasOwnProperty.call(effective, 'deadline')) occurrenceChanges.deadline = effective.deadline
    if (Object.prototype.hasOwnProperty.call(effective, 'blockedByTaskIds')) occurrenceChanges.blockedByTaskIds = effective.blockedByTaskIds
    if (Object.prototype.hasOwnProperty.call(effective, 'checklist')) occurrenceChanges.checklist = effective.checklist
    if (Object.prototype.hasOwnProperty.call(effective, 'progressMode')) occurrenceChanges.progressMode = effective.progressMode
    if (Object.prototype.hasOwnProperty.call(effective, 'progressPercent')) occurrenceChanges.progressPercent = effective.progressPercent
    if (Object.prototype.hasOwnProperty.call(effective, 'comments')) occurrenceChanges.comments = effective.comments
    const occurrenceUndo = Object.keys(occurrenceChanges).length ? await taskChangeMutation(id, occurrenceChanges) : null

    if (!seriesUndo && !occurrenceUndo) return
    registerUndo({
      message: scope === 'future' ? 'This and future occurrences updated' : 'Recurring series updated',
      undo: async () => {
        if (occurrenceUndo) await occurrenceUndo.undo()
        if (seriesUndo) await seriesUndo.undo()
      },
    })
  }

  async function toggleHabit(id: string) {
    registerUndo(await habitService.toggleComplete(id, data?.today ?? localDateKey()))
  }

  async function incrementHabit(id: string, minutes: number) {
    registerUndo(await habitService.increment(id, data?.today ?? localDateKey(), minutes))
  }

  async function toggleHabitSkip(id: string) {
    const preview = habitData?.habits.find((habit) => habit.id === id)
    registerUndo(preview?.skipped ? await habitService.unskip(id, data?.today ?? localDateKey()) : await habitService.skip(id, data?.today ?? localDateKey()))
  }

  async function createHabit(input: HabitCreateInput) {
    const { habitId, undo } = await habitService.create(input)
    setSelectedHabitId(habitId)
    registerUndo(undo)
    await dailyPlanningService.markDraft(data?.today ?? localDateKey())
  }

  async function updateHabit(id: string, input: HabitUpdateInput) {
    registerUndo(await habitService.update(id, input))
    await dailyPlanningService.markDraft(data?.today ?? localDateKey())
  }

  async function archiveHabit(id: string) {
    registerUndo(await habitService.archive(id))
    setSelectedHabitId(null)
    await dailyPlanningService.markDraft(data?.today ?? localDateKey())
  }

  async function setTodayBucket(id: string, bucket: DailyPlanBucket) {
    registerUndo(await dailyPlanningService.setBucket(id, data?.today ?? localDateKey(), bucket))
  }

  async function moveTodayOrder(id: string, direction: -1 | 1) {
    const action = await dailyPlanningService.moveWithinBucket(id, data?.today ?? localDateKey(), direction)
    if (action) registerUndo(action)
  }

  async function moveTaskDate(id: string, target: 'today' | 'tomorrow' | 'later') {
    registerUndo(await dailyPlanningService.moveToDate(id, target, data?.today ?? localDateKey()))
  }

  async function moveTaskToExactDate(id: string, date?: string) {
    registerUndo(await dailyPlanningService.moveToExactDate(id, date))
  }

  async function setPlannerCapacity(date: string, minutes?: number) {
    registerUndo(await dailyPlanningService.setCapacity(date, minutes))
  }

  async function setTodayCapacity(minutes?: number) {
    registerUndo(await dailyPlanningService.setCapacity(data?.today ?? localDateKey(), minutes))
  }

  async function commitTodayPlan() {
    registerUndo(await dailyPlanningService.commit(data?.today ?? localDateKey()))
  }

  async function saveDailyWrapUp(note: string) {
    const summary = note.trim()
    await settingsRepository.set(dailyWrapUpKey, summary)
    await reviewRecordService.saveDailySummary(data?.today ?? localDateKey(), summary)
  }

  async function rollForwardToday() {
    const actions: UndoableMutation[] = []
    for (const task of data?.todayTasks ?? []) {
      if (!task.completed) actions.push(await dailyPlanningService.moveToDate(task.id, 'tomorrow', data?.today ?? localDateKey()))
    }
    if (actions.length) registerUndo(combineUndo(actions.length + ' unfinished task' + (actions.length === 1 ? '' : 's') + ' moved to tomorrow', actions))
  }

  function navigate(next: NavView) {
    rememberView(next)
    setView(next)
    setSelectedTaskId(null)
    setSelectedHabitId(null)
    selection.clear()
    if (next !== 'projects') setSelectedProjectId(null)
    if (next !== 'lists') setSelectedListId(null)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }))
  }

  async function completeSelected(completed = true) {
    const ids = [...selection.selectedIds].filter((id) => data?.allTasks.some((task) => task.id === id && !task.deletedAt && task.status !== 'cancelled'))
    const actions: UndoableMutation[] = []
    for (const id of ids) {
      const task = data?.allTasks.find((item) => item.id === id)
      if (!task || task.completed === completed) continue
      actions.push(await taskService.setCompleted(id, completed))
    }
    if (actions.length) registerUndo(combineUndo(completed ? `${actions.length} tasks completed` : `${actions.length} tasks reopened`, actions))
    selection.clear()
  }

  async function moveSelected(target: 'today' | 'tomorrow' | 'later') {
    const ids = [...selection.selectedIds]
    const actions: UndoableMutation[] = []
    for (const id of ids) actions.push(await dailyPlanningService.moveToDate(id, target, data?.today ?? localDateKey()))
    if (actions.length) registerUndo(combineUndo(`${actions.length} tasks moved`, actions))
    selection.clear()
  }

  async function trashSelected() {
    const ids = [...selection.selectedIds]
    const actions: UndoableMutation[] = []
    for (const id of ids) actions.push(await taskService.softDelete(id))
    if (actions.length) registerUndo(combineUndo(`${actions.length} tasks moved to trash`, actions))
    selection.clear()
  }

  async function nudgeTaskDates(days: -1 | 1) {
    const focused = currentTaskId()
    const ids = selection.selectedIds.size ? [...selection.selectedIds] : focused ? [focused] : []
    const actions: UndoableMutation[] = []
    for (const id of ids) {
      const task = data?.allTasks.find((item) => item.id === id)
      if (!task || task.status === 'cancelled' || task.deletedAt) continue
      const base = task.plannedDate ?? data?.today ?? localDateKey()
      actions.push(await dailyPlanningService.moveToExactDate(id, addLocalDays(base, days)))
    }
    if (actions.length) registerUndo(combineUndo(`${actions.length} task${actions.length === 1 ? '' : 's'} moved ${days < 0 ? 'earlier' : 'later'}`, actions))
    if (selection.selectedIds.size) selection.clear()
  }

  async function updateSelected(changes: TaskUpdateInput, message: string) {
    const ids = [...selection.selectedIds]
    if (!ids.length) return
    const action = await taskService.bulkUpdate(ids, changes)
    registerUndo({ ...action, message })
    selection.clear()
  }

  const commands = useMemo<PowerCommand[]>(() => {
    const selected = selection.selectedIds.size
    const actionableTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status === 'todo' && !task.completed)
    const completedTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status === 'completed')
    const searchableTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status !== 'cancelled')
    const readyFocusTasks = actionableTasks.filter((task) => (task.activeBlockerCount ?? 0) === 0)
    const completableHabits = (habitData?.habits ?? []).filter((habit) => habit.scheduledToday && !habit.completed && !habit.paused)
    const skippableHabits = completableHabits.filter((habit) => !habit.skipped)
    const list: PowerCommand[] = [
      { id: 'nav-today', group: 'Navigate', label: 'Go to Today', keywords: 'home daily', run: () => navigate('today') },
      { id: 'nav-inbox', group: 'Navigate', label: 'Go to Inbox', run: () => navigate('inbox') },
      { id: 'nav-planner', group: 'Navigate', label: 'Go to Planner', keywords: 'week calendar upcoming', run: () => navigate('planner') },
      { id: 'nav-projects', group: 'Navigate', label: 'Go to Projects', run: () => navigate('projects') },
      { id: 'nav-lists', group: 'Navigate', label: 'Go to Lists & Tags', keywords: 'lists folders sections tags organize', run: () => navigate('lists') },
      { id: 'nav-habits', group: 'Navigate', label: 'Go to Habits', run: () => navigate('habits') },
      { id: 'nav-review', group: 'Navigate', label: 'Go to Review', run: () => navigate('review') },
      { id: 'capture', group: 'Create', label: 'New task', shortcut: shortcuts.quickAdd, keywords: 'quick add capture create task n', note: 'Capture a task without leaving this view', run: () => openAdd(view === 'inbox' ? 'inbox' : 'todo', view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '', view === 'inbox' ? undefined : data?.today, view === 'lists' && selectedListId && !selectedListId.startsWith('__') ? selectedListId : '') },
      { id: 'create-project', group: 'Create', label: 'New project', shortcut: 'p', keywords: 'create project', run: () => { navigate('projects'); setEditingProjectId(null); setProjectEditorOpen(true) } },
      { id: 'create-list', group: 'Create', label: 'New list', keywords: 'create list organize folder', run: async () => { navigate('lists'); const { list, undo } = await organizationService.createList({ name: 'New list' }); setSelectedListId(list.id); registerUndo(undo) } },
      { id: 'create-habit', group: 'Create', label: 'New habit', keywords: 'create habit routine', run: () => { navigate('habits'); setEditingHabitId(null); setHabitEditorOpen(true) } },
      { id: 'focus', group: 'Execute', label: focusData?.activeSession ? 'Resume Focus' : 'Start Focus', shortcut: shortcuts.focus, run: () => openFocus() },
      { id: 'plan-day', group: 'Plan', label: 'Plan today', note: 'Open the guided daily planning workflow', run: () => { navigate('today'); setPlanDayOpen(true) } },
      { id: 'weekly-review', group: 'Review', label: 'Start weekly review', run: () => { navigate('review'); setReviewWorkflowOpen(true) } },
      { id: 'select-visible', group: 'Selection', label: 'Select all visible tasks', shortcut: 'mod+a', run: selection.selectVisible },
      { id: 'clear-selection', group: 'Selection', label: 'Clear task selection', shortcut: 'mod+shift+a', disabled: !selected, run: selection.clear },
      { id: 'shortcut-help', group: 'System', label: 'Keyboard shortcut help', shortcut: shortcuts.help, run: () => setShortcutHelpOpen(true) },
      { id: 'keyboard-settings', group: 'System', label: 'Configure keyboard shortcuts', keywords: 'key bindings hotkeys', run: () => setKeyboardSettingsOpen(true) },
      { id: 'reminders', group: 'System', label: 'Reminders & notifications', keywords: 'alert notification bell snooze', run: () => setReminderCenterOpen(true) },
      { id: 'appearance', group: 'System', label: 'Appearance', run: () => setAppearanceOpen(true) },
      { id: 'data', group: 'System', label: 'Data & Storage', keywords: 'backup export import', run: () => setDataOpen(true) },
      { id: 'chatgpt-import', group: 'ChatGPT Bridge', label: 'Import a new ChatGPT plan', run: () => setImportOpen(true) },
      { id: 'chatgpt-patch', group: 'ChatGPT Bridge', label: 'Patch existing planner data', run: () => setPatchOpen(true) },
    ]

    list.push(
      { id: 'open-task-picker', group: 'Task actions', label: 'Open task…', keywords: 'find inspect edit task', children: buildTaskCommandChildren('open-task', searchableTasks, (task) => setSelectedTaskId(task.id)), run: () => {} },
      { id: 'complete-task-picker', group: 'Task actions', label: 'Complete task…', keywords: 'done finish check task', children: buildTaskCommandChildren('complete-task', actionableTasks, async (task) => registerUndo(await taskService.setCompleted(task.id, true))), run: () => {} },
      { id: 'reopen-task-picker', group: 'Task actions', label: 'Reopen task…', keywords: 'undo complete reopen task', children: buildTaskCommandChildren('reopen-task', completedTasks, async (task) => registerUndo(await taskService.setCompleted(task.id, false))), run: () => {} },
      { id: 'today-task-picker', group: 'Task actions', label: 'Move task to Today…', keywords: 'schedule plan today task', children: buildTaskCommandChildren('today-task', actionableTasks, (task) => moveTaskDate(task.id, 'today')), run: () => {} },
      { id: 'tomorrow-task-picker', group: 'Task actions', label: 'Move task to Tomorrow…', keywords: 'schedule plan tomorrow task', children: buildTaskCommandChildren('tomorrow-task', actionableTasks, (task) => moveTaskDate(task.id, 'tomorrow')), run: () => {} },
      { id: 'later-task-picker', group: 'Task actions', label: 'Move task to Later…', keywords: 'unschedule someday later task', children: buildTaskCommandChildren('later-task', actionableTasks, (task) => moveTaskDate(task.id, 'later')), run: () => {} },
      { id: 'focus-task-picker', group: 'Task actions', label: 'Start Focus on task…', keywords: 'work execute focus timer task', children: buildTaskCommandChildren('focus-task', readyFocusTasks, (task) => openFocus(task.id)), run: () => {} },
      { id: 'open-project-picker', group: 'Project actions', label: 'Open project…', keywords: 'find project', children: buildProjectCommandChildren('open-project', data?.projects ?? [], (project) => { navigate('projects'); setSelectedProjectId(project.id) }), run: () => {} },
      { id: 'open-habit-picker', group: 'Habit actions', label: 'Open habit…', keywords: 'find habit routine', children: buildHabitCommandChildren('open-habit', habitData?.habits ?? [], (habit) => { navigate('habits'); setSelectedHabitId(habit.id) }), run: () => {} },
      { id: 'complete-habit-picker', group: 'Habit actions', label: 'Complete habit today…', keywords: 'done check habit routine today', children: buildHabitCommandChildren('complete-habit', completableHabits, (habit) => toggleHabit(habit.id)), run: () => {} },
      { id: 'skip-habit-picker', group: 'Habit actions', label: 'Skip habit today…', keywords: 'rest skip habit routine today', children: buildHabitCommandChildren('skip-habit', skippableHabits, (habit) => toggleHabitSkip(habit.id)), run: () => {} },
    )

    for (const task of data?.allTasks ?? []) {
      list.push({
        id: `search-task-${task.id}`,
        group: task.completed ? 'Task · Completed' : task.status === 'inbox' ? 'Task · Inbox' : 'Task · Open',
        label: task.title,
        note: [task.project ?? 'No project', task.plannedDate ? `Planned ${task.plannedDate}` : '', task.deadline ? `Due ${task.deadline}` : ''].filter(Boolean).join(' · '),
        keywords: `${task.description ?? ''} ${task.project ?? ''} ${task.priority} ${task.status} ${task.deadline ?? ''} ${task.plannedDate ?? ''}`,
        searchOnly: true,
        run: () => setSelectedTaskId(task.id),
      })
    }
    for (const project of data?.projects ?? []) {
      list.push({
        id: `search-project-${project.id}`,
        group: 'Project',
        label: project.name,
        note: `${project.openTaskCount} open · ${project.completedTaskCount} done`,
        keywords: `${project.description ?? ''} ${project.type} ${project.icon ?? ''}`,
        searchOnly: true,
        run: () => { navigate('projects'); setSelectedProjectId(project.id) },
      })
    }
    for (const habit of habitData?.habits ?? []) {
      list.push({
        id: `search-habit-${habit.id}`,
        group: 'Habit',
        label: habit.title,
        note: [habit.scheduleLabel ?? '', habit.progress ?? '', `${habit.streak ?? 0} streak`].filter(Boolean).join(' · '),
        keywords: `${habit.description ?? ''} ${habit.scheduleLabel ?? ''}`,
        searchOnly: true,
        run: () => { navigate('habits'); setSelectedHabitId(habit.id) },
      })
    }

    if (selected) {
      list.push(
        { id: 'bulk-complete', group: `Selected · ${selected}`, label: `Complete ${selected} selected task${selected === 1 ? '' : 's'}`, run: () => completeSelected(true) },
        { id: 'bulk-reopen', group: `Selected · ${selected}`, label: `Reopen ${selected} selected task${selected === 1 ? '' : 's'}`, run: () => completeSelected(false) },
        { id: 'bulk-today', group: `Selected · ${selected}`, label: 'Move selected to Today', run: () => moveSelected('today') },
        { id: 'bulk-tomorrow', group: `Selected · ${selected}`, label: 'Move selected to Tomorrow', run: () => moveSelected('tomorrow') },
        { id: 'bulk-later', group: `Selected · ${selected}`, label: 'Move selected to Later', run: () => moveSelected('later') },
        { id: 'bulk-earlier', group: `Selected · ${selected}`, label: 'Move selected one day earlier', shortcut: 'alt+left', run: () => nudgeTaskDates(-1) },
        { id: 'bulk-later-day', group: `Selected · ${selected}`, label: 'Move selected one day later', shortcut: 'alt+right', run: () => nudgeTaskDates(1) },
        { id: 'bulk-priority-normal', group: `Selected · ${selected}`, label: 'Set priority · Normal', run: () => updateSelected({ priority: 'normal' }, `${selected} tasks set to normal priority`) },
        { id: 'bulk-priority-high', group: `Selected · ${selected}`, label: 'Set priority · High', run: () => updateSelected({ priority: 'high' }, `${selected} tasks set to high priority`) },
        { id: 'bulk-priority-critical', group: `Selected · ${selected}`, label: 'Set priority · Critical', run: () => updateSelected({ priority: 'critical' }, `${selected} tasks set to critical priority`) },
        { id: 'bulk-project-none', group: `Selected · ${selected}`, label: 'Move selected to No project', run: () => updateSelected({ projectId: null }, `${selected} tasks moved to No project`) },
        { id: 'bulk-trash', group: `Selected · ${selected}`, label: 'Move selected to Trash', destructive: true, note: 'Reversible with Undo', run: trashSelected },
      )
      for (const project of data?.projects ?? []) list.push({ id: `bulk-project-${project.id}`, group: `Selected · ${selected} · Project`, label: `Move selected to ${project.name}`, run: () => updateSelected({ projectId: project.id }, `${selected} tasks moved to ${project.name}`) })
      list.push({ id: 'bulk-no-list', group: `Selected · ${selected} · List`, label: 'Move selected to No list', run: () => updateSelected({ listId: null, sectionId: null }, `${selected} tasks moved to No list`) })
      for (const targetList of data?.lists ?? []) list.push({ id: `bulk-list-${targetList.id}`, group: `Selected · ${selected} · List`, label: `Move selected to ${targetList.name}`, run: () => updateSelected({ listId: targetList.id, sectionId: null }, `${selected} tasks moved to ${targetList.name}`) })
    }
    return list
  }, [selection.selectedIds, shortcuts, view, selectedProjectId, selectedListId, data?.today, data?.projects, data?.lists, data?.allTasks, focusData?.activeSession, habitData?.habits])

  if (!data || !habitData) return <BootState />

  const topbarTitle = view === 'projects' && selectedProjectId
    ? selectedProjectId === '__unassigned__' ? 'No project' : selectedProject?.name ?? 'Projects'
    : view === 'lists' && selectedListId
      ? data.lists.find((list) => list.id === selectedListId)?.name ?? (selectedListId === '__all__' ? 'All tasks' : selectedListId === '__unlisted__' ? 'No list' : selectedListId === '__high__' ? 'High priority' : selectedListId === '__unscheduled__' ? 'Unscheduled' : 'Lists')
      : viewAnnouncement
  const topbarMeta = view === 'today'
    ? new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())
    : view === 'inbox' ? `${data.inboxTasks.length} unprocessed`
      : view === 'projects' && selectedProjectId ? `${selectedProject?.openTaskCount ?? data.unassignedCount} open tasks`
        : view === 'projects' ? `${data.projects.length} active projects`
          : view === 'lists' && selectedListId ? `${selectedListId.startsWith('__') ? 'Smart collection' : (data.listCounts[selectedListId] ?? 0) + ' open tasks'}`
            : view === 'lists' ? `${data.lists.length} active lists · ${data.tags.length} tags`
          : view === 'habits' ? `${habitData.dueToday} due today`
            : view === 'review' ? 'Review, learn, replan'
              : 'Plan time, deadlines, and capacity'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{viewAnnouncement} view</div>
      <Sidebar active={view} inboxCount={data.inboxTasks.length} favoriteProjects={data.favoriteProjects} favoriteLists={data.favoriteLists} onNavigate={navigate} onOpenProject={(id) => { navigate('projects'); setSelectedProjectId(id) }} onOpenList={(id) => { navigate('lists'); setSelectedListId(id) }} onAppearance={() => setAppearanceOpen(true)} onData={() => setDataOpen(true)} />
      <div className="workspace">
        <div className="mobile-topbar">
          <span>{`Folio · ${viewAnnouncement}`}</span>
          <div className="mobile-topbar__actions"><button className={reminderData?.dueCount ? 'mobile-reminder-button has-reminders' : 'mobile-reminder-button'} onClick={() => setReminderCenterOpen(true)}>Alerts{reminderData?.dueCount ? ` ${reminderData.dueCount}` : ''}</button><button className="mobile-command-button" onClick={() => setPaletteOpen(true)}>Search</button>{focusData?.activeSession ? <button className="is-focus-active" onClick={() => openFocus()}>Resume focus</button> : <button onClick={() => openFocus()}>Focus</button>}</div>
        </div>
        <Topbar title={topbarTitle} meta={topbarMeta} onSearch={() => setPaletteOpen(true)} onAppearance={() => setAppearanceOpen(true)} onAdd={() => openAdd(view === 'inbox' ? 'inbox' : 'todo', '', view === 'inbox' ? undefined : data.today, view === 'lists' && selectedListId && !selectedListId.startsWith('__') ? selectedListId : '')} onFocus={() => openFocus()} onReminders={() => setReminderCenterOpen(true)} reminderCount={reminderData?.dueCount ?? 0} focusActive={Boolean(focusData?.activeSession)} />
        <main className="main-content" id="main-content" ref={mainRef} tabIndex={-1}>
          {view === 'today' ? <TodayView
            tasks={data.todayTasks}
            carryover={data.carryoverTasks}
            nextTasks={data.nextTasks}
            laterTasks={data.laterTasks}
            habits={habitData.todayHabits}
            schedule={data.timeBlocks}
            capacity={data.capacity}
            planStatus={data.dailyPlanStatus}
            deadlineCount={data.upcomingDeadlineTasks.length}
            activeFocus={focusData?.activeSession ? {
              taskId: focusData.activeSession.taskId,
              title: focusData.activeSession.taskTitleSnapshot ?? 'Focus session',
              status: focusData.activeSession.status === 'paused' ? 'paused' : 'running',
            } : undefined}
            todayFocusSeconds={focusData?.todaySeconds ?? 0}
            wrapUpNote={dailyWrapUp}
            onAdd={() => openAdd('todo', '', data.today)}
            onToggle={(id) => void toggleTask(id)}
            onToggleHabit={(id) => void toggleHabit(id)}
            onHabitIncrement={(id, minutes) => void incrementHabit(id, minutes)}
            onOpenHabit={setSelectedHabitId}
            onSkipHabit={(id) => void toggleHabitSkip(id)}
            onOpen={setSelectedTaskId}
            onPlan={() => setPlanDayOpen(true)}
            onBucket={(id, bucket) => void setTodayBucket(id, bucket)}
            onMoveOrder={(id, direction) => void moveTodayOrder(id, direction)}
            onMoveDate={(id, target) => void moveTaskDate(id, target)}
            onFocus={(id) => openFocus(id)}
            onOpenPlanner={() => navigate('planner')}
            onSaveWrapUp={saveDailyWrapUp}
            onRollForward={() => void rollForwardToday()}
          /> : null}
          {view === 'inbox' ? <InboxView tasks={data.inboxTasks} projects={data.projects} onAdd={() => openAdd('inbox')} onTrash={() => setTrashOpen(true)} onToggle={(id) => void toggleTask(id)} onOpen={setSelectedTaskId} onProcess={(id, options) => void taskService.processInbox(id, options).then(async (undo) => { if (options?.plannedDate) await dailyPlanningService.markDraft(options.plannedDate); registerUndo(undo) })} /> : null}
          {view === 'planner' ? <PlannerView
            today={data.today}
            onToggle={(id) => void toggleTask(id)}
            onOpen={setSelectedTaskId}
            onMoveDate={(id, date) => void moveTaskToExactDate(id, date)}
            onSetCapacity={(date, minutes) => void setPlannerCapacity(date, minutes)}
            onAddForDate={(date) => openAdd('todo', '', date)}
            onCreateTaskBlock={(taskId, date, startMinute, durationMinutes) => void timeBlockService.createTaskBlock(taskId, date, startMinute, durationMinutes).then(({ undo }) => registerUndo(undo))}
            onCreateEvent={(title, date, startMinute, durationMinutes, details) => void timeBlockService.createEvent(title, date, startMinute, durationMinutes, details).then(({ undo }) => registerUndo(undo))}
            onUpdateBlock={(id, date, startMinute, durationMinutes) => void timeBlockService.updateTiming(id, date, startMinute, durationMinutes).then(registerUndo)}
            onUpdateEvent={(id, title, date, startMinute, durationMinutes, details) => void timeBlockService.updateEvent(id, title, date, startMinute, durationMinutes, details).then(registerUndo)}
            onResizeBlock={(id, durationMinutes) => void timeBlockService.resize(id, durationMinutes).then(registerUndo)}
            onDeleteBlock={(id) => void timeBlockService.remove(id).then(registerUndo)}
            onSaveSavedView={async (savedView) => { const action = await savedViewService.save(savedView); registerUndo(action); return action }}
            onDeleteSavedView={async (id) => { const action = await savedViewService.remove(id); registerUndo(action); return action }}
          /> : null}
          {view === 'projects' ? (selectedProjectId ? <ProjectDetailView
            project={selectedProject}
            unassigned={selectedProjectId === '__unassigned__'}
            tasks={data.allTasks.filter((task) => selectedProjectId === '__unassigned__' ? (!task.projectId && task.status !== 'inbox') : task.projectId === selectedProjectId)}
            schedule={data.allTimeBlocks}
            focusThisWeekSeconds={focusData?.projectWeekSeconds[selectedProjectId === '__unassigned__' ? '__unassigned__' : selectedProjectId] ?? 0}
            onBack={() => setSelectedProjectId(null)}
            onTaskOpen={setSelectedTaskId}
            onTaskToggle={(id) => void toggleTask(id)}
            onTaskMove={(id, target) => void moveTaskDate(id, target)}
            onTaskFocus={(id) => openFocus(id)}
            onAddTask={() => openAdd('todo', selectedProjectId === '__unassigned__' ? '' : selectedProjectId)}
            onEdit={selectedProject ? () => { setEditingProjectId(selectedProject.id); setProjectEditorOpen(true) } : undefined}
            onToggleFavorite={selectedProject ? () => void projectService.toggleFavorite(selectedProject.id).then(registerUndo) : undefined}
            onArchive={selectedProject ? () => void projectService.archive(selectedProject.id).then((undo) => { setSelectedProjectId(null); registerUndo(undo) }) : undefined}
            onSetNextAction={selectedProject ? (taskId) => void projectService.setNextAction(selectedProject.id, taskId).then(registerUndo) : undefined}
            onAddMilestone={selectedProject ? (title, dueDate) => void projectService.addMilestone(selectedProject.id, title, dueDate).then(registerUndo) : undefined}
            onToggleMilestone={selectedProject ? (milestoneId) => void projectService.toggleMilestone(selectedProject.id, milestoneId).then(registerUndo) : undefined}
            onRemoveMilestone={selectedProject ? (milestoneId) => void projectService.removeMilestone(selectedProject.id, milestoneId).then(registerUndo) : undefined}
          /> : <ProjectsView projects={data.projects} unassignedCount={data.unassignedCount} onCreate={() => { setEditingProjectId(null); setProjectEditorOpen(true) }} onOpen={setSelectedProjectId} onArchived={() => setArchivedProjectsOpen(true)} />) : null}
          {view === 'lists' ? <OrganizationView
            folders={data.folders}
            archivedFolders={data.archivedFolders}
            lists={data.lists}
            archivedLists={data.archivedLists}
            sections={data.sections}
            tags={data.tags}
            tasks={data.allTasks}
            listCounts={data.listCounts}
            tagCounts={data.tagCounts}
            selectedListId={selectedListId}
            onSelectList={setSelectedListId}
            onCreateFolder={async (name) => { const { undo } = await organizationService.createFolder({ name }); registerUndo(undo) }}
            onCreateList={async (name, folderId) => { const { undo } = await organizationService.createList({ name, folderId }); registerUndo(undo) }}
            onCreateSection={async (listId, name) => { const { undo } = await organizationService.createSection({ listId, name }); registerUndo(undo) }}
            onCreateTag={async (name, parentTagId) => { const { undo } = await organizationService.createTag({ name, parentTagId }); registerUndo(undo) }}
            onUpdateList={async (id, changes) => registerUndo(await organizationService.updateList(id, changes))}
            onUpdateFolder={async (id, changes) => registerUndo(await organizationService.updateFolder(id, changes))}
            onUpdateTag={async (id, changes) => registerUndo(await organizationService.updateTag(id, changes))}
            onMergeTag={async (sourceId, targetId) => registerUndo(await organizationService.mergeTag(sourceId, targetId))}
            onArchiveSection={async (id) => registerUndo(await organizationService.archiveSection(id, true))}
            onOpenTask={setSelectedTaskId}
            onToggleTask={(id) => void toggleTask(id)}
            onMoveTask={async (taskId, listId, sectionId) => registerUndo(await organizationService.moveTask(taskId, listId, sectionId))}
            onAddTask={(listId) => openAdd('todo', '', data.today, listId)}
          /> : null}
          {view === 'habits' ? <HabitsView habits={habitData.habits} weeklyAdherence={habitData.weeklyAdherence} dueToday={habitData.dueToday} longestStreak={habitData.longestStreak} pausedCount={habitData.pausedCount} onCreate={() => { setEditingHabitId(null); setHabitEditorOpen(true) }} onArchived={() => setArchivedHabitsOpen(true)} onOpen={setSelectedHabitId} onToggle={(id) => void toggleHabit(id)} onIncrement={(id, minutes) => void incrementHabit(id, minutes)} /> : null}
          {view === 'review' ? <ReviewView
            snapshot={reviewData}
            recentCompleted={data.allTasks.filter((task) => task.completed).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))}
            recentFocus={focusData?.recentSessions ?? []}
            historyEvents={historyData?.events ?? []}
            reviewRecords={historyData?.reviewRecords ?? []}
            onOpenTask={setSelectedTaskId}
            onOpenProject={(id) => { navigate('projects'); setSelectedProjectId(id) }}
            onStartReview={() => setReviewWorkflowOpen(true)}
            onNewReview={(kind) => { setReviewRecordKind(kind); setEditingReviewId(null); setReviewRecordOpen(true) }}
            onEditReview={(record) => { setReviewRecordKind(record.kind); setEditingReviewId(record.id); setReviewRecordOpen(true) }}
          /> : null}
        </main>
      </div>
      <PwaStatusBanner />
      <BackupReminderBanner />
      <RuntimeIssueBanner onOpenData={() => setDataOpen(true)} />
      <MobileNav active={view} onNavigate={navigate} onAdd={() => openAdd(view === 'inbox' ? 'inbox' : 'todo')} onMore={() => setMobileMoreOpen(true)} />
      <MobileMoreSheet
        open={mobileMoreOpen}
        active={view}
        focusActive={Boolean(focusData?.activeSession)}
        onClose={() => setMobileMoreOpen(false)}
        onNavigate={navigate}
        onFocus={() => openFocus()}
        onAppearance={() => setAppearanceOpen(true)}
        onData={() => setDataOpen(true)}
      />

      {goChordPending ? <div className="key-chord-hud" role="status"><kbd>G</kbd><span>T Today · I Inbox · P Planner · O Projects · L Lists · H Habits · R Review</span></div> : null}
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelpModal open={shortcutHelpOpen} shortcuts={shortcuts} onClose={() => setShortcutHelpOpen(false)} onConfigure={() => { setShortcutHelpOpen(false); setKeyboardSettingsOpen(true) }} />
      <KeyboardSettingsDrawer open={keyboardSettingsOpen} value={shortcuts} onClose={() => setKeyboardSettingsOpen(false)} onSave={(next) => void settingsRepository.set('power.shortcuts', next)} />
      <BulkActionBar
        count={selection.selectedIds.size}
        onComplete={() => void completeSelected(true)}
        onToday={() => void moveSelected('today')}
        onTomorrow={() => void moveSelected('tomorrow')}
        onLater={() => void moveSelected('later')}
        onTrash={() => void trashSelected()}
        onMore={() => setPaletteOpen(true)}
        onClear={selection.clear}
      />

      <ReminderCenterDrawer open={reminderCenterOpen} onClose={() => setReminderCenterOpen(false)} onOpenOccurrence={openReminderOccurrence} />
      <AppearanceDrawer open={appearanceOpen} appearance={appearance} onChange={(next) => void settingsRepository.setAppearance(next)} onClose={() => setAppearanceOpen(false)} />
      <DataDrawer open={dataOpen} onClose={() => setDataOpen(false)} onOpenImport={() => setImportOpen(true)} onOpenPatch={() => setPatchOpen(true)} onOpenInterop={() => setInteropOpen(true)} />
      <ImportPlanModal open={importOpen} projects={[...data.projects, ...data.archivedProjects]} onClose={() => setImportOpen(false)} onApplied={registerUndo} />
      <PatchPlanModal open={patchOpen} onClose={() => setPatchOpen(false)} onApplied={registerUndo} />
      <InteroperabilityModal open={interopOpen} projects={[...data.projects, ...data.archivedProjects]} onClose={() => setInteropOpen(false)} onUndo={registerUndo} />

      <QuickAddModal
        open={addOpen}
        projects={data.projects}
        lists={data.lists}
        defaultStatus={addDefaultStatus}
        defaultProjectId={addDefaultProjectId}
        defaultListId={addDefaultListId}
        defaultPlannedDate={addDefaultPlannedDate ?? data.today}
        onClose={() => setAddOpen(false)}
        onImport={() => { setAddOpen(false); setImportOpen(true) }}
        onCreate={async (request) => {
          registerUndo(await createCapturedItem(request))
        }}
        onCreateBatch={async (requests) => {
          registerUndo(await createCapturedBatch(requests))
        }}
      />

      <PlanDayModal
        open={planDayOpen}
        today={data.today}
        tasks={data.todayTasks}
        carryover={data.carryoverTasks}
        deadlines={data.upcomingDeadlineTasks}
        habits={habitData.todayHabits}
        capacity={data.capacity}
        defaultCapacity={data.defaultCapacity}
        planStatus={data.dailyPlanStatus}
        onClose={() => setPlanDayOpen(false)}
        onMoveDate={moveTaskDate}
        onBucket={setTodayBucket}
        onSetCapacity={setTodayCapacity}
        onCommit={commitTodayPlan}
        onOpenTask={(id) => { setPlanDayOpen(false); setSelectedTaskId(id) }}
        onToggleTask={(id) => void toggleTask(id)}
      />

      <HabitEditorModal
        open={habitEditorOpen}
        habit={editingHabit}
        onClose={() => { setHabitEditorOpen(false); setEditingHabitId(null) }}
        onCreate={createHabit}
        onUpdate={updateHabit}
      />

      <HabitDetailDrawer
        open={Boolean(selectedHabitId)}
        habit={selectedHabit}
        preview={selectedHabitPreview}
        entries={habitData.entries}
        today={data.today}
        onClose={() => setSelectedHabitId(null)}
        onEdit={() => { if (selectedHabitId) { setEditingHabitId(selectedHabitId); setHabitEditorOpen(true) } }}
        onArchive={() => selectedHabitId && void archiveHabit(selectedHabitId)}
        onToggle={() => selectedHabitId && void toggleHabit(selectedHabitId)}
        onIncrement={(minutes) => selectedHabitId && void incrementHabit(selectedHabitId, minutes)}
        onSkip={() => selectedHabitId && void toggleHabitSkip(selectedHabitId)}
        onPause={(through) => selectedHabitId && void habitService.pause(selectedHabitId, data.today, through).then(async (undo) => { registerUndo(undo); await dailyPlanningService.markDraft(data.today) })}
        onResume={() => selectedHabitId && void habitService.resume(selectedHabitId, data.today).then(async (undo) => { registerUndo(undo); await dailyPlanningService.markDraft(data.today) })}
      />

      <ArchivedHabitsDrawer
        open={archivedHabitsOpen}
        habits={habitData.archivedHabits}
        onClose={() => setArchivedHabitsOpen(false)}
        onRestore={(id) => void habitService.restore(id).then(async (undo) => { registerUndo(undo); await dailyPlanningService.markDraft(data.today) })}
      />

      <ReviewWorkflowModal
        open={reviewWorkflowOpen}
        snapshot={reviewData}
        existingRecord={currentWeeklyReview}
        onClose={() => setReviewWorkflowOpen(false)}
        onMoveTask={(id, target) => void moveTaskDate(id, target)}
        onTrashTask={(id) => void taskService.softDelete(id).then(registerUndo)}
        onOpenTask={(id) => { setReviewWorkflowOpen(false); setSelectedTaskId(id) }}
        onSaveReview={async (reflection) => {
          if (!reviewData) return
          const saved = await reviewRecordService.save({ kind: 'weekly', anchorDate: reviewData.today, ...reflection })
          registerUndo(saved.undo)
        }}
        onOpenPlanner={() => navigate('planner')}
      />

      <ReviewRecordModal
        open={reviewRecordOpen}
        today={data.today}
        initialKind={reviewRecordKind}
        record={editingReview}
        onClose={() => { setReviewRecordOpen(false); setEditingReviewId(null) }}
        onSave={async (draft) => { const saved = await reviewRecordService.save(draft); registerUndo(saved.undo) }}
        onDelete={async (id) => { registerUndo(await reviewRecordService.remove(id)) }}
      />

      <TaskInspector
        task={selectedTask}
        subtasks={selectedSubtasks}
        projects={[...data.projects, ...data.archivedProjects]}
        lists={data.lists}
        sections={data.sections}
        tags={data.tags}
        dependencyCandidates={data.allTasks}
        series={selectedSeries}
        focusSeconds={selectedTask ? focusData?.taskTotals[selectedTask.id] ?? 0 : 0}
        onClose={() => { setSelectedTaskId(null); setRecurrenceEditorOpen(false) }}
        onSave={saveTask}
        onToggle={(id) => void toggleTask(id)}
        onToggleSubtask={(id) => void toggleTask(id)}
        onOpenSubtask={(id) => setSelectedTaskId(id)}
        onAddSubtask={(parentId, title) => taskService.createSubtask(parentId, title).then(() => undefined)}
        onDeleteSubtask={(id) => void taskService.softDelete(id).then(registerUndo)}
        onDuplicate={(id) => void taskService.duplicate(id).then(({ id: newId, undo }) => { setSelectedTaskId(newId); registerUndo(undo) })}
        onDelete={(id) => void taskService.softDelete(id).then((undo) => { setSelectedTaskId(null); registerUndo(undo) })}
        onProcessInbox={(id, options) => void taskService.processInbox(id, options).then(async (undo) => { if (options?.plannedDate) await dailyPlanningService.markDraft(options.plannedDate); registerUndo(undo) })}
        onOpenRecurrence={() => setRecurrenceEditorOpen(true)}
        onSkipOccurrence={(id) => void recurrenceService.skipOccurrence(id).then(registerUndo)}
        onSetSeriesStatus={(seriesId, status) => void recurrenceService.setStatus(seriesId, status).then(registerUndo)}
        onFocus={(taskId) => openFocus(taskId)}
      />

      <RecurrenceEditorModal
        open={recurrenceEditorOpen}
        task={selectedTask}
        series={selectedSeries}
        onClose={() => setRecurrenceEditorOpen(false)}
        onCreate={async (taskId, value) => {
          registerUndo(await recurrenceService.convertTask(taskId, {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
            startDate: value.startDate, rule: recurrenceRule(value),
            taskTemplate: { deadlineOffsetDays: value.deadlineOffsetDays, startMinute: value.startMinute, blockDurationMinutes: value.blockDurationMinutes },
          }))
        }}
        onUpdate={async (taskId, scope, value) => {
          const update = { rule: recurrenceRule(value), taskTemplate: { deadlineOffsetDays: value.deadlineOffsetDays, startMinute: value.startMinute, blockDurationMinutes: value.blockDurationMinutes } }
          registerUndo(scope === 'future' ? await recurrenceService.updateFuture(taskId, update) : await recurrenceService.updateEntire(selectedSeries!.id, update))
        }}
      />

      <ProjectEditorModal
        open={projectEditorOpen}
        project={editingProject}
        onClose={() => { setProjectEditorOpen(false); setEditingProjectId(null) }}
        onCreate={async (input: ProjectCreateInput) => { const project = await projectService.create(input); setSelectedProjectId(project.id) }}
        onUpdate={async (id: string, input: ProjectUpdateInput) => { registerUndo(await projectService.update(id, input)) }}
      />
      <ArchivedProjectsDrawer open={archivedProjectsOpen} projects={data.archivedProjects} onClose={() => setArchivedProjectsOpen(false)} onRestore={(id) => void projectService.restore(id).then(registerUndo)} />

      <TrashDrawer open={trashOpen} tasks={data.trashTasks} onClose={() => setTrashOpen(false)} onRestore={(id) => void taskService.restore(id).then(registerUndo)} />
      <FocusOverlay
        open={focusOpen}
        activeSession={focusData?.activeSession}
        tasks={[...data.openTasks, ...data.subtasks.filter((task) => task.status === 'todo' || task.status === 'inbox')]}
        preferredTaskId={focusPreferredTaskId}
        taskTotals={focusData?.taskTotals ?? {}}
        recentSessions={focusData?.recentSessions ?? []}
        todaySeconds={focusData?.todaySeconds ?? 0}
        weekSeconds={focusData?.weekSeconds ?? 0}
        weekSessionCount={focusData?.weekSessionCount ?? 0}
        onClose={() => setFocusOpen(false)}
        onStart={async (taskId, mode, targetSeconds, plannedSeconds, intention) => { await focusService.start(taskId, mode, targetSeconds, plannedSeconds, intention); setFocusPreferredTaskId(taskId) }}
        onPause={async (id) => { await focusService.pause(id) }}
        onResume={async (id) => { await focusService.resume(id) }}
        onFinish={async (id, note) => { await focusService.finish(id, note); setFocusOpen(false) }}
        onFinishTask={async (id, taskId, note) => { await focusService.finish(id, note); if (taskId) registerUndo(await taskService.setCompleted(taskId, true)); setFocusOpen(false) }}
        onCancel={async (id) => { await focusService.cancel(id); setFocusOpen(false) }}
      />
      <UndoToast
        action={undoAction}
        onDismiss={() => setUndoAction(null)}
        onUndo={() => {
          const action = undoAction
          setUndoAction(null)
          if (action) void action.undo()
        }}
      />
    </div>
  )
}

export function App() {
  return <TaskSelectionProvider><AppContent /></TaskSelectionProvider>
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function taskUpdateDiff(before: TaskPreview, changes: TaskUpdateInput): TaskUpdateInput {
  const diff: TaskUpdateInput = {}
  const has = (key: keyof TaskUpdateInput) => Object.prototype.hasOwnProperty.call(changes, key)
  const normalized = <T,>(value: T | null | undefined): T | undefined => value === null ? undefined : value

  if (has('title') && changes.title !== before.title) diff.title = changes.title
  if (has('description') && changes.description !== (before.description ?? '')) diff.description = changes.description
  if (has('projectId') && normalized(changes.projectId) !== before.projectId) diff.projectId = changes.projectId
  if (has('listId') && normalized(changes.listId) !== before.listId) diff.listId = changes.listId
  if (has('sectionId') && normalized(changes.sectionId) !== before.sectionId) diff.sectionId = changes.sectionId
  if (has('parentTaskId') && normalized(changes.parentTaskId) !== before.parentTaskId) diff.parentTaskId = changes.parentTaskId
  if (has('priority') && changes.priority !== before.priority) diff.priority = changes.priority
  if (has('status') && changes.status !== before.status) diff.status = changes.status
  if (has('plannedDate') && normalized(changes.plannedDate) !== before.plannedDate) diff.plannedDate = changes.plannedDate
  if (has('deadline') && normalized(changes.deadline) !== before.deadline) diff.deadline = changes.deadline
  if (has('estimatedMinutes') && normalized(changes.estimatedMinutes) !== before.durationMinutes) diff.estimatedMinutes = changes.estimatedMinutes
  if (has('tags') && !sameValue(changes.tags ?? [], before.tags ?? [])) diff.tags = changes.tags
  if (has('tagIds') && !sameValue(changes.tagIds ?? [], before.tagIds ?? [])) diff.tagIds = changes.tagIds
  if (has('checklist') && !sameValue(changes.checklist ?? [], before.checklist ?? [])) diff.checklist = changes.checklist
  if (has('progressMode') && changes.progressMode !== (before.progressMode ?? 'auto')) diff.progressMode = changes.progressMode
  const nextProgressMode = changes.progressMode ?? before.progressMode ?? 'auto'
  if (has('progressPercent') && nextProgressMode === 'manual' && changes.progressPercent !== (before.progressPercent ?? 0)) diff.progressPercent = changes.progressPercent
  if (has('sourceUrl') && normalized(changes.sourceUrl) !== before.sourceUrl) diff.sourceUrl = changes.sourceUrl
  if (has('location') && normalized(changes.location) !== before.location) diff.location = changes.location
  if (has('pinned') && changes.pinned !== Boolean(before.pinned)) diff.pinned = changes.pinned
  if (has('comments') && !sameValue(changes.comments ?? [], before.comments ?? [])) diff.comments = changes.comments
  if (has('blockedByTaskIds') && !sameValue(changes.blockedByTaskIds ?? [], before.blockedByTaskIds ?? [])) diff.blockedByTaskIds = changes.blockedByTaskIds
  if (has('sortOrder')) diff.sortOrder = changes.sortOrder
  return diff
}

function recurrenceOverrideDiff(before: TaskPreview, changes: TaskUpdateInput): TaskUpdateInput {
  const override: TaskUpdateInput = { ...changes }
  // Planner/date mutations persist their own recurrence exception transactionally.
  delete override.plannedDate
  // Completion state, blockers, manual progress and comments are occurrence state,
  // not recurring template/exception defaults.
  delete override.status
  delete override.blockedByTaskIds
  delete override.progressMode
  delete override.progressPercent
  delete override.comments
  delete override.sortOrder
  delete override.parentTaskId

  if (Object.prototype.hasOwnProperty.call(override, 'checklist')) {
    const beforeText = (before.checklist ?? []).map((item) => item.text)
    const nextText = override.checklist?.map((item) => item.text) ?? []
    if (sameValue(beforeText, nextText)) delete override.checklist
  }
  return override
}

function combineUndo(message: string, actions: UndoableMutation[]): UndoableMutation {
  return {
    message,
    undo: async () => {
      for (const action of [...actions].reverse()) await action.undo()
    },
  }
}

function recurrenceRule(value: RecurrenceEditorValue) {
  return {
    frequency: value.frequency,
    interval: value.interval,
    weekdays: value.weekdays,
    monthlyMode: value.monthlyMode,
    monthDays: value.monthDays,
    ordinal: value.ordinal,
    weekday: value.weekday,
    yearMonths: value.yearMonths,
    afterCompletionUnit: value.afterCompletionUnit,
    until: value.until,
    count: value.count,
  }
}

function BootState() {
  return <div className="boot-state"><div><span className="brand__mark" /><p>Opening local workspace…</p></div></div>
}
