import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const transpile = (relative) => {
  const original=fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8')
  const result=ts.transpileModule(original,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  })
  assert.equal(result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0)
  return result.outputText
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'folio-fd1-'))
const domain=path.join(temp,'domain'),services=path.join(temp,'services')
fs.mkdirSync(domain,{recursive:true}); fs.mkdirSync(services,{recursive:true})
fs.writeFileSync(path.join(domain,'date.mjs'),transpile('src/domain/date.ts'))
fs.writeFileSync(path.join(services,'faithDisciplineReview.mjs'),
  transpile('src/services/faithDisciplineReview.ts').replace("from '../domain/date'", "from '../domain/date.mjs'"))
const { faithDisciplineWeek } = await import(pathToFileURL(path.join(services,'faithDisciplineReview.mjs')).href)
const date='2026-10-12'
const habit={id:'owned-habit',title:'Prayer',archived:false}
const entries=[
  {id:'entry-1',habitId:'owned-habit',date,status:'completed'},
  {id:'entry-2',habitId:'owned-habit',date:'2026-10-13',status:'skipped'},
  {id:'entry-3',habitId:'unselected',date,status:'completed'},
]
const sessions=[
  {id:'focus-1',status:'finished',tags:['faith-discipline'],startedAt:'2026-10-13T12:00:00Z',durationSeconds:900,interruptionCount:1},
  {id:'focus-2',status:'finished',tags:[],startedAt:'2026-10-13T12:00:00Z',durationSeconds:2000,interruptionCount:0},
  {id:'focus-3',status:'cancelled',tags:['faith-discipline'],startedAt:'2026-10-13T12:00:00Z',durationSeconds:800,interruptionCount:1},
]
const blocks=[
  {id:'owner-event',start:'2026-10-13T09:00:00Z',end:'2026-10-13T09:30:00Z',source:'folio'},
  {id:'remote-event',start:'2026-10-13T09:00:00Z',end:'2026-10-13T09:30:00Z',source:'klips'},
]
const actual=faithDisciplineWeek(date,'2026-10-18',['owned-habit'],
  ['owner-event','remote-event'],[habit],entries,sessions,blocks)
assert.deepEqual(actual.practices,[{id:'owned-habit',title:'Prayer',completedDays:1,restDays:1}])
assert.deepEqual(actual.focus,{sessions:1,seconds:900,interruptions:1})
assert.equal(actual.scheduledBlocks,1)
assert.throws(()=>faithDisciplineWeek(date,'2026-11-18',[],[],[],[],[],[]),/valid week/)
assert.throws(()=>faithDisciplineWeek(date,'2026-10-18',['x','x'],[],[],[],[],[]),/Duplicate/)
console.log('PASS FD1: owner IDs, explicit entries, neutral rest, tagged focus, read-only external blocks')

fs.writeFileSync(path.join(services,'disciplineCommandGate.mjs'),
  transpile('src/services/disciplineCommandGate.ts'))
const {validateDisciplineCommand,executeReviewedDisciplineCommand} =
  await import(pathToFileURL(path.join(services,'disciplineCommandGate.mjs')).href)
const command={idempotencyKey:'0123456789abcdef0123456789abcdef',
  operation:'habit.complete',resourceId:'original-habit-id',
  expectedUpdatedAt:'2026-10-16T10:00:00.000Z'}
assert.equal(validateDisciplineCommand({...command,resourceId:'../other-owner'}),null)
let writes=0
const denied=await executeReviewedDisciplineCommand(command,{
  approve:async()=>false,readUpdatedAt:async()=>command.expectedUpdatedAt,
  originalServiceAction:async()=>{writes++;return 'applied'}
})
assert.equal(denied.result,'denied');assert.equal(writes,0)
const conflict=await executeReviewedDisciplineCommand(command,{
  approve:async()=>true,readUpdatedAt:async()=>new Date().toISOString(),
  originalServiceAction:async()=>{writes++;return 'applied'}
})
assert.equal(conflict.result,'conflict');assert.equal(writes,0)
console.log('PASS FD1: owner command denial and stale original-record CAS')

// Verify the real same-origin Folio bridge without opening any user records.
fs.writeFileSync(path.join(services,'fake-folio-db.mjs'),`
const tables={
 tasks:[{id:'original-t1',title:'Study',status:'todo',plannedDate:'2026-10-16',priority:'high'}],
 timeBlocks:[{id:'original-b1',title:'Prayer',start:'2099-01-01T08:00:00.000Z',end:'2099-01-01T08:30:00.000Z'}],
 notes:[{id:'original-n1',title:'Title only',body:'PRIVATE_JOURNAL_BODY',archived:false,updatedAt:'2026-10-16T10:00:00.000Z'}],
 habits:[{id:'original-h1',title:'Practice',target:1,archived:false,sortOrder:1}],
}
const wrap=(key)=>({toArray:async()=>tables[key]})
export const db={
 tasks:wrap('tasks'),timeBlocks:wrap('timeBlocks'),notes:wrap('notes'),
 habits:wrap('habits'),
 habitEntries:{where:()=>({equals:()=>({toArray:async()=>[{habitId:'original-h1',value:1,status:'completed'}]})})},
 transaction:async(...args)=>args.at(-1)(),
}
`)
fs.writeFileSync(path.join(services,'fake-folio-date.mjs'),
  'export const localDateKey=()=>"2026-10-16"')
const source=transpile('src/services/folioHubDailyShare.ts')
  .replace("from '../db/database'","from './fake-folio-db.mjs'")
  .replace("from '../domain/date'","from './fake-folio-date.mjs'")
fs.writeFileSync(path.join(services,'folioHubDailyShare.mjs'),source)
const bridge=await import(pathToFileURL(path.join(services,'folioHubDailyShare.mjs')).href)
const nonce='0123456789abcdef0123456789abcdef'
assert.equal(bridge.parseHubShareNonce('?hubBridge='+nonce,'https://thiepn.dev',true),nonce)
assert.equal(bridge.parseHubShareNonce('?hubBridge='+nonce,'https://evil.example',true),null)
assert.equal(bridge.parseHubShareNonce('?hubBridge='+nonce,'https://thiepn.dev',false),null)
const sourceSnapshot=await bridge.readFolioHubDailyShare()
assert.equal(sourceSnapshot.schema,'thiepn:folio-hub-daily')
assert.equal(sourceSnapshot.habits[0].id,'original-h1')
assert.equal(JSON.stringify(sourceSnapshot).includes('PRIVATE_JOURNAL_BODY'),false)
console.log('PASS FD1: original-source Folio summary, same-origin nonce and no note-body leak')

fs.rmSync(temp,{recursive:true,force:true})
