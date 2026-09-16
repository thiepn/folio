import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, content) => fs.writeFileSync(path, content)

function replaceOnce(path, before, after) {
  const source = read(path)
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}`)
  write(path, source.replace(before, after))
}

replaceOnce(
  'src/features/today/TodayView.tsx',
  "import { useEffect, useMemo, useState } from 'react'",
  "import { useEffect, useMemo, useState, type ReactNode } from 'react'",
)
replaceOnce('src/features/today/TodayView.tsx', 'actions: React.ReactNode', 'actions: ReactNode')

replaceOnce('scripts/validate-final.mjs', "pkg.version === '1.1.1'", "pkg.version === '1.2.0'")
replaceOnce(
  'scripts/validate-release.mjs',
  "check('patch release version is 1.1.1', pkg.version === '1.1.1', pkg.version)",
  "check('release version is 1.2.0', pkg.version === '1.2.0', pkg.version)",
)

let app = read('src/app/App.tsx')
const shortcutBefore = [
  "  const storedShortcuts = useLiveQuery(() => settingsRepository.get<unknown>('power.shortcuts', DEFAULT_SHORTCUTS), [], DEFAULT_SHORTCUTS)",
  '  const shortcuts = useMemo<ShortcutMap>(() => normalizeShortcutMap(storedShortcuts), [storedShortcuts])',
].join('\n')
const shortcutAfter = [
  "  const storedShortcuts = useLiveQuery(() => settingsRepository.get<unknown>('power.shortcuts', DEFAULT_SHORTCUTS), [], DEFAULT_SHORTCUTS)",
  "  const dailyWrapUpKey = `daily.wrapup.${data?.today ?? localDateKey()}`",
  "  const dailyWrapUp = useLiveQuery(() => settingsRepository.get<string>(dailyWrapUpKey, ''), [dailyWrapUpKey], '') ?? ''",
  '  const shortcuts = useMemo<ShortcutMap>(() => normalizeShortcutMap(storedShortcuts), [storedShortcuts])',
].join('\n')
if (!app.includes(shortcutBefore)) throw new Error('App: wrap-up hook anchor missing')
app = app.replace(shortcutBefore, shortcutAfter)

const actionsBefore = [
  '  async function commitTodayPlan() {',
  '    registerUndo(await dailyPlanningService.commit(data?.today ?? localDateKey()))',
  '  }',
  '',
  '  function navigate(next: NavView) {',
].join('\n')
const actionsAfter = [
  '  async function commitTodayPlan() {',
  '    registerUndo(await dailyPlanningService.commit(data?.today ?? localDateKey()))',
  '  }',
  '',
  '  async function saveDailyWrapUp(note: string) {',
  '    await settingsRepository.set(dailyWrapUpKey, note.trim())',
  '  }',
  '',
  '  async function rollForwardToday() {',
  '    const actions: UndoableMutation[] = []',
  '    for (const task of data?.todayTasks ?? []) {',
  "      if (!task.completed) actions.push(await dailyPlanningService.moveToDate(task.id, 'tomorrow', data?.today ?? localDateKey()))",
  '    }',
  "    if (actions.length) registerUndo(combineUndo(actions.length + ' unfinished task' + (actions.length === 1 ? '' : 's') + ' moved to tomorrow', actions))",
  '  }',
  '',
  '  function navigate(next: NavView) {',
].join('\n')
if (!app.includes(actionsBefore)) throw new Error('App: daily action anchor missing')
app = app.replace(actionsBefore, actionsAfter)

const todayPattern = /          \{view === 'today' \? <TodayView[^\n]+\/> : null\}/
const todayAfter = [
  "          {view === 'today' ? <TodayView",
  '            tasks={data.todayTasks}',
  '            carryover={data.carryoverTasks}',
  '            nextTasks={data.nextTasks}',
  '            laterTasks={data.laterTasks}',
  '            habits={habitData.todayHabits}',
  '            schedule={data.timeBlocks}',
  '            capacity={data.capacity}',
  '            planStatus={data.dailyPlanStatus}',
  '            deadlineCount={data.upcomingDeadlineTasks.length}',
  '            activeFocus={focusData?.activeSession ? {',
  '              taskId: focusData.activeSession.taskId,',
  "              title: focusData.activeSession.taskTitleSnapshot ?? 'Focus session',",
  "              status: focusData.activeSession.status === 'paused' ? 'paused' : 'running',",
  '            } : undefined}',
  '            todayFocusSeconds={focusData?.todaySeconds ?? 0}',
  '            wrapUpNote={dailyWrapUp}',
  "            onAdd={() => openAdd('todo', '', data.today)}",
  '            onToggle={(id) => void toggleTask(id)}',
  '            onToggleHabit={(id) => void toggleHabit(id)}',
  '            onHabitIncrement={(id, minutes) => void incrementHabit(id, minutes)}',
  '            onOpenHabit={setSelectedHabitId}',
  '            onSkipHabit={(id) => void toggleHabitSkip(id)}',
  '            onOpen={setSelectedTaskId}',
  '            onPlan={() => setPlanDayOpen(true)}',
  '            onBucket={(id, bucket) => void setTodayBucket(id, bucket)}',
  '            onMoveOrder={(id, direction) => void moveTodayOrder(id, direction)}',
  '            onMoveDate={(id, target) => void moveTaskDate(id, target)}',
  '            onFocus={(id) => openFocus(id)}',
  "            onOpenPlanner={() => navigate('planner')}",
  '            onSaveWrapUp={saveDailyWrapUp}',
  '            onRollForward={() => void rollForwardToday()}',
  '          /> : null}',
].join('\n')
if (!todayPattern.test(app)) throw new Error('App: TodayView render anchor missing')
app = app.replace(todayPattern, todayAfter)
write('src/app/App.tsx', app)

let readme = read('README.md')
readme = readme.replace('# Folio — v1.1.1', '# Folio — v1.2.0')
readme = readme.replace('**Release:** `1.1.1`', '**Release:** `1.2.0`')
if (!readme.includes('## v1.2 — Daily Workflow')) {
  const marker = '## Data and privacy\n'
  if (!readme.includes(marker)) throw new Error('README: Data marker missing')
  const section = [
    '## v1.2 — Daily Workflow',
    '',
    "Today is now Folio's daily operating surface: explicit carryover resolution, a protected Top 3, Today/Next/Later triage, current Focus context, habits and capacity in one hierarchy, plus an end-of-day wrap-up with undoable roll-forward. The release intentionally reuses the v12 planning model rather than introducing duplicate priority or triage state.",
    '',
    'See `docs/DAILY_WORKFLOW_V1_2.md`.',
    '',
  ].join('\n')
  readme = readme.replace(marker, section + marker)
}
write('README.md', readme)
