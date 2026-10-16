/** Local Google calendar mirror ledger, NOT a network or OAuth provider.
 * Folio timeBlocks remain the sole calendar event store. The cursor, baselines,
 * pending writes and conflict decisions are local-only storage.* settings.
 * The future Account/Core gateway must separately verify account, grants,
 * writable calendar and conditional provider ETags. Never call Google directly.
 */
import { db } from '../db/database'
import type { TimeBlockEntity } from '../domain/models'
import {
  GoogleSyncTokenExpired, googleEventKey, googleSourceKey, pullGoogleDelta,
  type GoogleDeltaC2, type GoogleEventC2, type GooglePullTransportC2,
} from './calendarGoogleC2'
import {
  googleBlockHash, planGoogleMerge, proposeGoogleCreate,
  type GoogleBaselinesC2, type GoogleMergePlanC2,
} from './calendarGoogleReconcileC2'

export type GoogleConflictChoiceC2 = 'accept-provider' | 'keep-local-copy'
export interface GoogleConflictC2 {
  key: string
  reason: string
  remote: GoogleEventC2 | null
  localBlockId?: string
  detectedAt: string
}
export interface GooglePendingC2 {
  id: string
  operation: 'create' | 'update' | 'delete'
  folioBlockId?: string
  providerKey?: string
  baseEtag?: string
  createdAt: string
  /** Explicit queue only; no browser-side credential or silent dispatch. */
  status: 'awaiting-gateway'
}
export interface GoogleMirrorC2 {
  calendarId: string
  revision: number
  cursor?: string
  lastAppliedAt?: string
  baselines: GoogleBaselinesC2
  conflicts: Record<string, GoogleConflictC2>
  pending: Record<string, GooglePendingC2>
  phase: 'unconnected' | 'ready-for-gateway' | 'needs-full-sync'
}
export interface GooglePreviewC2 {
  calendarId: string
  expectedRevision: number
  delta: GoogleDeltaC2
  plan: GoogleMergePlanC2
}
const settingKey=(id:string)=>'storage.calendarC2.google.'+googleSourceKey(id)
function empty(id:string):GoogleMirrorC2 {
  return {calendarId:id,revision:0,baselines:{},conflicts:{},pending:{},phase:'unconnected'}
}
async function saved(id:string) {
  return ((await db.settings.get(settingKey(id)))?.value as GoogleMirrorC2 | undefined) ?? empty(id)
}
async function blocks(id:string) {
  const source=googleSourceKey(id)
  return (await db.timeBlocks.toArray()).filter(b=>b.source==='google'&&b.sourceCalendar===source)
}
function conflictKeys(state:GoogleMirrorC2):Set<string> {
  return new Set([...Object.keys(state.conflicts),...Object.values(state.pending).map(p=>p.providerKey).filter((k):k is string=>Boolean(k))])
}
function fingerprint(plan:GoogleMergePlanC2) {
  return JSON.stringify(plan.actions.map(a=>a.kind==='conflict'
    ? [a.kind,a.key,a.reason]
    : a.kind==='insert'||a.kind==='update'
      ? [a.kind,a.key,a.etag,googleBlockHash(a.value)] : [a.kind,a.key]))
}
function matchingRemote(preview:GooglePreviewC2,key:string):GoogleEventC2|null {
  return preview.delta.events.find(e=>googleEventKey(preview.calendarId,e.id)===key)??null
}
function remoteBlock(event:GoogleEventC2 | null, calendarId:string):TimeBlockEntity|null {
  if (!event || event.status==='cancelled') return null
  const normalized=previewGoogleEvent(calendarId,event)
  if (!normalized) throw new Error('Remote calendar event cannot be materialized.')
  return normalized
}
function previewGoogleEvent(id:string,event:GoogleEventC2) {
  // Reuse the only Google event normalization authority.
  return normalizeGoogleEvent(id,event)
}
import { normalizeGoogleEvent } from './calendarGoogleC2'
export const calendarGoogleStoreC2={
  async status(calendarId:string) {
    const state=await saved(calendarId)
    return {calendarId:state.calendarId,revision:state.revision,phase:state.phase,
      hasCursor:Boolean(state.cursor),lastAppliedAt:state.lastAppliedAt,
      conflictCount:Object.keys(state.conflicts).length,pendingCount:Object.keys(state.pending).length}
  },
  async prepare(delta:GoogleDeltaC2):Promise<GooglePreviewC2> {
    if(!delta.nextSyncToken||!delta.calendarId)throw new Error('Incomplete Google delta.')
    const state=await saved(delta.calendarId)
    // Reject a stale incremental cursor, including after a 410 reset.
    if(delta.mode==='incremental' && (!state.cursor||state.phase==='needs-full-sync'))
      throw new Error('Incremental synchronization requires an acknowledged cursor.')
    const plan=planGoogleMerge(delta,await blocks(delta.calendarId),state.baselines,conflictKeys(state))
    if(plan.actions.length>10000)throw new Error('Too many Google mirror changes.')
    return {calendarId:delta.calendarId,expectedRevision:state.revision,delta,plan}
  },
  async apply(preview:GooglePreviewC2) {
    if(preview.plan.calendarId!==preview.calendarId||preview.delta.calendarId!==preview.calendarId||
      preview.plan.nextSyncToken!==preview.delta.nextSyncToken)throw new Error('Google preview identity changed.')
    return db.transaction('rw',db.settings,db.timeBlocks,async()=>{
      const state=await saved(preview.calendarId)
      if(state.revision!==preview.expectedRevision)throw new Error('Google mirror changed since preview.')
      const local=await blocks(preview.calendarId)
      const actual=planGoogleMerge(preview.delta,local,state.baselines,conflictKeys(state))
      if(fingerprint(actual)!==fingerprint(preview.plan))throw new Error('Google calendar source changed since preview.')
      const existing=new Map(local.filter(b=>b.sourceUid).map(b=>[b.sourceUid!,b]))
      const baselines={...state.baselines}
      const conflicts={...state.conflicts}
      const now=new Date().toISOString()
      let created=0,updated=0,removed=0,conflicted=0
      for(const action of actual.actions) {
        const previous=existing.get(action.key)
        if(action.kind==='conflict') {
          const remote=matchingRemote(preview,action.key)
          // Record the complete provider resolution candidate before cursor advances.
          conflicts[action.key]={key:action.key,reason:action.reason,remote,
            localBlockId:previous?.id,detectedAt:now}
          conflicted++
          continue
        }
        if(action.kind==='unchanged') continue
        if(action.kind==='delete'){
          if(previous) {await db.timeBlocks.delete(previous.id);removed++}
          delete baselines[action.key];delete conflicts[action.key]
          continue
        }
        const block={...action.value,id:previous?.id??crypto.randomUUID(),createdAt:previous?.createdAt??now,updatedAt:now}
        await db.timeBlocks.put(block)
        baselines[action.key]={blockId:block.id,etag:action.etag,valueHash:googleBlockHash(block)}
        delete conflicts[action.key]
        if(previous)updated++;else created++
      }
      // Cursor + affected timeBlocks + conflict copies commit in ONE transaction.
      const next:GoogleMirrorC2={...state,revision:state.revision+1,
        cursor:preview.delta.nextSyncToken,lastAppliedAt:now,baselines,conflicts,phase:'ready-for-gateway'}
      await db.settings.put({key:settingKey(preview.calendarId),value:next,updatedAt:now})
      return {created,updated,removed,conflicted,cursorSaved:true}
    })
  },
  async pull(transport:GooglePullTransportC2,calendarId:string) {
    if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('Offline: Google calendar mirror remains unchanged.')
    const state=await saved(calendarId)
    let delta:GoogleDeltaC2
    try {delta=await pullGoogleDelta(transport,calendarId,state.phase==='needs-full-sync'?undefined:state.cursor)}
    catch(error) {
      if(error instanceof GoogleSyncTokenExpired){
        await db.transaction('rw',db.settings,async()=>{
          const latest=await saved(calendarId)
          await db.settings.put({key:settingKey(calendarId),value:{...latest,revision:latest.revision+1,
            cursor:undefined,phase:'needs-full-sync'},updatedAt:new Date().toISOString()})
        })
        return {status:'needs-full-sync' as const}
      }
      throw error
    }
    const preview=await this.prepare(delta)
    return {status:'applied' as const,...await this.apply(preview)}
  },
  async conflicts(calendarId:string):Promise<GoogleConflictC2[]> {
    return Object.values((await saved(calendarId)).conflicts)
  },
  async resolve(calendarId:string,key:string,choice:GoogleConflictChoiceC2) {
    return db.transaction('rw',db.settings,db.timeBlocks,async()=>{
      const state=await saved(calendarId)
      const conflict=state.conflicts[key]
      if(!conflict)throw new Error('Google conflict no longer exists.')
      const local=(await blocks(calendarId)).find(b=>b.sourceUid===key)
      if(conflict.localBlockId&&local?.id!==conflict.localBlockId)
        throw new Error('Source changed since conflict was captured.')
      const provider=remoteBlock(conflict.remote,calendarId)
      const now=new Date().toISOString()
      let copiedId:string|undefined
      if(choice==='keep-local-copy'&&local) {
        copiedId=crypto.randomUUID()
        await db.timeBlocks.put({...local,id:copiedId,source:'folio',sourceCalendar:undefined,sourceUid:undefined,
          createdAt:now,updatedAt:now})
      }
      if(provider){
        if(!conflict.remote?.etag)throw new Error('Google event ETag missing.')
        const result={...provider,id:local?.id??crypto.randomUUID(),createdAt:local?.createdAt??now,updatedAt:now}
        await db.timeBlocks.put(result)
        state.baselines[key]={blockId:result.id,etag:conflict.remote.etag,valueHash:googleBlockHash(result)}
      }else{
        if(local)await db.timeBlocks.delete(local.id)
        delete state.baselines[key]
      }
      delete state.conflicts[key]
      state.revision++
      await db.settings.put({key:settingKey(calendarId),value:state,updatedAt:now})
      return {copiedId,providerAccepted:true}
    })
  },
  /** User-initiated outbound intent is locally durable and still cannot dispatch. */
  async queueCreate(blockId:string,calendarId:string) {
    return db.transaction('rw',db.settings,db.timeBlocks,async()=>{
      const block=await db.timeBlocks.get(blockId)
      if(!block)throw new Error('Folio event no longer exists.')
      const id=crypto.randomUUID()
      const intent=proposeGoogleCreate(block,calendarId,id)
      const state=await saved(calendarId)
      const pending:GooglePendingC2={id,operation:'create',folioBlockId:blockId,
        createdAt:new Date().toISOString(),status:'awaiting-gateway'}
      state.pending[id]=pending;state.revision++
      await db.settings.put({key:settingKey(calendarId),value:state,updatedAt:new Date().toISOString()})
      return intent
    })
  },
  async pending(calendarId:string):Promise<GooglePendingC2[]>{
    return Object.values((await saved(calendarId)).pending)
  },
  async cancelPending(calendarId:string,id:string) {
    await db.transaction('rw',db.settings,async()=>{
      const state=await saved(calendarId)
      if(!state.pending[id])throw new Error('Pending Google write not found.')
      delete state.pending[id];state.revision++
      await db.settings.put({key:settingKey(calendarId),value:state,updatedAt:new Date().toISOString()})
    })
  },
}
