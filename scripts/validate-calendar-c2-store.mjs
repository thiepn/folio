/** Exercisable Google mirror state-machine tests using a transaction-aware
 * in-memory repository substitute. No OAuth credentials or provider traffic. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'folio-calendar-c2-store-'))
const root=process.cwd()
function emit(file,name,replacements=[]){
  let source=fs.readFileSync(path.join(root,file),'utf8')
  for(const [from,to] of replacements)source=source.replaceAll(from,to)
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  fs.writeFileSync(path.join(temp,name),js)
}
const fakeDB=`const settings=new Map(),blocks=new Map()
const clone=()=>[new Map([...settings].map(([k,v])=>[k,structuredClone(v)])),
  new Map([...blocks].map(([k,v])=>[k,structuredClone(v)]))]
export const db={
 settings:{get:async id=>settings.get(id),put:async v=>{settings.set(v.key,structuredClone(v))}},
 timeBlocks:{get:async id=>blocks.get(id),toArray:async()=>[...blocks.values()].map(row=>structuredClone(row)),
   put:async v=>{blocks.set(v.id,structuredClone(v))},delete:async id=>{blocks.delete(id)}},
 transaction:async (...args)=>{const action=args.at(-1),before=clone()
   try{return await action()}catch(error){settings.clear();blocks.clear()
     for(const [key,v] of before[0])settings.set(key,v)
     for(const [key,v] of before[1])blocks.set(key,v)
     throw error
   }},
}
export const inspect=()=>({settings,blocks})
`
const assert=(value,message)=>{if(!value)throw Error(message)}
const example=(id='a',etag='"1"',title='Class')=>({
 id,etag,summary:title,status:'confirmed',start:{dateTime:'2026-10-16T09:00:00+02:00'},
 end:{dateTime:'2026-10-16T10:00:00+02:00'}
})
const run=async()=>{
  emit('src/domain/date.ts','date.mjs')
  emit('src/services/calendarGoogleC2.ts','google.mjs',[["../domain/date","./date.mjs"]])
  emit('src/services/calendarGoogleReconcileC2.ts','reconcile.mjs',[["../domain/date","./date.mjs"],["./calendarGoogleC2","./google.mjs"]])
  fs.writeFileSync(path.join(temp,'fake-db.mjs'),fakeDB)
  emit('src/services/calendarGoogleStoreC2.ts','store.mjs',[
    ["../db/database","./fake-db.mjs"],["./calendarGoogleC2","./google.mjs"],
    ["./calendarGoogleReconcileC2","./reconcile.mjs"]])
  const {calendarGoogleStoreC2:store}=await import(pathToFileURL(path.join(temp,'store.mjs')).href)
  const {inspect}=await import(pathToFileURL(path.join(temp,'fake-db.mjs')).href)
  const {googleEventKey}=await import(pathToFileURL(path.join(temp,'google.mjs')).href)
  const source='primary',key=googleEventKey(source,'a')
  const full=await store.prepare({calendarId:source,mode:'full',events:[example()],nextSyncToken:'c1'})
  let result=await store.apply(full)
  assert(result.created===1,'full sync did not create event')
  let rows=[...inspect().blocks.values()]
  assert(rows.length===1&&rows[0].title==='Class','first mirrored event missing')
  const blockId=rows[0].id
  assert((await store.status(source)).hasCursor,'cursor not committed with event')
  let invalid=false
  try{await store.apply(full)}catch{invalid=true}
  assert(invalid,'stale revision replay was not blocked')
  const next=await store.prepare({calendarId:source,mode:'incremental',
    events:[example('a','"2"','Class moved')],nextSyncToken:'c2'})
  result=await store.apply(next)
  rows=[...inspect().blocks.values()]
  assert(result.updated===1&&rows[0].id===blockId&&rows[0].title==='Class moved','stable block identity lost')
  const owned={...rows[0],title:'Locally altered'}
  inspect().blocks.set(owned.id,owned)
  const conflict=await store.prepare({calendarId:source,mode:'incremental',
    events:[example('a','"3"','Changed in Google')],nextSyncToken:'c3'})
  result=await store.apply(conflict)
  assert(result.conflicted===1,'divergent source not conflicted')
  assert((await store.conflicts(source)).length===1,'conflict candidate not retained')
  assert((await store.status(source)).hasCursor,'cursor lost on stored conflict')
  const resolution=await store.resolve(source,key,'keep-local-copy')
  assert(Boolean(resolution.copiedId),'local divergence not kept as Folio copy')
  rows=[...inspect().blocks.values()]
  assert(rows.length===2&&rows.some(b=>b.source==='folio'&&b.title==='Locally altered'),'Folio copy absent')
  assert(rows.some(b=>b.source==='google'&&b.title==='Changed in Google'),'provider event not accepted')
  assert((await store.conflicts(source)).length===0,'resolved conflict remains')
  const deleted=await store.prepare({calendarId:source,mode:'incremental',
    events:[{id:'a',status:'cancelled'}],nextSyncToken:'c4'})
  result=await store.apply(deleted)
  assert(result.removed===1,'provider cancellation did not remove mirror')
  assert([...inspect().blocks.values()].length===1,'cancellation deleted Folio-native copy')
  const native=[...inspect().blocks.values()][0]
  const intent=await store.queueCreate(native.id,source)
  assert(intent.operation==='create'&&(await store.pending(source)).length===1,'offline export not queued')
  await store.cancelPending(source,intent.clientMutationId)
  assert(!(await store.pending(source)).length,'pending intent not cancelled')
  const expired=await store.pull({list:async()=>{const {GoogleSyncTokenExpired}=await import(pathToFileURL(path.join(temp,'google.mjs')).href)
    throw new GoogleSyncTokenExpired()}},source)
  assert(expired.status==='needs-full-sync','410 recovery not marked')
  assert(!(await store.status(source)).hasCursor,'expired cursor was retained')
  const again=await store.prepare({calendarId:source,mode:'full',events:[example('b')],nextSyncToken:'c5'})
  await store.apply(again)
  assert((await store.status(source)).hasCursor,'full cursor not restored')
  console.log('C2_STORE_PASS atomic mirror apply/cursor, stable IDs, stale CAS, conflict copy, deletion, queued create, 410 recovery')
}
try{await run()}catch(error){console.error('C2_STORE_FAIL',error);process.exitCode=1}
finally{fs.rmSync(temp,{recursive:true,force:true})}
