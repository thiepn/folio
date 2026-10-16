import { parseSubscribedIcs } from '../../services/calendarFeedC2'
import { normalizeGoogleEvent, pullGoogleDelta, googleEventKey, authorizeGoogleWrite, GoogleSyncTokenExpired } from '../../services/calendarGoogleC2'
import { planGoogleMerge, googleBlockHash, proposeGoogleCreate } from '../../services/calendarGoogleReconcileC2'

const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)}
const base=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:KLIPS Test',
'BEGIN:VEVENT','UID:lecture-1','SUMMARY:Linear Algebra',
'DTSTART;TZID=Europe/Berlin:20261012T090000','DTEND;TZID=Europe/Berlin:20261012T100000',
'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
'EXDATE;TZID=Europe/Berlin:20261014T090000','END:VEVENT',
'BEGIN:VEVENT','UID:lecture-1','RECURRENCE-ID;TZID=Europe/Berlin:20261019T090000',
'SUMMARY:Room change','DTSTART;TZID=Europe/Berlin:20261019T110000','DTEND;TZID=Europe/Berlin:20261019T120000','END:VEVENT',
'END:VCALENDAR'].join('\r\n')
export async function validateCalendarC2Cases():Promise<string[]> {
  const failures:string[]=[]
  async function check(label:string,run:()=>void|Promise<void>){
    try{await run()}catch(e){failures.push(label+': '+(e instanceof Error?e.message:String(e)))}
  }
  await check('Weekly recurrence, EXDATE, override',()=>{
    const r=parseSubscribedIcs(base,'2026-10-12','2026-10-22')
    assert(r.complete,'feed has unexpected warnings: '+r.warnings.join('; '))
    assert(r.events.length===3,'expected 3 occurrences, got '+r.events.length)
    assert(r.events.some(e=>e.summary==='Room change'&&e.start.includes('09:00:00.000Z')),'detached override wrong UTC time')
    assert(!r.events.some(e=>e.start.includes('2026-10-14')),'EXDATE was not excluded')
    assert(r.events.every(e=>e.sourceKey?.startsWith('lecture-1#')),'missing stable occurrence identities')
  })
  await check('Cancelled instance',()=>{
    const ics=base.replace('SUMMARY:Room change','STATUS:CANCELLED\r\nSUMMARY:Room change')
    const r=parseSubscribedIcs(ics,'2026-10-12','2026-10-22')
    assert(r.complete,'cancellation yielded warnings')
    assert(r.events.length===2,'cancelled instance not suppressed')
  })
  await check('Unsupported recurrence fails closed',()=>{
    const r=parseSubscribedIcs(base.replace('FREQ=WEEKLY','FREQ=MONTHLY'),'2026-10-12','2026-10-22')
    assert(!r.complete&&r.warnings.length>0,'monthly recurrence silently accepted')
  })
  await check('DST shift retains local nine o clock',()=>{
    const ics=base.replace('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5','RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4')
      .replace('EXDATE;TZID=Europe/Berlin:20261014T090000','EXDATE;TZID=Europe/Berlin:20261014T090000')
    const r=parseSubscribedIcs(ics,'2026-10-12','2026-11-08')
    assert(r.complete,'DST feed warnings: '+r.warnings.join(';'))
    const before=r.events.find(e=>e.start.startsWith('2026-10-19')&&e.summary==='Linear Algebra')
    const after=r.events.find(e=>e.start.startsWith('2026-10-26'))
    assert(after?.start.endsWith('08:00:00.000Z'),'after DST event not 09:00 CET')
    assert(!before,'detached override should suppress 2026-10-19 master')
  })
  await check('Google multi-page cursor commit and provenance',async()=>{
    const calls:Array<{syncToken?:string;pageToken?:string}>=[]
    const result=await pullGoogleDelta({list:async input=>{
      calls.push(input)
      if(!input.pageToken)return {items:[{id:'a',etag:'"1"',start:{dateTime:'2026-10-16T09:00:00+02:00'},end:{dateTime:'2026-10-16T10:00:00+02:00'}}],nextPageToken:'next'}
      return {items:[{id:'b',status:'cancelled'}],nextSyncToken:'cursor-1'}
    }},'primary','old')
    assert(result.mode==='incremental'&&result.nextSyncToken==='cursor-1'&&result.events.length===2,'invalid Google multi-page delta')
    assert(calls.length===2&&calls.every(c=>c.syncToken==='old'),'sync parameters drift')
    const block=normalizeGoogleEvent('primary',result.events[0])
    assert(block?.source==='google'&&block.sourceUid===googleEventKey('primary','a'),'Google source identity lost')
    assert(normalizeGoogleEvent('primary',result.events[1])===null,'cancellation not projected')
  })
  await check('Google scope and ETag fail closed',()=>{
    const patch={operation:'update' as const,calendarId:'primary',eventId:'a',etag:'"1"',patch:{summary:'Meeting'}}
    let denied=false
    try{authorizeGoogleWrite(patch,{accountVerified:true,calendarEventsWriteGranted:false,selectedCalendarWritable:true,tokenSubjectMatches:true})}catch{denied=true}
    assert(denied,'Google patch allowed without write scope')
    const valid=authorizeGoogleWrite(patch,{accountVerified:true,calendarEventsWriteGranted:true,selectedCalendarWritable:true,tokenSubjectMatches:true})
    assert(valid.method==='PATCH'&&valid.ifMatch==='"1"','conditional write header lost')
  })
  await check('Expired Google cursor is surfaced',async()=>{
    let expired=false
    try{await pullGoogleDelta({list:async()=>{throw new GoogleSyncTokenExpired()}},'primary','old')}catch(e){expired=e instanceof GoogleSyncTokenExpired}
    assert(expired,'410 token recovery signal lost')
  })
  await check('Google full snapshot and incremental conflicts',()=>{
    const remote={id:'key-a',etag:'"etag-1"',status:'confirmed' as const,summary:'Lecture',start:{dateTime:'2026-10-16T09:00:00+02:00'},end:{dateTime:'2026-10-16T10:00:00+02:00'}}
    const full=planGoogleMerge({calendarId:'primary',mode:'full',events:[remote],nextSyncToken:'s1'},[],{})
    assert(full.actions.length===1&&full.actions[0].kind==='insert','Google full sync did not plan one insert')
    const value=normalizeGoogleEvent('primary',remote)!
    const existing={...value,id:'local-1'}
    const baseline={[googleEventKey('primary',remote.id)]:{blockId:'local-1',etag:'"etag-1"',valueHash:googleBlockHash(existing)}}
    const update={...remote,etag:'"etag-2"',summary:'Changed'}
    const incremental=planGoogleMerge({calendarId:'primary',mode:'incremental',events:[update],nextSyncToken:'s2'},[existing],baseline)
    assert(incremental.actions[0].kind==='update','Remote update not planned')
    const pending=planGoogleMerge({calendarId:'primary',mode:'incremental',events:[update],nextSyncToken:'s2'},[existing],baseline,new Set([googleEventKey('primary',remote.id)]))
    assert(pending.actions[0].kind==='conflict','Pending local write was overwritten')
    const deleted=planGoogleMerge({calendarId:'primary',mode:'full',events:[],nextSyncToken:'s3'},[existing],baseline)
    assert(deleted.actions[0].kind==='delete','Full sync did not detect removed event')
  })
  await check('Google outbound create keeps original Folio authority',()=>{
    const original={id:'folio-1',source:'folio' as const,kind:'event' as const,title:'Personal event',
      start:'2026-10-16T07:00:00.000Z',end:'2026-10-16T08:00:00.000Z',
      createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'}
    const intent=proposeGoogleCreate(original,'primary','calendar-c2-unique-12345')
    assert(intent.event.summary==='Personal event'&&intent.operation==='create','Outbound create intent invalid')
    assert(original.source==='folio'&&original.id==='folio-1','Original Folio event mutated')
  })
  return failures
}
