import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const checks = []
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const app = read('src/app/App.tsx')
const data = read('src/hooks/useAppData.ts')
const today = read('src/features/today/TodayView.tsx')
const cssIndex = read('src/styles/index.css')
const database = read('src/db/database.ts')

check('v1.2 package version', pkg.version === '1.2.0')
check('daily workflow validator registered', pkg.scripts?.['validate:daily'] === 'node scripts/validate-daily-workflow.mjs')
check('release gate runs daily workflow validation', pkg.scripts?.['release:verify']?.includes('validate:daily'))
check('v12 data model retained', /DATABASE_SCHEMA_VERSION\s*=\s*12\b/.test(database))
check('Next horizon exposed', data.includes('nextTasks: nextTasks.map(preview)'))
check('Later horizon exposed', data.includes('laterTasks: laterTasks.map(preview)'))
check('Top 3 workflow rendered', today.includes('title="Top 3"') && today.includes('Daily priorities'))
check('carryover resolution rendered', today.includes('carryover-resolver') && today.includes('Resolve before adding more'))
check('Today Next Later triage rendered', today.includes('title="Next / Later"') && today.includes('Triage horizon'))
check('focus-now surface rendered', today.includes('title="Focus now"') && today.includes('Suggested next action'))
check('end-of-day wrap-up rendered', today.includes('title="End-of-day wrap-up"') && today.includes('Move unfinished to tomorrow'))
check('per-day wrap-up persistence wired', app.includes('daily.wrapup.${data?.today ?? localDateKey()}') && app.includes('saveDailyWrapUp'))
check('roll-forward is undoable', app.includes('rollForwardToday') && app.includes('combineUndo'))
check('Daily Workflow stylesheet loaded', cssIndex.includes("@import './daily-workflow.css';"))
check('daily workflow release doc exists', fs.existsSync(path.join(root, 'docs/DAILY_WORKFLOW_V1_2.md')))
check('generated compiler artifacts absent', [
  'tsconfig.app.tsbuildinfo',
  'tsconfig.node.tsbuildinfo',
  'vite.config.js',
  'vite.config.d.ts',
].every((file) => !fs.existsSync(path.join(root, file))))

const failures = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`)
console.log(`\n${checks.length - failures.length}/${checks.length} daily-workflow checks passed.`)
if (failures.length) process.exit(1)
