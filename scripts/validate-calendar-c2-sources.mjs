/** Source ownership is independent of visibility or calendar availability. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'folio-calendar-source-c2-'))
try{
 const file='src/features/planner/calendarSourceGroupsC2.ts'
 const js=ts.transpileModule(fs.readFileSync(path.join(process.cwd(),file),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
 fs.writeFileSync(path.join(folder,'groups.mjs'),js)
 const {calendarSourceGroups,calendarSourceIdentity,visibleCalendarBlocks}=await import(pathToFileURL(path.join(folder,'groups.mjs')).href)
 const samples=[
  {id:'1',kind:'task',source:'folio',title:'Study'},
  {id:'2',kind:'event',source:'folio',title:'Meeting'},
  {id:'3',kind:'event',source:'ics',sourceCalendar:'private.ics',title:'Import'},
  {id:'4',kind:'event',source:'klips',sourceCalendar:'klips:uni-a',title:'Lecture'},
  {id:'5',kind:'event',source:'google',sourceCalendar:'gcal:primary',title:'Google meeting'},
  {id:'6',kind:'event',source:'klips',sourceCalendar:'klips:uni-a',title:'Lecture 2'},
  {id:'7',kind:'event',source:'klips',sourceCalendar:'klips:uni-b',title:'Seminar'}
 ]
 const groups=calendarSourceGroups(samples)
 const assert=(x,m)=>{if(!x)throw Error(m)}
 assert(groups.length===6,'Provider-owned subcalendars collapsed')
 assert(groups.find(g=>g.key==='klips:klips:uni-a')?.count===2,'KLIPS source count incorrect')
 assert(groups.find(g=>g.key==='google:gcal:primary')?.description.includes('not active'),'Google mirror not honestly marked')
 assert(calendarSourceIdentity(samples[0])!=='folio:events','Folio task/event sources conflated')
 const before=JSON.stringify(samples)
 const hidden=new Set(['klips:klips:uni-a','google:gcal:primary'])
 const visible=visibleCalendarBlocks(samples,hidden)
 assert(visible.length===4&&visible.some(b=>b.source==='ics')&&visible.some(b=>b.source==='folio'),'Filtered wrong owners')
 assert(JSON.stringify(samples)===before,'View-only filtering mutated canonical owners')
 assert(visibleCalendarBlocks(samples,new Set()).length===samples.length,'Show-all did not restore full projection')
 console.log('C2_SOURCES_PASS independent origins, subcalendars, descriptive provenance and lossless filtering')
}catch(error){console.error('C2_SOURCES_FAIL',error);process.exitCode=1}
finally{fs.rmSync(folder,{recursive:true,force:true})}
