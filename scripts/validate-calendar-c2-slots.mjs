/** C2 deterministic Folio schedule suggestions — actual Node assertions. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'folio-slots-c2-'))
try{
 const paths=[
  ['src/domain/date.ts','date.mjs',[]],
  ['src/features/planner/calendarLogic.ts','logic.mjs',[['../../domain/date','./date.mjs']]],
  ['src/features/planner/calendarMultiSessionC3.ts','multi.mjs',[
   ['../../domain/date','./date.mjs'],['./calendarLogic','./logic.mjs'],['./calendarSlotSuggestionsC2','./slots.mjs']]],
  ['src/features/planner/calendarSlotSuggestionsC2.ts','slots.mjs',[
   ['../../domain/date','./date.mjs'],['./calendarLogic','./logic.mjs']]],
 ]
 for(const [from,to,rewrites] of paths){
  let source=fs.readFileSync(path.join(process.cwd(),from),'utf8')
  for(const [key,replacement] of rewrites)source=source.replaceAll(key,replacement)
  fs.writeFileSync(path.join(folder,to),ts.transpileModule(source,{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
 }
 const {suggestFreeCalendarSlots:find}=await import(pathToFileURL(path.join(folder,'slots.mjs')).href)
 const {atTimeInZone:at}=await import(pathToFileURL(path.join(folder,'date.mjs')).href)
 const {planMultiDayTaskC3:multi}=await import(pathToFileURL(path.join(folder,'multi.mjs')).href)
 const assert=(condition,reason)=>{if(!condition)throw Error(reason)}
 const zone='Europe/Berlin'
 const base={from:'2026-10-16',through:'2026-10-19',timeZone:zone,
  minutes:60,dailyStart:9*60,dailyEnd:12*60,limit:5}
 const make=(id,date,start,end,allDay=false)=>({id,kind:'event',title:id,source:'folio',
  allDay,start:at(date,start,zone),end:at(date,end,zone),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
 const blocks=[make('lecture','2026-10-16',540,600),make('meeting','2026-10-16',600,660)]
 let slots=find(blocks,base)
 assert(slots[0]?.date==='2026-10-16'&&slots[0].startMinute===660,'Busy appointments did not move proposal to 11:00.')
 slots=find(blocks,{...base,deadline:'2026-10-16'})
 assert(slots.length===1&&slots[0].date==='2026-10-16','Hard deadline not respected.')
 slots=find([make('all','2026-10-16',0,1380,true)],base)
 assert(slots[0]?.date==='2026-10-17','All-day block not respected.')
 slots=find(blocks,{...base,afterIso:'2026-10-16T10:30:00+02:00'})
 assert(slots.every(p=>new Date(p.start).getTime()>=new Date('2026-10-16T10:30:00+02:00').getTime()),'Past time proposed.')
 slots=find(blocks,{...base,dailyStart:12*60,dailyEnd:11*60})
 assert(!slots.length,'Impossible daily hours generated a session.')
 slots=find(blocks,{...base,minutes:120,dailyEnd:12*60,deadline:'2026-10-16'})
 assert(!slots.length,'Calendar suggested a session spanning busy work.')
 console.log('C2_SLOTS_PASS conflicts, deadline, all-day, future time, invalid hours and duration')
 const task={id:'task-a',title:'Study',status:'todo',estimatedMinutes:180,
  updatedAt:'2026-10-16T00:00:00Z',deadline:'2026-10-20'}
 const options={from:'2026-10-17',days:7,sessionMinutes:60,sessionsPerDay:1,
  dailyStart:9*60,dailyEnd:12*60,timeZone:zone}
 let plan=multi(task,[make('imported','2026-10-17',540,600)],options)
 assert(plan.slots.length===3&&plan.slots[0].startMinute===600,'Busy imported source ignored in batch plan.')
 assert(new Set(plan.slots.map(s=>s.date)).size===3,'One-per-day capacity not respected.')
 assert(plan.uncoveredMinutes===0&&plan.allocatedMinutes===180,'Batch total did not match real task estimate.')
 plan=multi({...task,deadline:'2026-10-17'},[make('all-day','2026-10-17',0,1380,true)],options)
 assert(!plan.slots.length&&plan.uncoveredMinutes===180,'Deadline/all-day guard ignored.')
 plan=multi({...task,estimatedMinutes:520},[],{...options,days:7,sessionMinutes:30,sessionsPerDay:1})
 assert(plan.slots.length===4,'Deadline or session cap was not enforced.')
 assert(plan.uncoveredMinutes===400,'Partial coverage falsely claimed to complete task.')
 plan=multi({...task,estimatedMinutes:200},[],{...options,sessionMinutes:60,sessionsPerDay:2})
 assert(plan.slots.length===4&&plan.allocatedMinutes===200,'Repeated slots or short final session incorrect.')
 assert(new Set(plan.slots.map(s=>s.start)).size===4,'Multi-day session overlap created.')
 console.log('C3_BATCH_PASS deadline, imported collisions, per-day limits, partial coverage and repeated sessions')
}catch(error){console.error('C2_SLOTS_FAIL',error);process.exitCode=1}
finally{fs.rmSync(folder,{recursive:true,force:true})}
