/** Calendar C2: reconciliation against an authenticated Google gateway snapshot.
 * No tokens, Google access or private OAuth grants exist in this module.
 * The eventual gateway must verify Account identity, calendar-scoped consent,
 * provider event ownership, and If-Match itself.
 */
import type { TimeBlockEntity } from '../domain/models'
import { dateKeyInTimeZone } from '../domain/date'
import { googleEventKey, normalizeGoogleEvent, type GoogleDeltaC2, type GoogleEventC2 } from './calendarGoogleC2'

export interface GoogleBaselineC2 { blockId: string; etag: string; valueHash: string }
export type GoogleBaselinesC2 = Record<string, GoogleBaselineC2>
export type GoogleDeltaActionC2 =
  | {kind:'insert'|'update';key:string;value:TimeBlockEntity;etag:string}
  | {kind:'delete';key:string}
  | {kind:'unchanged';key:string}
  | {kind:'conflict';key:string;reason:string}
export interface GoogleMergePlanC2 {
  calendarId:string
  nextSyncToken:string
  fullSync:boolean
  actions:GoogleDeltaActionC2[]
}
export function googleBlockHash(block:TimeBlockEntity) {
  return JSON.stringify([block.title,block.description??'',block.location??'',block.start,block.end,
    Boolean(block.allDay),block.timeZone??'',block.source??'',block.sourceUid??'',block.sourceCalendar??''])
}
export function planGoogleMerge(
  delta:GoogleDeltaC2,
  existing:TimeBlockEntity[],
  baselines:GoogleBaselinesC2,
  pendingLocalWrites:ReadonlySet<string> = new Set(),
):GoogleMergePlanC2 {
  const source='gcal:'+encodeURIComponent(delta.calendarId)
  const owned=existing.filter(b=>b.source==='google'&&b.sourceCalendar===source)
  const currentByKey=new Map(owned.filter(b=>b.sourceUid).map(b=>[b.sourceUid!,b]))
  if(currentByKey.size!==owned.length)throw new Error('Duplicate or unidentified Google-owned event.')
  const actions:GoogleDeltaActionC2[]=[]
  const touched=new Set<string>()
  for(const remote of delta.events){
    const key=googleEventKey(delta.calendarId,remote.id)
    if(touched.has(key))throw new Error('Duplicate Google event in completed delta.')
    touched.add(key)
    const local=currentByKey.get(key)
    const baseline=baselines[key]
    const locallyChanged=Boolean(local)&&(!baseline||baseline.blockId!==local.id||baseline.valueHash!==googleBlockHash(local))
    if(pendingLocalWrites.has(key)||locallyChanged){
      actions.push({kind:'conflict',key,reason:pendingLocalWrites.has(key)?'Local Google write is pending':'Local copy changed since last accepted source revision'})
      continue
    }
    if(remote.status==='cancelled'){
      actions.push(local?{kind:'delete',key}:{kind:'unchanged',key})
      continue
    }
    const normalized=normalizeGoogleEvent(delta.calendarId,remote)
    if(!normalized)throw new Error('Google non-cancelled event could not be normalized.')
    if(!remote.etag)throw new Error('Google event must include its ETag.')
    if(!local)actions.push({kind:'insert',key,value:normalized,etag:remote.etag})
    else if(googleBlockHash(local)===googleBlockHash(normalized)&&baseline?.etag===remote.etag)actions.push({kind:'unchanged',key})
    else actions.push({kind:'update',key,value:normalized,etag:remote.etag})
  }
  if(delta.mode==='full'){
    for(const old of owned)if(!touched.has(old.sourceUid!)){
      const key=old.sourceUid!,baseline=baselines[key]
      actions.push(pendingLocalWrites.has(key)||!baseline||baseline.blockId!==old.id||baseline.valueHash!==googleBlockHash(old)
        ?{kind:'conflict',key,reason:'Full resync cannot delete a locally divergent event'}
        :{kind:'delete',key})
    }
  }
  return {calendarId:delta.calendarId,nextSyncToken:delta.nextSyncToken,fullSync:delta.mode==='full',actions}
}
/** Outbound creates are suggestions until a separate scoped Gateway consent exists. */
export interface GoogleCreateIntentC2 {
  operation:'create'
  clientMutationId:string
  calendarId:string
  event:{summary:string;description?:string;location?:string;start:{date?:string;dateTime?:string;timeZone?:string};end:{date?:string;dateTime?:string;timeZone?:string}}
}
export function proposeGoogleCreate(block:TimeBlockEntity,calendarId:string,clientMutationId:string):GoogleCreateIntentC2 {
  if(block.source!=='folio'||block.kind!=='event'||block.taskId)throw new Error('Only native standalone Folio events may be exported.')
  if(!/^[a-zA-Z0-9-]{12,128}$/.test(clientMutationId))throw new Error('Stable idempotency key is required.')
  googleEventKey(calendarId,clientMutationId)
  const zone=block.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC'
  const start=block.allDay?{date:dateKeyInTimeZone(block.start,zone)}:{dateTime:block.start,timeZone:zone}
  const end=block.allDay?{date:dateKeyInTimeZone(block.end,zone)}:{dateTime:block.end,timeZone:zone}
  return {operation:'create',clientMutationId,calendarId,event:{
    summary:block.title,description:block.description,location:block.location,start,end,
  }}
}
export function googleWriteConflict(baseEtag:string,remoteEvent:GoogleEventC2):boolean {
  return !baseEtag||!remoteEvent.etag||baseEtag!==remoteEvent.etag||remoteEvent.status==='cancelled'
}
