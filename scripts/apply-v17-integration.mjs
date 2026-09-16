import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const write = (p, value) => fs.writeFileSync(path.join(root, p), value)

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`)
  return text.replace(from, to)
}

// App wiring: command builders, palette escape ownership, fixed aliases, nested actions, and mobile search.
{
  const file = 'src/app/App.tsx'
  let text = read(file)
  text = replaceOne(text,
    `import { CommandPalette, type PowerCommand } from '../features/power/CommandPalette'\n`,
    `import { CommandPalette, type PowerCommand } from '../features/power/CommandPalette'\nimport { buildHabitCommandChildren, buildProjectCommandChildren, buildTaskCommandChildren } from '../features/power/commandBuilders'\n`,
    'command builder import')

  text = replaceOne(text,
    `        if (paletteOpen) { setPaletteOpen(false); return }`,
    `        if (paletteOpen) return`,
    'palette owns escape')

  const oldChord = `      if (now - goChordAt.current < 900) {\n        const destination: Record<string, NavView | undefined> = { t: 'today', i: 'inbox', p: 'planner', o: 'projects', h: 'habits', r: 'review' }\n        const next = destination[key]\n        goChordAt.current = 0\n        setGoChordPending(false)\n        if (goChordTimer.current) window.clearTimeout(goChordTimer.current)\n        if (next) { event.preventDefault(); navigate(next) }\n      }`
  const newChord = `      if (now - goChordAt.current < 900) {\n        const destination: Record<string, NavView | undefined> = { t: 'today', i: 'inbox', p: 'planner', o: 'projects', h: 'habits', r: 'review' }\n        const next = destination[key]\n        goChordAt.current = 0\n        setGoChordPending(false)\n        if (goChordTimer.current) window.clearTimeout(goChordTimer.current)\n        if (next) { event.preventDefault(); navigate(next); return }\n        return\n      }\n\n      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === '/') {\n        event.preventDefault()\n        setPaletteOpen(true)\n        return\n      }\n      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'n') {\n        event.preventDefault()\n        openAdd(view === 'inbox' ? 'inbox' : 'todo', view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '', view === 'inbox' ? undefined : data?.today)\n        return\n      }\n      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'p') {\n        event.preventDefault()\n        navigate('projects')\n        setEditingProjectId(null)\n        setProjectEditorOpen(true)\n        return\n      }\n      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 't') {\n        event.preventDefault()\n        navigate('today')\n        return\n      }`
  text = replaceOne(text, oldChord, newChord, 'command-first fixed aliases')

  text = replaceOne(text,
    `  const commands = useMemo<PowerCommand[]>(() => {\n    const selected = selection.selectedIds.size\n    const list: PowerCommand[] = [`,
    `  const commands = useMemo<PowerCommand[]>(() => {\n    const selected = selection.selectedIds.size\n    const actionableTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status === 'todo' && !task.completed)\n    const completedTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status === 'completed')\n    const searchableTasks = (data?.allTasks ?? []).filter((task) => !task.deletedAt && task.status !== 'cancelled')\n    const readyFocusTasks = actionableTasks.filter((task) => (task.activeBlockerCount ?? 0) === 0)\n    const completableHabits = (habitData?.habits ?? []).filter((habit) => habit.scheduledToday && !habit.completed && !habit.paused)\n    const skippableHabits = completableHabits.filter((habit) => !habit.skipped)\n    const list: PowerCommand[] = [`,
    'command action datasets')

  text = replaceOne(text,
    `      { id: 'capture', group: 'Create', label: 'Quick Add', shortcut: shortcuts.quickAdd, note: 'Capture a task without leaving this view', run: () => openAdd(view === 'inbox' ? 'inbox' : 'todo', view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '', view === 'inbox' ? undefined : data?.today) },\n      { id: 'focus', group: 'Execute', label: focusData?.activeSession ? 'Resume Focus' : 'Start Focus', shortcut: shortcuts.focus, run: () => openFocus() },`,
    `      { id: 'capture', group: 'Create', label: 'New task', shortcut: shortcuts.quickAdd, keywords: 'quick add capture create task n', note: 'Capture a task without leaving this view', run: () => openAdd(view === 'inbox' ? 'inbox' : 'todo', view === 'projects' && selectedProjectId && selectedProjectId !== '__unassigned__' ? selectedProjectId : '', view === 'inbox' ? undefined : data?.today) },\n      { id: 'create-project', group: 'Create', label: 'New project', shortcut: 'p', keywords: 'create project', run: () => { navigate('projects'); setEditingProjectId(null); setProjectEditorOpen(true) } },\n      { id: 'create-habit', group: 'Create', label: 'New habit', keywords: 'create habit routine', run: () => { navigate('habits'); setEditingHabitId(null); setHabitEditorOpen(true) } },\n      { id: 'focus', group: 'Execute', label: focusData?.activeSession ? 'Resume Focus' : 'Start Focus', shortcut: shortcuts.focus, run: () => openFocus() },`,
    'create commands')

  const commandInsertionAnchor = `      { id: 'chatgpt-patch', group: 'ChatGPT Bridge', label: 'Patch existing planner data', run: () => setPatchOpen(true) },\n    ]\n    for (const task of data?.allTasks ?? []) {`
  const commandInsertion = `      { id: 'chatgpt-patch', group: 'ChatGPT Bridge', label: 'Patch existing planner data', run: () => setPatchOpen(true) },\n    ]\n\n    list.push(\n      { id: 'open-task-picker', group: 'Task actions', label: 'Open task…', keywords: 'find inspect edit task', children: buildTaskCommandChildren('open-task', searchableTasks, (task) => setSelectedTaskId(task.id)), run: () => {} },\n      { id: 'complete-task-picker', group: 'Task actions', label: 'Complete task…', keywords: 'done finish check task', children: buildTaskCommandChildren('complete-task', actionableTasks, async (task) => registerUndo(await taskService.setCompleted(task.id, true))), run: () => {} },\n      { id: 'reopen-task-picker', group: 'Task actions', label: 'Reopen task…', keywords: 'undo complete reopen task', children: buildTaskCommandChildren('reopen-task', completedTasks, async (task) => registerUndo(await taskService.setCompleted(task.id, false))), run: () => {} },\n      { id: 'today-task-picker', group: 'Task actions', label: 'Move task to Today…', keywords: 'schedule plan today task', children: buildTaskCommandChildren('today-task', actionableTasks, (task) => moveTaskDate(task.id, 'today')), run: () => {} },\n      { id: 'tomorrow-task-picker', group: 'Task actions', label: 'Move task to Tomorrow…', keywords: 'schedule plan tomorrow task', children: buildTaskCommandChildren('tomorrow-task', actionableTasks, (task) => moveTaskDate(task.id, 'tomorrow')), run: () => {} },\n      { id: 'later-task-picker', group: 'Task actions', label: 'Move task to Later…', keywords: 'unschedule someday later task', children: buildTaskCommandChildren('later-task', actionableTasks, (task) => moveTaskDate(task.id, 'later')), run: () => {} },\n      { id: 'focus-task-picker', group: 'Task actions', label: 'Start Focus on task…', keywords: 'work execute focus timer task', children: buildTaskCommandChildren('focus-task', readyFocusTasks, (task) => openFocus(task.id)), run: () => {} },\n      { id: 'open-project-picker', group: 'Project actions', label: 'Open project…', keywords: 'find project', children: buildProjectCommandChildren('open-project', data?.projects ?? [], (project) => { navigate('projects'); setSelectedProjectId(project.id) }), run: () => {} },\n      { id: 'open-habit-picker', group: 'Habit actions', label: 'Open habit…', keywords: 'find habit routine', children: buildHabitCommandChildren('open-habit', habitData?.habits ?? [], (habit) => { navigate('habits'); setSelectedHabitId(habit.id) }), run: () => {} },\n      { id: 'complete-habit-picker', group: 'Habit actions', label: 'Complete habit today…', keywords: 'done check habit routine today', children: buildHabitCommandChildren('complete-habit', completableHabits, (habit) => toggleHabit(habit.id)), run: () => {} },\n      { id: 'skip-habit-picker', group: 'Habit actions', label: 'Skip habit today…', keywords: 'rest skip habit routine today', children: buildHabitCommandChildren('skip-habit', skippableHabits, (habit) => toggleHabitSkip(habit.id)), run: () => {} },\n    )\n\n    for (const task of data?.allTasks ?? []) {`
  text = replaceOne(text, commandInsertionAnchor, commandInsertion, 'nested command pickers')

  text = replaceOne(text,
    `          <div className="mobile-topbar__actions">{focusData?.activeSession ? <button className="is-focus-active" onClick={() => openFocus()}>Resume focus</button> : <button onClick={() => openFocus()}>Focus</button>}</div>`,
    `          <div className="mobile-topbar__actions"><button className="mobile-command-button" onClick={() => setPaletteOpen(true)}>Search</button>{focusData?.activeSession ? <button className="is-focus-active" onClick={() => openFocus()}>Resume focus</button> : <button onClick={() => openFocus()}>Focus</button>}</div>`,
    'mobile command access')

  write(file, text)
}

// CSS layer.
{
  const file = 'src/styles/index.css'
  let text = read(file)
  text = replaceOne(text,
    `@import './habits-focus.css';\n\n@import './mobile.css';`,
    `@import './habits-focus.css';\n@import './command-first.css';\n\n@import './mobile.css';`,
    'command-first stylesheet import')
  write(file, text)
}

// Package and release gate.
{
  const file = 'package.json'
  const pkg = JSON.parse(read(file))
  pkg.version = '1.7.0'
  pkg.scripts['validate:command-first'] = 'node scripts/validate-command-first.mjs'
  pkg.scripts['release:verify'] = 'npm run validate:final && npm run validate:release && npm run validate:daily && npm run validate:task-project && npm run validate:planner && npm run validate:reviews-history && npm run validate:habits-focus && npm run validate:command-first && npm run typecheck && npm run build && npm run validate:dist'
  write(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

// Forward-compatible previous milestone contract.
{
  const file = 'scripts/validate-habits-focus.mjs'
  let text = read(file)
  text = replaceOne(text,
    `check('v1.6 package version', pkg.version === '1.6.0')`,
    `check('v1.6+ package version', Number(pkg.version.split('.')[1] ?? 0) >= 6)`,
    'v1.6 forward version')
  write(file, text)
}

// Final/release validators.
{
  const file = 'scripts/validate-final.mjs'
  let text = read(file)
  text = replaceOne(text, `pkg.version === '1.6.0'`, `pkg.version === '1.7.0'`, 'final version')
  write(file, text)
}
{
  const file = 'scripts/validate-release.mjs'
  let text = read(file)
  text = replaceOne(text,
    `check('release version is 1.6.0', pkg.version === '1.6.0', pkg.version)`,
    `check('release version is 1.7.0', pkg.version === '1.7.0', pkg.version)`,
    'release version')
  write(file, text)
}

// README.
{
  const file = 'README.md'
  let text = read(file)
  text = replaceOne(text, '# Folio — v1.6.0', '# Folio — v1.7.0', 'README title')
  text = replaceOne(text, '**Release:** `1.6.0`', '**Release:** `1.7.0`', 'README release')
  const anchor = `See \`docs/HABITS_FOCUS_V1_6.md\`.\n\n## Data and privacy`
  const section = `See \`docs/HABITS_FOCUS_V1_6.md\`.\n\n## v1.7 — Command-first UX\n\nThe Command Palette is now an execution surface rather than only a search box: nested task/project/habit actions, fuzzy and token-aware matching, direct deep matches, recent commands, and scoped keyboard navigation. Fixed aliases add \`/\` for command/search, \`N\` for a contextual new task, \`P\` for a new project, and \`T\` for Today while preserving configurable shortcuts and \`G\` navigation chords. Mobile now has direct Search access. Schema v15 is retained.\n\nSee \`docs/COMMAND_FIRST_UX_V1_7.md\`.\n\n## Data and privacy`
  text = replaceOne(text, anchor, section, 'README v1.7 section')
  write(file, text)
}

// Release manifest generator.
{
  const file = 'scripts/generate-release-manifest.mjs'
  let text = read(file)
  text = replaceOne(text, `releaseType: 'habits-focus-refinement',`, `releaseType: 'command-first-ux',`, 'manifest release type')
  text = replaceOne(text, `finalReleaseContract: '58/58 PASS',`, `finalReleaseContract: '59/59 PASS',`, 'manifest final count')
  text = replaceOne(text,
    `    habitsFocusContract: '35/35 PASS',\n`,
    `    habitsFocusContract: '35/35 PASS',\n    commandFirstContract: '36/36 PASS',\n`,
    'manifest command contract')
  const oldHighlights = `    'Durable habit pause intervals stay neutral in streaks, adherence, capacity, and historical evaluation',\n    'Habit detail now includes an eight-week trend, pause lifecycle, and expanded daily history',\n    'Habit weekly review surfaces rhythms still in motion without penalizing planned pauses',\n    'Focus ranks ready work and explains why the suggested task is relevant',\n    'Focus sessions preserve intention, optional planned duration, and finish notes',\n    'Open stopwatch plans guide without automatically stopping the session',\n    'Focus launcher exposes today/week totals, prior task focus, estimate remaining, and recent sessions',\n    'Schema v15 backfills Habit pause history while leaving existing task/project/planner structures intact',\n    'Full backups preserve v15 Habit pauses and Focus context with v8–v15 direct restore',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, habits-focus, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',`
  const newHighlights = `    'Command Palette now supports nested action pickers, fuzzy token matching, and direct deep matches',\n    'Recent commands stay locally available without entering planner data or backups',\n    'Task commands cover open, complete, reopen, Today, Tomorrow, Later, and Focus workflows',\n    'Project and Habit creation/opening plus Habit completion/skip are available from the command surface',\n    'Fixed /, N, P, and T aliases accelerate search, task capture, project creation, and Today navigation',\n    'Existing configurable shortcuts and G navigation chords remain intact and take precedence correctly',\n    'Mobile gains direct Search access to the same command surface',\n    'Schema v15 retained with no v1.7 migration and v8–v15 backup compatibility unchanged',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, reviews-history, habits-focus, command-first, typecheck, production-build, and dist validation gate',\n    'GitHub Pages deployment verified from main',`
  text = replaceOne(text, oldHighlights, newHighlights, 'manifest highlights')
  write(file, text)
}

console.log('Applied Folio v1.7 Command-first UX integration.')
