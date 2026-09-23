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
const engine=read('src/features/smartViews/queryEngine.ts')
const cases=read('src/features/smartViews/queryEngineCases.ts')
const service=read('src/services/savedViewService.ts')
const appData=read('src/hooks/useAppData.ts')
const organization=read('src/features/organization/OrganizationView.tsx')
const editor=read('src/features/smartViews/SmartViewEditorModal.tsx')
const workspace=read('src/features/smartViews/SmartViewWorkspace.tsx')
const sidebar=read('src/components/layout/Sidebar.tsx')
const app=read('src/app/App.tsx')
const planner=read('src/features/planner/AdvancedPlanningView.tsx')
const plannerData=read('src/hooks/useAdvancedPlanningData.ts')
const advanced=read('src/features/planner/advancedPlanning.ts')
const reminders=read('src/repositories/reminderRepository.ts')
const styles=read('src/styles/index.css')

check('D6 validator registered',pkg.scripts?.['validate:smart-views-v2']==='node scripts/validate-smart-views-v2.mjs')
check('release gate runs D6 validation',pkg.scripts?.['release:verify']?.includes('validate:smart-views-v2'))
check('D6 remains schema-compatible',Number(database.match(/DATABASE_SCHEMA_VERSION\\s*=\\s*(\\d+)/)?.[1]??0)>=19&&database.includes('this.version(19)'))

check('query engine supports nested groups',engine.includes("type: 'group'")&&engine.includes("operator: SmartLogic")&&engine.includes('children: SmartFilterNode[]'))
check('query engine supports AND OR NOT',engine.includes("node.operator === 'and'")&&engine.includes('node.negated'))
check('query engine exposes requested fields',['text','status','priority','project','list','section','tag','planned','deadline','recurring','readiness','estimate','reminder','pinned','completion'].every((field)=>engine.includes("'"+field+"'")))
check('query engine supports descendant tags',engine.includes('includeDescendants')&&engine.includes('runtime.tagScope'))
check('query engine supports relative date predicates',engine.includes("condition.operator === 'today'")&&engine.includes("condition.operator === 'within-next'")&&engine.includes("condition.operator === 'overdue'"))
check('query engine supports reminder states',engine.includes("expected === 'configured'")&&engine.includes("expected === 'due'")&&engine.includes("expected === 'snoozed'")&&engine.includes("expected === 'outstanding'"))
check('query engine supports readiness',engine.includes('taskBlocked(task, runtime)'))
check('query engine supports numeric ranges',engine.includes("condition.operator === 'between'")&&engine.includes("typeof from === 'number'"))
check('query engine supports multi-sort',engine.includes('for(const rule of rules)'))
check('missing sort values stay last in both directions',engine.includes('function compareOptional')&&engine.includes('if(a===undefined)return 1'))
check('query engine supports root/all depth scope',engine.includes("view.scope==='root'")&&engine.includes('task.parentTaskId'))
check('query engine caches dependency tag reminder context',engine.includes('interface SmartRuntime')&&engine.includes('prepareRuntime(context)'))
check('multiple Smart Views share one prepared runtime',engine.includes('export function runSmartViews')&&engine.includes('const runtime=prepareRuntime(context)'))
check('reminder query state ignores disabled definitions',engine.includes('enabledReminderIds')&&engine.includes('enabledReminderIds.has(occurrence.reminderId)'))

check('built-ins use canonical query definitions',engine.includes('BUILTIN_SMART_VIEWS')&&engine.includes("id:'builtin-blocked'")&&engine.includes("id:'builtin-reminders'"))
check('legacy Saved Views migrate in place',service.includes("const KEY = 'planning.savedViews'")&&service.includes('migrateLegacy'))
check('legacy Today remains dynamic',service.includes("legacyCondition('planned','today')"))
check('legacy next windows remain relative',service.includes("legacyCondition('planned','within-next',7)")&&service.includes("legacyCondition('deadline','within-next',30)"))
check('legacy ready blocked state migrates',service.includes("legacyCondition('readiness','is','ready')")&&service.includes("legacyCondition('readiness','is','blocked')"))
check('legacy overdue filters remain open-task only',service.includes("legacyCondition('planned','overdue')")&&service.includes("legacyCondition('deadline','overdue')")&&service.includes("legacyCondition('status','is','todo')"))
check('restored operators are field-compatible',service.includes('SMART_FIELD_OPERATORS[field]')&&service.includes('compatibleOperators.includes(requestedOperator)'))
check('normalized migrated views are written back',service.includes('serializedRaw !== serializedNormalized')&&service.includes('settingsRepository.set(KEY, normalized)'))
check('saved views have bounded complexity',service.includes('MAX_VIEWS = 50')&&service.includes('MAX_NODES = 64')&&service.includes('MAX_DEPTH = 5'))
check('saved view duplicate names are rejected',service.includes('A smart view with that name already exists.'))
check('saved views support duplicate and pin',service.includes('async duplicate(')&&service.includes('async duplicateDefinition(')&&service.includes('async togglePin('))

check('app data computes live smart view results',appData.includes('runSmartViews(smartViews, smartContext)')&&appData.includes('smartViewResults'))
check('app data includes reminders in query context',appData.includes('reminderRepository.listDefinitions()')&&appData.includes('reminderRepository.listAllOccurrences()'))
check('app data exposes pinned smart views',appData.includes('pinnedSmartViews'))
check('reminder repository exposes occurrence snapshot',reminders.includes('async listAllOccurrences()'))

check('Lists workspace uses Smart View gallery',organization.includes('<SmartViewGallery'))
check('Lists workspace opens Smart View workspace',organization.includes('<SmartViewWorkspace'))
check('Lists workspace uses recursive editor',organization.includes('<SmartViewEditorModal'))
check('D5 hard-coded smart buttons removed',!organization.includes('organization-smart')&&!organization.includes('smartTasks('))
check('Smart View editor supports nested groups',editor.includes('QueryGroupEditor')&&editor.includes('Add group')&&editor.includes('NOT this group'))
check('Smart View editor supports child-tag toggle',editor.includes('include child tags'))
check('Smart View editor supports multi-sort',editor.includes('Add sort')&&editor.includes('draft.sort.map'))
check('Smart View editor supports root/all scope',editor.includes('Root + nested tasks'))
check('Smart View workspace exposes duplicate edit delete pin',workspace.includes('Duplicate')&&workspace.includes('Edit')&&workspace.includes('Delete')&&workspace.includes('Unpin'))
check('Smart View workspace preserves query-engine order',organization.includes('(result?.taskIds??[]).map'))
check('sidebar surfaces pinned Smart Views',sidebar.includes('pinnedSmartViews')&&sidebar.includes('Smart Views'))
check('command palette searches Smart Views',app.includes("group: 'Smart View'")&&app.includes("setSelectedListId('__smart__:' + smartView.id)"))
check('topbar renders Smart View context',app.includes("selectedListId.startsWith('__smart__:')")&&app.includes('data.smartViewResults'))

check('legacy Planner Saved Views editor removed',!planner.includes('SavedViewsPanel')&&!planner.includes('BUILTIN_SAVED_VIEWS')&&!planner.includes('Saved views'))
check('forecast hook no longer reads planning.savedViews',!plannerData.includes('planning.savedViews'))
check('dead legacy Saved View engine removed',!advanced.includes('SavedTaskView')&&!advanced.includes('filterTasksForSavedView')&&!advanced.includes('BUILTIN_SAVED_VIEWS'))

check('D6 stylesheet loaded',styles.includes("@import './smart-views-v2.css';"))
check('D6 documentation exists',exists('docs/SMART_VIEWS_V2_D6.md'))

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'folio-smart-views-'))
try{
  const options={compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}
  const transpile=(source)=>ts.transpileModule(source,options).outputText
  fs.writeFileSync(path.join(temp,'date.mjs'),transpile(read('src/domain/date.ts')),'utf8')
  fs.writeFileSync(path.join(temp,'dependencyLogic.mjs'),transpile(read('src/features/planner/dependencyLogic.ts')),'utf8')
  const engineSource=engine
    .replace("../../domain/date","./date.mjs")
    .replace("../planner/dependencyLogic","./dependencyLogic.mjs")
  fs.writeFileSync(path.join(temp,'queryEngine.mjs'),transpile(engineSource),'utf8')
  const casesSource=cases.replace("./queryEngine","./queryEngine.mjs")
  fs.writeFileSync(path.join(temp,'cases.mjs'),transpile(casesSource),'utf8')
  const runtime=await import(pathToFileURL(path.join(temp,'cases.mjs')).href+'?v='+Date.now())
  const failures=runtime.validateSmartViewCases()
  check('actual D6 query-engine case matrix passes',Array.isArray(failures)&&failures.length===0)
  if(failures.length) console.log('Smart View case failures:',failures)
}catch(error){
  console.log('Smart View runtime validation error:',error)
  check('actual D6 query-engine case matrix passes',false)
}finally{
  fs.rmSync(temp,{recursive:true,force:true})
}

const failures=checks.filter((item)=>!item.ok)
for(const item of checks) console.log((item.ok?'PASS':'FAIL')+'  '+item.name)
console.log('\n'+(checks.length-failures.length)+'/'+checks.length+' D6 Smart View checks passed.')
if(failures.length) process.exit(1)
