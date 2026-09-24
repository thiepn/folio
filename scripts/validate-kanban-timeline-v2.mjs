import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root=process.cwd()
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const exists=(p)=>fs.existsSync(path.join(root,p))
const checks=[]
const check=(name,ok)=>checks.push({name,ok:Boolean(ok)})

const pkg=JSON.parse(read('package.json'))
const database=read('src/db/database.ts')
const models=read('src/domain/models.ts')
const schemas=read('src/domain/schemas.ts')
const migration=read('src/migrations/v19ToV20.ts')
const taskRepo=read('src/repositories/taskRepository.ts')
const timelineService=read('src/services/timelineService.ts')
const boardService=read('src/services/boardService.ts')
const recurrence=read('src/services/recurrenceService.ts')
const app=read('src/app/App.tsx')
const inspector=read('src/features/tasks/TaskInspector.tsx')
const kanban=read('src/features/boards/KanbanBoard.tsx')
const timeline=read('src/features/boards/TimelineView.tsx')
const logic=read('src/features/boards/boardTimelineLogic.ts')
const cases=read('src/features/boards/boardTimelineLogicCases.ts')
const organization=read('src/features/organization/OrganizationView.tsx')
const project=read('src/features/projects/ProjectDetailView.tsx')
const smart=read('src/features/smartViews/SmartViewWorkspace.tsx')
const backupSchemas=read('src/services/backupSchemas.ts')
const backup=read('src/services/backupService.ts')
const importSchema=read('src/features/import/importSchema.ts')
const importService=read('src/services/importService.ts')
const patchSchema=read('src/features/patch/patchSchema.ts')
const patchService=read('src/services/patchService.ts')
const interop=read('src/features/interop/InteroperabilityModal.tsx')
const styles=read('src/styles/index.css')

check('D8 validator registered',pkg.scripts?.['validate:kanban-timeline-v2']==='node scripts/validate-kanban-timeline-v2.mjs')
check('release gate runs D8 validation',pkg.scripts?.['release:verify']?.includes('validate:kanban-timeline-v2'))

check('current schema preserves v20 timeline migration',Number(database.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1]??0)>=20&&database.includes('this.version(20)'))
check('v19 to v20 migration registered',database.includes('migrateV19ToV20')&&exists('src/migrations/v19ToV20.ts'))
check('timeline indexes are present',database.includes('timelineStart,timelineEnd'))
check('v20 migration normalizes milestone state',migration.includes('timelineMilestone = Boolean'))

check('TaskEntity has dedicated timeline span',models.includes('timelineStart?: LocalDate')&&models.includes('timelineEnd?: LocalDate')&&models.includes('timelineMilestone: boolean'))
check('recurrence exceptions support occurrence-local timeline span',models.includes('timelineStart?: LocalDate | null')&&models.includes('timelineMilestone?: boolean'))
check('task create schema accepts timeline span',schemas.includes('timelineStart: localDate.optional()')&&schemas.includes('timelineMilestone: z.boolean().default(false)'))
check('task update schema can clear timeline span',schemas.includes('timelineStart: localDate.nullable().optional()')&&schemas.includes('timelineEnd: localDate.nullable().optional()'))

check('task repository stores timeline fields',taskRepo.includes('timelineStart: parsed.timelineStart')&&taskRepo.includes('timelineMilestone: parsed.timelineMilestone'))
check('task repository validates end requires start',taskRepo.includes('Timeline end requires a timeline start.'))
check('task repository validates chronological spans',taskRepo.includes('Timeline end must not be before timeline start.'))
check('task repository validates single-day milestones',taskRepo.includes('Timeline milestones use one date.'))

check('timeline service is undoable',timelineService.includes('undo: async () =>')&&timelineService.includes('taskRepository.replace(before)'))
check('timeline service persists recurring exceptions',timelineService.includes('recurrenceService.recordOccurrenceException'))
check('timeline service supports set/clear/shift/resize', ['async setSpan','async clear','async shift','async resizeStart','async resizeEnd'].every((token)=>timelineService.includes(token)))
check('timeline service supports milestone toggle',timelineService.includes('async toggleMilestone'))
check('timeline service uses shared tested span logic',timelineService.includes('normalizeTimelineSpan')&&timelineService.includes('shiftTimelineSpan'))

check('recurrence materialization can apply timeline exceptions',recurrence.includes("hasOwn(exception, 'timelineStart')")&&recurrence.includes('timelineMilestone: exception.timelineMilestone ?? false'))
check('recurrence override persistence includes timeline fields',recurrence.includes("hasOwnProperty.call(changes, 'timelineStart')")&&recurrence.includes('current.timelineMilestone'))
check('App diffing recognizes timeline fields',app.includes("has('timelineStart')")&&app.includes("has('timelineEnd')")&&app.includes("has('timelineMilestone')"))
check('timeline remains occurrence-local in scoped recurring edits',app.includes('occurrenceChanges.timelineStart')&&!app.includes('template.timelineStart'))

check('task inspector edits timeline start/end',inspector.includes('<span>Timeline start</span>')&&inspector.includes('<span>Timeline end</span>'))
check('task inspector edits timeline milestone',inspector.includes('Timeline milestone')&&inspector.includes('timelineMilestone'))
check('task inspector save payload preserves timeline fields',inspector.includes('timelineStart: timelineStart || null')&&inspector.includes('timelineMilestone: timelineStart ? timelineMilestone : false'))

check('Kanban has section status priority list project columns',["'section'","'status'","'priority'","'list'","'project'"].every((token)=>kanban.includes(token)))
check('Kanban list sections are custom columns',kanban.includes("mode==='section'")&&kanban.includes('onAddColumn'))
check('Kanban supports task drag/drop',kanban.includes("setData('kanban/task-id'")&&kanban.includes('onDropTask'))
check('Kanban exposes WIP counts',kanban.includes("open ·")&&kanban.includes('total'))
check('Kanban supports independent sorting',kanban.includes('KanbanSortMode')&&kanban.includes('sortBoardTasks'))
check('Kanban supports swimlanes',kanban.includes('KanbanSwimlaneMode')&&kanban.includes('buildSwimlanes')&&kanban.includes('kanban-swimlane'))
check('board mutations are canonical and undoable',boardService.includes('organizationService.moveTask')&&boardService.includes('taskService.update')&&boardService.includes('taskService.setCompleted'))

check('Timeline supports day week month zoom',['Day','Week','Month'].every((token)=>timeline.includes('>'+token+'<')))
check('Timeline has unscheduled backlog',timeline.includes('timeline-backlog')&&timeline.includes('Unscheduled'))
check('Timeline supports drag placement',timeline.includes("setData('timeline/task-id'")&&timeline.includes('dropBacklog'))
check('Timeline supports whole-span drag',timeline.includes('beginMove')&&timeline.includes('shift'))
check('Timeline supports both resize edges',timeline.includes("beginResize(e,'start')")&&timeline.includes("beginResize(e,'end')"))
check('Timeline renders task milestones',timeline.includes('timeline-task-milestone'))
check('Timeline renders hard deadlines separately',timeline.includes('timeline-deadline-marker'))
check('Timeline renders project milestone lane',timeline.includes('timeline-project-milestone'))
check('Timeline renders Today line',timeline.includes('timeline-today-line'))
check('Timeline renders dependency connectors',timeline.includes('DependencyOverlay')&&timeline.includes('timeline-dependency-overlay'))
check('Timeline uses shared tested span math',timeline.includes('normalizeTimelineSpan')&&timeline.includes('timelineIntersects')&&timeline.includes('timelineDayOffset'))

check('Lists expose List Board Timeline tabs',organization.includes("{value:'list',label:'List'}")&&organization.includes("{value:'board',label:'Board'}")&&organization.includes("{value:'timeline',label:'Timeline'}"))
check('list section board can create columns',organization.includes("onAddColumn={list?(name)=>onCreateSection(list.id,name):undefined}"))
check('tag boards can group by status priority list project',organization.includes("allowedModes={list?['section','priority','status']:['status','priority','list','project']}"))
check('Smart Views expose Board and Timeline',smart.includes("<KanbanBoard")&&smart.includes("<TimelineView"))
check('Projects expose Board and Timeline tabs',project.includes("{ value: 'board', label: 'Board' }")&&project.includes("{ value: 'timeline', label: 'Timeline' }"))
check('project timeline passes milestone markers',project.includes('project?.milestones')&&project.includes('completed:Boolean(milestone.completedAt)'))
check('App routes board mutations through undo',app.includes('boardService.moveTask')&&app.includes('registerUndo'))
check('App routes timeline mutations through undo',app.includes('timelineService.setSpan')&&app.includes('timelineService.clear'))

check('backup schema preserves task timeline span',backupSchemas.includes('timelineStart: localDate.optional()')&&backupSchemas.includes('timelineMilestone: z.boolean().default(false)'))
check('backup schema preserves recurrence timeline exceptions',backupSchemas.includes('timelineStart: localDate.nullable().optional()')&&backupSchemas.includes('timelineMilestone: z.boolean().optional()'))
check('legacy backups normalize v20 timeline defaults',backup.includes('upgradeBackupTimelineV20')&&backup.includes('timelineMilestone = Boolean'))
check('backup restore validates timeline spans',backup.includes('has a timeline end without a start')&&backup.includes('has an invalid timeline span'))
check('import runtime schema accepts timeline fields',importSchema.includes('timelineStart: localDate.optional()')&&importSchema.includes('Timeline end requires a timeline start.'))
check('import execution preserves timeline fields',importService.includes('timelineStart: item.timelineStart')&&importService.includes('timelineMilestone: item.timelineMilestone'))
check('patch runtime schema accepts timeline fields',patchSchema.includes('timelineStart: localDate.nullable().optional()')&&patchSchema.includes('timelineMilestone: z.boolean().optional()'))
check('patch execution validates and preserves timeline fields',patchService.includes('const timelineStart')&&patchService.includes('Timeline end must not be before timeline start.'))
check('public backup v20 schema exists',exists('public/schema/folio-backup-v20.schema.json'))
check('public import schema advertises timeline fields',read('public/schema/folio-import-v1.schema.json').includes('"timelineStart"')&&read('public/schema/folio-import-v1.schema.json').includes('"timelineMilestone"'))
check('public patch schema advertises timeline fields',read('public/schema/folio-patch-v1.schema.json').includes('"timelineStart"')&&read('public/schema/folio-patch-v1.schema.json').includes('"timelineMilestone"'))
check('interop advertises v8 through v22 restore',interop.includes('Schema v22 · complete planner state + rich content + Habits V2')&&interop.includes('schema v8–v22'))

check('D8 stylesheet loaded',styles.includes("@import './boards-timeline-v2.css';"))
check('D8 documentation exists',exists('docs/KANBAN_TIMELINE_V2_D8.md'))

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'folio-board-timeline-'))
try{
  const options={compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}
  const transpile=(source)=>ts.transpileModule(source,options).outputText
  fs.writeFileSync(path.join(temp,'date.mjs'),transpile(read('src/domain/date.ts')),'utf8')
  const logicSource=logic.replace("../../domain/date","./date.mjs")
  fs.writeFileSync(path.join(temp,'boardTimelineLogic.mjs'),transpile(logicSource),'utf8')
  const casesSource=cases.replace("./boardTimelineLogic","./boardTimelineLogic.mjs")
  fs.writeFileSync(path.join(temp,'cases.mjs'),transpile(casesSource),'utf8')
  const runtime=await import(pathToFileURL(path.join(temp,'cases.mjs')).href+'?v='+Date.now())
  const failures=runtime.validateBoardTimelineCases()
  check('actual D8 board/timeline case matrix passes',Array.isArray(failures)&&failures.length===0)
  if(failures.length) console.log('D8 logic case failures:',failures)
}catch(error){
  console.log('D8 runtime validation error:',error)
  check('actual D8 board/timeline case matrix passes',false)
}finally{
  fs.rmSync(temp,{recursive:true,force:true})
}

const failures=checks.filter((item)=>!item.ok)
for(const item of checks) console.log((item.ok?'PASS':'FAIL')+'  '+item.name)
console.log('\n'+(checks.length-failures.length)+'/'+checks.length+' D8 Kanban/Timeline checks passed.')
if(failures.length) process.exit(1)
