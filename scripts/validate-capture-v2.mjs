import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const checks = []
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) })

const pkg = JSON.parse(read('package.json'))
const database = read('src/db/database.ts')
const parser = read('src/features/capture/parser.ts')
const cases = read('src/features/capture/parserCases.ts')
const modal = read('src/features/capture/QuickAddModal.tsx')
const service = read('src/services/captureService.ts')
const app = read('src/app/App.tsx')
const reminder = read('src/services/reminderService.ts')
const recurrence = read('src/services/recurrenceService.ts')
const taskSchema = read('src/domain/schemas.ts')
const styles = read('src/styles/index.css')

check('D4 validator registered', pkg.scripts?.['validate:capture-v2'] === 'node scripts/validate-capture-v2.mjs')
check('release gate runs D4 validation', pkg.scripts?.['release:verify']?.includes('validate:capture-v2'))
check('D4 intentionally retains schema v18', /DATABASE_SCHEMA_VERSION\s*=\s*18\b/.test(database) && !database.includes('this.version(19)'))

check('capture parser exposes tags', parser.includes('tags: string[]') && parser.includes("kind: 'tag'"))
check('capture parser exposes reminders', parser.includes('ParsedReminder') && parser.includes('reminders: ParsedReminder[]'))
check('capture parser exposes advanced recurrence fields', ['monthlyMode?: MonthlyRecurrenceMode','monthDays?: number[]','ordinal?: RecurrenceOrdinal','yearMonths?: number[]','afterCompletionUnit?: CompletionIntervalUnit'].every((token) => parser.includes(token)))
check('natural relative dates exist', parser.includes('day after tomorrow') && parser.includes('addLocalMonths(today, amount)') && parser.includes('startOfLocalWeek(today)'))
check('month-name date parsing exists', parser.includes('MONTH_WORDS') && parser.includes('upcomingMonthDate'))
check('planned date and deadline remain separate', parser.includes('Hard deadline: due Friday') && parser.includes('plannedDate = selected.date'))
check('12/24 hour parser exists', parser.includes("match[3] === 'pm'") && parser.includes("cleaned === 'noon'"))
check('time ranges infer duration', parser.includes('rangeRegex') && parser.includes('estimatedMinutes = Math.min(24 * 60, end - start)'))
check('natural duration parser supports decimal hours', parser.includes('\\d+(?:\\.\\d+)?') && parser.includes('Math.round(Number(match[1]) * 60)'))
check('priority parser supports p1-p3', parser.includes('p[123]') && parser.includes('priority critical'))
check('preferred project selector exists', parser.includes('project:') && parser.includes('~'))
check('legacy hashtag project remains supported', parser.includes('Legacy #Project remains supported'))
check('unmatched hashtags become tags', parser.includes("recognized.unshift({ kind: 'tag'"))
check('ambiguous projects are warned rather than guessed', parser.includes('ambiguous-project') && parser.includes('kept as a tag'))

check('weekly interval NLP exists', parser.includes('weeklyOn') && parser.includes("frequency: 'weekly'"))
check('monthly date-list NLP exists', parser.includes('monthlyDates') && parser.includes("monthlyMode: 'days'"))
check('monthly ordinal weekday NLP exists', parser.includes('monthlyOrdinal') && parser.includes("monthlyMode: 'ordinal-weekday'"))
check('monthly last-day NLP exists', parser.includes('monthlyLastDay') && parser.includes("monthlyMode: 'last-day'"))
check('yearly month/date NLP exists', parser.includes('yearlyDate') && parser.includes('yearMonths'))
check('completion-relative units map to D2', parser.includes("afterCompletionUnit") && parser.includes("unit.startsWith('month')"))
check('legacy recurrence syntax retained', parser.includes('afterLegacy') && parser.includes('after:'))
check('recurrence until/count retained', parser.includes('untilRegex') && parser.includes('recurrence.count'))

check('exact reminder phrase parser exists', parser.includes('Exact-date reminder') && parser.includes("kind: 'absolute'"))
check('deadline reminder phrase parser exists', parser.includes('before deadline') && parser.includes("taskDateField: 'deadline'"))
check('block-relative reminder phrase parser exists', parser.includes('beforeRegex') && parser.includes("kind: 'time-block'"))
check('planned-day reminder phrase parser exists', parser.includes('Planned-day clock reminder') && parser.includes("taskDateField: 'plannedDate'"))
check('invalid reminders are warned and removed', parser.includes('reminders = reminders.filter') && parser.includes("code: 'invalid-reminder'") && parser.includes('return false'))
check('inbox strips reminder scheduling', parser.includes('inbox-ignores-reminder') && parser.includes('reminders = []'))
check('recurring exact reminder ambiguity is surfaced', parser.includes('Exact-date reminders apply only to the first captured occurrence'))

check('batch parser splits independent lines', parser.includes('parseQuickCaptureBatch') && parser.includes("raw.split(/\\r?\\n/)") && parser.includes('.slice(0, 100)'))
check('Quick Add uses textarea for multiline capture', modal.includes('HTMLTextAreaElement') && modal.includes('<textarea') && modal.includes('Shift ↵'))
check('Quick Add shows batch interpretation', modal.includes('BatchLedger') && modal.includes('Multi-task capture'))
check('Quick Add structured details expose tags', modal.includes('<span>Tags</span>') && modal.includes('tagsText'))
check('Quick Add ledger exposes reminder count', modal.includes('label="Reminders"'))
check('Quick Add syntax explains preferred project selector', modal.includes('~Project') && modal.includes('Legacy'))
check('Quick Add uses D4 request object', modal.includes('CaptureCreateRequest') && modal.includes('requestFromParsed'))

check('capture service is canonical create pipeline', service.includes('createCapturedItem') && service.includes('createCapturedBatch'))
check('capture service creates recurring series through D2', service.includes('recurrenceService.create') && service.includes('rule: request.recurrence'))
check('capture service carries D1 tags into recurring template', service.includes('tags: request.input.tags ?? []'))
check('capture service creates time blocks', service.includes('timeBlockService.createTaskBlock'))
check('capture service creates D3 reminder definitions', service.includes('reminderService.create'))
check('series reminders use series owner', service.includes("ownerType = seriesId ? 'series' as const : 'task' as const"))
check('exact reminder uses first recurring occurrence only', service.includes('recurrenceRepository.listOccurrences(series.id)') && service.includes("item.kind === 'absolute'"))
check('absolute reminders use timezone-aware D2 helper', service.includes('atTimeInZone(reminder.date, reminder.minuteOfDay, timeZone)'))
check('recurring capture rejects deadline before occurrence', service.includes('deadline cannot be before its occurrence date'))
check('single capture rolls back partial creation', service.includes('await rollback(actions)') && service.includes('throw error'))
check('batch capture rolls back earlier items', service.includes('for (const request of requests) actions.push(await createCapturedItem(request))') && service.includes('await rollback(actions)'))

check('App no longer duplicates Quick Add creation logic', app.includes('createCapturedItem(request)') && app.includes('createCapturedBatch(requests)') && !app.includes('onCreate={async (input: TaskCreateInput'))
check('D4 composes with D3 reminder service', reminder.includes('async create(input: ReminderCreateInput)'))
check('D4 composes with D2 recurrence service', recurrence.includes('async create(input: RecurringSeriesCreateInput)'))
check('D4 writes tags accepted by task schema', taskSchema.includes('tags: taskTagsSchema'))

check('parser cases cover natural date/time', cases.includes('Doctor appointment Sep 30 at noon') && cases.includes('2pm-3:30pm'))
check('parser cases cover advanced recurrence', cases.includes('every 2 weeks on mon,wed') && cases.includes('every month on last friday'))
check('parser cases cover reminder phrases', cases.includes('remind 30m before') && cases.includes('before deadline at 09:00'))
check('parser cases cover project/tag split', cases.includes('Read paper #research ~Analysis'))
check('parser cases cover multiline batch', cases.includes("parseQuickCaptureBatch('Task one tomorrow"))

check('D4 stylesheet loaded', styles.includes("@import './capture-v2.css';"))
check('D4 design document exists', exists('docs/CAPTURE_ENGINE_V2_D4.md'))

// Execute the actual parser cases by transpiling the browser-independent TS modules.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-capture-'))
try {
  const options = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
  const transpile = (source) => ts.transpileModule(source, options).outputText
  const dateSource = read('src/domain/date.ts')
  fs.writeFileSync(path.join(temp, 'date.mjs'), transpile(dateSource), 'utf8')

  const parserSource = parser.replace("../../domain/date", "./date.mjs")
  fs.writeFileSync(path.join(temp, 'parser.mjs'), transpile(parserSource), 'utf8')

  const casesSource = cases.replace("./parser", "./parser.mjs")
  fs.writeFileSync(path.join(temp, 'cases.mjs'), transpile(casesSource), 'utf8')

  const runtime = await import(pathToFileURL(path.join(temp, 'cases.mjs')).href + `?v=${Date.now()}`)
  const failures = runtime.validateCaptureParserCases()
  check('actual D4 parser case matrix passes', Array.isArray(failures) && failures.length === 0)
  if (failures.length) console.log('Parser case failures:', failures)
} catch (error) {
  console.log('Parser runtime validation error:', error)
  check('actual D4 parser case matrix passes', false)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

const failures = checks.filter((item) => !item.ok)
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`)
console.log(`\n${checks.length - failures.length}/${checks.length} D4 capture checks passed.`)
if (failures.length) process.exit(1)
