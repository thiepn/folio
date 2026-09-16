import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, content) { fs.writeFileSync(path, content) }
function replaceOnce(path, oldValue, newValue) {
  const text = read(path)
  const count = text.split(oldValue).length - 1
  if (count !== 1) throw new Error(`${path}: expected 1 exact match, found ${count}`)
  write(path, text.replace(oldValue, newValue))
}

replaceOnce(
  'src/features/today/TodayView.tsx',
  "import { useEffect, useMemo, useState } from 'react'",
  "import { useEffect, useMemo, useState, type ReactNode } from 'react'",
)
replaceOnce('src/features/today/TodayView.tsx', 'actions: React.ReactNode', 'actions: ReactNode')

replaceOnce(
  'src/styles/index.css',
  "@import './views.css';\n\n@import './mobile.css';",
  "@import './views.css';\n@import './daily-workflow.css';\n\n@import './mobile.css';",
)

let app = read('src/app/App.tsx')
const shortcutAnchor = "  const storedShortcuts = useLiveQuery(() => settingsRepository.get<unknown>('power.shortcuts', DEFAULT_SHORTCUTS), [], DEFAULT_SHORTCUTS)\n  const shortcuts = useMemo<ShortcutMap>(() => normalizeShortcutMap(storedShortcuts), [storedShortcuts])"
const shortcutReplacement = "  const storedShortcuts = useLiveQuery(() => settingsRepository.get<unknown>('power.shortcuts', DEFAULT_SHORTCUTS), [], DEFAULT_SHORTCUTS)\n  const dailyWrapUpKey = `daily.wrapup.${data?.today ?? localDateKey()}`\n  const dailyWrapUp = useLiveQuery(() => settingsRepository.get<string>(dailyWrapUpKey, ''), [dailyWrapUpKey], '') ?? ''\n  const shortcuts = useMemo<ShortcutMap>(() => normalizeShortcutMap(storedShortcuts), [storedShortcuts])"
if (!app.includes(shortcutAnchor)) throw new Error('App: wrap-up hook anchor missing')
app = app.replace(shortcutAnchor, shortcutReplacement)

const actionAnchor = `  async function commitTodayPlan() {
    registerUndo(await dailyPlanningService.commit(data?.today ?? localDateKey()))
  }

  function navigate(next: NavView) {`
const actionReplacement = `  async function commitTodayPlan() {
    registerUndo(await dailyPlanningService.commit(data?.today ?? localDateKey()))
  }

  async function saveDailyWrapUp(note: string) {
    await settingsRepository.set(dailyWrapUpKey, note.trim())
  }

  async function rollForwardToday() {
    const actions: UndoableMutation[] = []
    for (const task of data?.todayTasks ?? []) {
      if (!task.completed) actions.push(await dailyPlanningService.moveToDate(task.id, 'tomorrow', data?.today ?? localDateKey()))
    }
    if (actions.length) registerUndo(combineUndo(`${actions.length} unfinished task${actions.length === 1 ? '' : 's'} moved to tomorrow`, actions))
  }

  function navigate(next: NavView) {`
if (!app.includes(actionAnchor)) throw new Error('App: daily actions anchor missing')
app = app.replace(actionAnchor, actionReplacement)

const todayPattern = /          \{view === 'today' \? <TodayView[^\n]+\/> : null\}/
const todayReplacement = `          {view === 'today' ? <TodayView
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
          /> : null}`
if (!todayPattern.test(app)) throw new Error('App: TodayView render anchor missing')
app = app.replace(todayPattern, todayReplacement)
write('src/app/App.tsx', app)

const pkg = JSON.parse(read('package.json'))
pkg.version = '1.2.0'
pkg.scripts['validate:daily'] = 'node scripts/validate-daily-workflow.mjs'
pkg.scripts['release:verify'] = 'npm run validate:final && npm run validate:release && npm run validate:daily && npm run typecheck && npm run build && npm run validate:dist'
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

replaceOnce('scripts/validate-final.mjs', "pkg.version === '1.1.1'", "pkg.version === '1.2.0'")
replaceOnce(
  'scripts/validate-release.mjs',
  "check('patch release version is 1.1.1', pkg.version === '1.1.1', pkg.version)",
  "check('release version is 1.2.0', pkg.version === '1.2.0', pkg.version)",
)

write('scripts/validate-daily-workflow.mjs', `import fs from 'node:fs'\nimport path from 'node:path'\n\nconst root = process.cwd()\nconst read = (p) => fs.readFileSync(path.join(root, p), 'utf8')\nconst checks = []\nconst check = (name, ok) => checks.push({ name, ok: Boolean(ok) })\n\nconst pkg = JSON.parse(read('package.json'))\nconst app = read('src/app/App.tsx')\nconst data = read('src/hooks/useAppData.ts')\nconst today = read('src/features/today/TodayView.tsx')\nconst cssIndex = read('src/styles/index.css')\nconst database = read('src/db/database.ts')\n\ncheck('v1.2 package version', pkg.version === '1.2.0')\ncheck('daily workflow validator registered', pkg.scripts?.['validate:daily'] === 'node scripts/validate-daily-workflow.mjs')\ncheck('release gate runs daily workflow validation', pkg.scripts?.['release:verify']?.includes('validate:daily'))\ncheck('v12 data model retained', /DATABASE_SCHEMA_VERSION\\s*=\\s*12\\b/.test(database))\ncheck('Next horizon exposed', data.includes('nextTasks: nextTasks.map(preview)'))\ncheck('Later horizon exposed', data.includes('laterTasks: laterTasks.map(preview)'))\ncheck('Top 3 workflow rendered', today.includes('title=\\"Top 3\\"') && today.includes('Daily priorities'))\ncheck('carryover resolution rendered', today.includes('carryover-resolver') && today.includes('Resolve before adding more'))\ncheck('Today Next Later triage rendered', today.includes('title=\\"Next / Later\\"') && today.includes('Triage horizon'))\ncheck('focus-now surface rendered', today.includes('title=\\"Focus now\\"') && today.includes('Suggested next action'))\ncheck('end-of-day wrap-up rendered', today.includes('title=\\"End-of-day wrap-up\\"') && today.includes('Move unfinished to tomorrow'))\ncheck('per-day wrap-up persistence wired', app.includes('daily.wrapup.\\${data?.today ?? localDateKey()}') && app.includes('saveDailyWrapUp'))\ncheck('roll-forward is undoable', app.includes('rollForwardToday') && app.includes('combineUndo'))\ncheck('Daily Workflow stylesheet loaded', cssIndex.includes(\"@import './daily-workflow.css';\"))\ncheck('daily workflow release doc exists', fs.existsSync(path.join(root, 'docs/DAILY_WORKFLOW_V1_2.md')))\n\nconst failures = checks.filter((item) => !item.ok)\nfor (const item of checks) console.log(\\`\\${item.ok ? 'PASS' : 'FAIL'}  \\${item.name}\\`)\nconsole.log(\\`\\n\\${checks.length - failures.length}/\\${checks.length} daily-workflow checks passed.\\`)\nif (failures.length) process.exit(1)\n`)

write('docs/DAILY_WORKFLOW_V1_2.md', `# Folio v1.2 — Daily Workflow\n\nFolio v1.2 makes **Today** the primary operating surface rather than another list view.\n\n## Product contract\n\nThe daily page answers four questions in order:\n\n1. **What carried over?** Resolve overdue work explicitly instead of silently accumulating it.\n2. **What matters today?** The first three Must tasks form a visible Top 3; other work remains secondary.\n3. **What should I do now?** Active Focus is surfaced first, otherwise Folio suggests the next unblocked priority.\n4. **How do I close the day?** A small wrap-up records what moved forward and can roll unfinished work to tomorrow.\n\n## Workflow surfaces\n\n- **Carryover resolver:** Today / Tomorrow / Later / Done actions for overdue tasks.\n- **Top 3:** derived from the ordered Must bucket; no duplicate priority model is introduced.\n- **Today:** the remaining planned work, with existing planning roles and task controls intact.\n- **Next:** tomorrow's tasks.\n- **Later:** unscheduled open tasks.\n- **Focus now:** resumes an active session or suggests the next unblocked priority.\n- **Habits:** remains part of the daily operating loop.\n- **Capacity + schedule:** retains the existing planning/capacity engine.\n- **End-of-day wrap-up:** task/habit/focus summary, per-day note, and undoable roll-forward.\n\n## Persistence and compatibility\n\nNo IndexedDB migration is required. Folio remains on schema **v12**. Top 3 reuses DailyPlanItem.bucket = must; Next/Later reuse task planning dates; wrap-up notes use the existing settings table under daily.wrapup.<YYYY-MM-DD>.\n\nThis avoids parallel representations of the same planning concepts and preserves all v1.1.1 backups and legacy migration behavior.\n`)

let readme = read('README.md')
readme = readme.replace('# Folio — v1.1.1', '# Folio — v1.2.0')
readme = readme.replace('**Release:** `1.1.1`', '**Release:** `1.2.0`')
const marker = '## Data and privacy\n'
const section = `## v1.2 — Daily Workflow\n\nToday is now Folio's daily operating surface: explicit carryover resolution, a protected Top 3, Today/Next/Later triage, current Focus context, habits and capacity in one hierarchy, plus an end-of-day wrap-up with undoable roll-forward. The release intentionally reuses the v12 planning model rather than introducing duplicate priority or triage state.\n\nSee \\`docs/DAILY_WORKFLOW_V1_2.md\\`.\n\n`
if (!readme.includes('## v1.2 — Daily Workflow')) {
  if (!readme.includes(marker)) throw new Error('README: Data marker missing')
  readme = readme.replace(marker, section + marker)
}
write('README.md', readme)
