import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const original=fs.readFileSync(new URL('../src/services/faithDisciplineReview.ts',import.meta.url),'utf8')
const output=ts.transpileModule(original,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
})
assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0)
const { faithDisciplineWeek } = await import('data:text/javascript;base64,'+
  Buffer.from(output.outputText).toString('base64'))
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
