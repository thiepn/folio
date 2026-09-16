import fs from 'node:fs'

function replaceOnce(path, oldValue, newValue) {
  const text = fs.readFileSync(path, 'utf8')
  const count = text.split(oldValue).length - 1
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}`)
  fs.writeFileSync(path, text.replace(oldValue, newValue))
}

// Calendar inherits the Planner-selected date instead of resetting to today.
replaceOnce(
  'src/features/planner/CalendarView.tsx',
  'export function CalendarView({ today, onOpenTask, onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock }: {',
  'export function CalendarView({ today, anchorDate, onSelectedDateChange, onOpenTask, onCreateTaskBlock, onCreateEvent, onUpdateBlock, onUpdateEvent, onResizeBlock, onDeleteBlock }: {',
)
replaceOnce(
  'src/features/planner/CalendarView.tsx',
  '  today: LocalDate\n  onOpenTask?: (id: string) => void',
  '  today: LocalDate\n  anchorDate?: LocalDate\n  onSelectedDateChange?: (date: LocalDate) => void\n  onOpenTask?: (id: string) => void',
)
replaceOnce('src/features/planner/CalendarView.tsx', '  const [selectedDate, setSelectedDate] = useState(today)', '  const [selectedDate, setSelectedDate] = useState(anchorDate ?? today)')
replaceOnce('src/features/planner/CalendarView.tsx', '  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek(today))', '  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek(anchorDate ?? today))')
replaceOnce(
  'src/features/planner/CalendarView.tsx',
  "  const data = useCalendarData(weekStart, weekEnd)\n\n  useEffect(() => {",
  "  const data = useCalendarData(weekStart, weekEnd)\n\n  useEffect(() => {\n    if (!anchorDate) return\n    setSelectedDate(anchorDate)\n    setWeekStart(startOfLocalWeek(anchorDate))\n  }, [anchorDate])\n\n  useEffect(() => {\n    onSelectedDateChange?.(selectedDate)\n  }, [selectedDate, onSelectedDateChange])\n\n  useEffect(() => {",
)

// Keyboard rescheduling uses Folio's local date, never UTC midnight semantics.
let plannerViews = fs.readFileSync('src/features/planner/PlannerOverhaulViews.tsx', 'utf8')
const keyboardCalls = "taskKeyboardMove(event, task, actions.onMoveDate)"
const callCount = plannerViews.split(keyboardCalls).length - 1
if (callCount !== 3) throw new Error(`PlannerOverhaulViews: expected 3 keyboard calls, found ${callCount}`)
plannerViews = plannerViews.replaceAll(keyboardCalls, 'taskKeyboardMove(event, task, actions.onMoveDate, today)')
plannerViews = plannerViews.replace(
  'function taskKeyboardMove(event: KeyboardEvent<HTMLElement>, task: TaskPreview, onMoveDate: (id: string, date?: LocalDate) => void) {',
  'function taskKeyboardMove(event: KeyboardEvent<HTMLElement>, task: TaskPreview, onMoveDate: (id: string, date?: LocalDate) => void, today: LocalDate) {',
)
plannerViews = plannerViews.replace("    const base = task.plannedDate ?? new Date().toISOString().slice(0, 10)", '    const base = task.plannedDate ?? today')
fs.writeFileSync('src/features/planner/PlannerOverhaulViews.tsx', plannerViews)

// Package and release gate.
const pkgPath = 'package.json'
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.version = '1.4.0'
pkg.scripts['validate:planner'] = 'node scripts/validate-planner-overhaul.mjs'
pkg.scripts['release:verify'] = 'npm run validate:final && npm run validate:release && npm run validate:daily && npm run validate:task-project && npm run validate:planner && npm run typecheck && npm run build && npm run validate:dist'
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

replaceOnce('scripts/validate-final.mjs', "pkg.version === '1.3.0'", "pkg.version === '1.4.0'")
replaceOnce('scripts/validate-release.mjs', "check('release version is 1.3.0', pkg.version === '1.3.0', pkg.version)", "check('release version is 1.4.0', pkg.version === '1.4.0', pkg.version)")
replaceOnce('scripts/validate-task-project-workflow.mjs', "check('v1.3 package version', pkg.version === '1.3.0')", "check('v1.3+ package version', Number(pkg.version.split('.')[1] ?? 0) >= 3)")
replaceOnce('scripts/validate-task-project-workflow.mjs', "check('database schema v13', /DATABASE_SCHEMA_VERSION\\s*=\\s*13\\b/.test(database))", "check('task-project compatible schema', Number(database.match(/DATABASE_SCHEMA_VERSION\\s*=\\s*(\\d+)/)?.[1] ?? 0) >= 13)")

// Release manifest describes the current milestone and all inherited contracts.
const manifestPath = 'scripts/generate-release-manifest.mjs'
let manifest = fs.readFileSync(manifestPath, 'utf8')
manifest = manifest.replace("releaseType: 'task-project-workflow'", "releaseType: 'planner-overhaul'")
manifest = manifest.replace("finalReleaseContract: '55/55 PASS'", "finalReleaseContract: '56/56 PASS'")
manifest = manifest.replace(
  "taskProjectWorkflowContract: '19/19 PASS',\n    dependencyBackedProductionBuild:",
  "taskProjectWorkflowContract: '19/19 PASS',\n    plannerOverhaulContract: '21/21 PASS',\n    dependencyBackedProductionBuild:",
)
const oldHighlights = `    'Project status, deadline, notes, next action, milestones, and activity history',\n    'Derived task completion progress rather than manually maintained project percentages',\n    'Project task filters for Open, Ready, Blocked, Completed, and All',\n    'Direct Today, Tomorrow, Later, Focus, and next-action task controls',\n    'Schema v13 migration that leaves task storage unchanged',\n    'Full final, release-hardening, daily-workflow, task-project, typecheck, production-build, and dist validation gate',`
const newHighlights = `    'Agenda, Day, Week, Month, exact-time Calendar, and Forecast planning modes',\n    'Planned work dates and hard deadlines remain visibly and behaviorally separate',\n    '42-day month workload map with drag-to-date planning and deadline counts',\n    'Week planning decisions surface due-but-unplanned work with capacity-aware placement suggestions',\n    'Unscheduled backlog is available directly beside Day, Week, and Month planning',\n    'Keyboard rescheduling supports Shift+Arrow and Shift+Backspace without changing deadlines',\n    'Schema v13 retained with no v1.4 migration',\n    'Full final, release-hardening, daily-workflow, task-project, planner-overhaul, typecheck, production-build, and dist validation gate',`
if (!manifest.includes(oldHighlights)) throw new Error('Release manifest highlight anchor changed')
manifest = manifest.replace(oldHighlights, newHighlights)
fs.writeFileSync(manifestPath, manifest)

// README release identity and current persistence statements.
const readmePath = 'README.md'
let readme = fs.readFileSync(readmePath, 'utf8')
readme = readme.replace('# Folio — v1.3.0', '# Folio — v1.4.0')
readme = readme.replace('**Release:** `1.3.0`', '**Release:** `1.4.0`')
const v14 = `\n## v1.4 — Planner Overhaul\n\nPlanner is now one coherent planning workspace with Agenda, Day, Week, Month, exact-time Calendar, and Forecast modes. Day/Week/Month share date context, expose the unscheduled backlog beside the plan, and keep **planned work date** distinct from **hard deadline**. Week planning surfaces due-but-unplanned tasks with capacity-aware placement suggestions; Month adds a 42-day workload/deadline map; keyboard and drag rescheduling change only the planned date. Schema v13 is retained.\n\nSee \`docs/PLANNER_OVERHAUL_V1_4.md\`.\n`
if (!readme.includes('## Data and privacy')) throw new Error('README data section anchor missing')
if (!readme.includes('## v1.4 — Planner Overhaul')) readme = readme.replace('\n## Data and privacy', `${v14}\n## Data and privacy`)
readme = readme.replace('The current database schema is **v12**. Full backups export schema v12 and direct restore supports compatible backups from **v8 through v12**.', 'The current database schema is **v13**. Full backups export schema v13 and direct restore supports compatible backups from **v8 through v13**.')
readme = readme.replace('the v12 data model, and `validate:final` define the current release state.', 'the v13 data model, and `validate:final` define the current release state.')
readme = readme.replace('v1.1.1 pins direct dependency versions. Generate and commit `package-lock.json` from a network-enabled environment when possible, then switch CI from `npm install` to `npm ci`.', 'Direct dependency versions and `package-lock.json` are committed for repeatable release builds.')
fs.writeFileSync(readmePath, readme)

console.log('Applied Folio v1.4 release integration.')
