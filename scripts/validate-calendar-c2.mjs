/** Focused C2 runnable protocol/parser qualification without backend credentials. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const root=process.cwd()
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'folio-c2-'))
const transpile=(s)=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
try {
  const files=[
    ['src/domain/date.ts','date.mjs',[]],
    ['src/features/interop/icsLogic.ts','ics.mjs',[["../../domain/date","./date.mjs"]]],
    ['src/services/calendarFeedC2.ts','feed.mjs',[["../domain/date","./date.mjs"],["../features/interop/icsLogic","./ics.mjs"]]],
    ['src/services/calendarGoogleC2.ts','google.mjs',[["../domain/date","./date.mjs"]]],
    ['src/features/planner/calendarC2Cases.ts','cases.mjs',[["../services/calendarFeedC2","./feed.mjs"],["../services/calendarGoogleC2","./google.mjs"]]],
  ]
  for(const [file,name,replacements] of files){
    let source=read(file)
    for(const [from,to] of replacements)source=source.replace(from,to)
    fs.writeFileSync(path.join(temp,name),transpile(source),'utf8')
  }
  const mod=await import(pathToFileURL(path.join(temp,'cases.mjs')).href)
  const failures=await mod.validateCalendarC2Cases()
  for(const failure of failures)console.error('FAIL '+failure)
  console.log(failures.length?'C2_PROTOCOL_FAIL':'C2_PROTOCOL_PASS')
  if(failures.length)process.exitCode=1
}catch(error){console.error('C2_PROTOCOL_FAIL',error);process.exitCode=1}
finally{fs.rmSync(temp,{recursive:true,force:true})}
