import { db } from '../db/database'
import type { SyncConflictEntity, SyncEntityType, SyncQueueEntity, SyncShadowEntity } from '../domain/models'
import { settingsRepository } from '../repositories/settingsRepository'
import { syncAuthService } from './syncAuthService'
import { syncCloudTransport, type SyncCloudRecord, type SyncCloudWorkspace } from './syncCloudTransport'
import {
  SYNC_ENTITY_TYPES, applyRemoteSyncRecord, buildLocalSyncSnapshot, getLocalSyncRecord, getOversizedLocalAttachment,
  rebuildDerivedAfterSync, syncHash, syncMetadataId, syncRecordKey,
} from './syncSerialization'

export interface SyncConfig {
  enabled:boolean
  workspaceId?:string
  workspaceName?:string
  deviceId:string
  deviceName:string
  intervalSeconds:number
  lastSyncAt?:string
}

export interface SyncRuntimeState {
  phase:'disconnected'|'idle'|'syncing'|'offline'|'error'|'conflict'
  enabled:boolean
  authenticated:boolean
  online:boolean
  workspaceId?:string
  workspaceName?:string
  deviceId?:string
  deviceName?:string
  pendingCount:number
  conflictCount:number
  oversizedAttachmentCount:number
  lastSyncAt?:string
  lastError?:string
  nextRetryAt?:string
}

export interface SyncRunResult {
  pulled:number
  pushed:number
  conflicts:number
  pending:number
  oversizedAttachments:number
}

const CONFIG_KEY='sync.config.v1'
const cursorKey=(workspaceId:string)=>'sync.cursor.'+workspaceId
const listeners=new Set<()=>void>()
let state:SyncRuntimeState={
  phase:'disconnected',enabled:false,authenticated:false,online:typeof navigator==='undefined'?true:navigator.onLine,
  pendingCount:0,conflictCount:0,oversizedAttachmentCount:0,
}
let running:Promise<SyncRunResult>|null=null
let timer:number|null=null
let started=false
let failureCount=0
let nextRetryAt=0

function emit(patch?:Partial<SyncRuntimeState>){
  if(patch)state={...state,...patch}
  listeners.forEach((listener)=>listener())
}
function platformLabel(){
  const nav=navigator as Navigator & {userAgentData?:{platform?:string}}
  const platform=nav.userAgentData?.platform||nav.platform||'Device'
  const agent=/firefox/i.test(nav.userAgent)?'Firefox':/edg/i.test(nav.userAgent)?'Edge':/chrome/i.test(nav.userAgent)?'Chrome':/safari/i.test(nav.userAgent)?'Safari':'Browser'
  return platform+' · '+agent
}
async function config():Promise<SyncConfig>{
  const fallback:SyncConfig={enabled:false,deviceId:crypto.randomUUID(),deviceName:platformLabel(),intervalSeconds:30}
  const current=await settingsRepository.get<SyncConfig|undefined>(CONFIG_KEY,undefined)
  if(current?.deviceId){
    return {...fallback,...current,intervalSeconds:Math.max(15,Math.min(300,current.intervalSeconds||30))}
  }
  await settingsRepository.set(CONFIG_KEY,fallback)
  return fallback
}
async function saveConfig(next:SyncConfig){await settingsRepository.set(CONFIG_KEY,next)}
async function cursor(workspaceId:string){return settingsRepository.get<number>(cursorKey(workspaceId),0)}
async function setCursor(workspaceId:string,value:number){await settingsRepository.set(cursorKey(workspaceId),Math.max(0,Math.floor(value)))}
function validEntityType(value:string):value is SyncEntityType{return (SYNC_ENTITY_TYPES as string[]).includes(value)}
function shadowFrom(workspaceId:string,record:SyncCloudRecord,hash:string):SyncShadowEntity{
  const stamp=new Date().toISOString()
  return {
    id:syncMetadataId(workspaceId,record.entity_type as SyncEntityType,record.entity_id),
    workspaceId,entityType:record.entity_type as SyncEntityType,entityId:record.entity_id,
    revision:record.revision,hash,deleted:record.deleted,remoteUpdatedAt:record.updated_at,updatedAt:stamp,
  }
}
async function counts(workspaceId?:string){
  if(!workspaceId)return {pending:0,conflicts:0}
  const [pending,conflicts]=await Promise.all([
    db.syncQueue.where('workspaceId').equals(workspaceId).count(),
    db.syncConflicts.where('workspaceId').equals(workspaceId).count(),
  ])
  return {pending,conflicts}
}
async function refreshRuntime(extra:Partial<SyncRuntimeState>={}){
  const cfg=await config()
  const auth=Boolean(syncAuthService.getStoredSession())
  const c=await counts(cfg.workspaceId)
  const phase:SyncRuntimeState['phase']=!navigator.onLine?'offline':!auth||!cfg.workspaceId||!cfg.enabled?'disconnected':c.conflicts?'conflict':'idle'
  emit({
    phase,enabled:cfg.enabled,authenticated:auth,online:navigator.onLine,
    workspaceId:cfg.workspaceId,workspaceName:cfg.workspaceName,deviceId:cfg.deviceId,deviceName:cfg.deviceName,
    pendingCount:c.pending,conflictCount:c.conflicts,lastSyncAt:cfg.lastSyncAt,
    nextRetryAt:nextRetryAt?new Date(nextRetryAt).toISOString():undefined,
    ...extra,
  })
}

async function queueLocalChanges(workspaceId:string){
  const snapshot=await buildLocalSyncSnapshot()
  const [shadows,existingQueues]=await Promise.all([
    db.syncShadows.where('workspaceId').equals(workspaceId).toArray(),
    db.syncQueue.where('workspaceId').equals(workspaceId).toArray(),
  ])
  const shadowMap=new Map(shadows.map((row)=>[syncRecordKey(row.entityType,row.entityId),row]))
  const queueMap=new Map(existingQueues.map((row)=>[syncRecordKey(row.entityType,row.entityId),row]))
  const oversized=new Set(snapshot.oversizedAttachmentIds)
  const now=new Date().toISOString()

  for(const [key,record] of snapshot.records){
    const shadow=shadowMap.get(key)
    const previous=queueMap.get(key)
    if(!shadow||shadow.deleted||shadow.hash!==record.hash){
      const row:SyncQueueEntity={
        id:syncMetadataId(workspaceId,record.entityType,record.entityId),workspaceId,
        entityType:record.entityType,entityId:record.entityId,operation:'upsert',
        baseRevision:shadow?.revision??0,localHash:record.hash,
        queuedAt:previous?.localHash===record.hash?previous.queuedAt:now,
        attempts:previous?.localHash===record.hash?previous.attempts:0,
        lastAttemptAt:previous?.localHash===record.hash?previous.lastAttemptAt:undefined,
        lastError:previous?.localHash===record.hash?previous.lastError:undefined,
      }
      await db.syncQueue.put(row)
      queueMap.set(key,row)
    }else if(previous){
      await db.syncQueue.delete(previous.id)
      queueMap.delete(key)
    }
  }

  for(const shadow of shadows){
    const key=syncRecordKey(shadow.entityType,shadow.entityId)
    if(snapshot.records.has(key)||shadow.deleted)continue
    if(shadow.entityType==='attachments'&&oversized.has(shadow.entityId))continue
    const previous=queueMap.get(key)
    const row:SyncQueueEntity={
      id:syncMetadataId(workspaceId,shadow.entityType,shadow.entityId),workspaceId,
      entityType:shadow.entityType,entityId:shadow.entityId,operation:'delete',
      baseRevision:shadow.revision,queuedAt:previous?.operation==='delete'?previous.queuedAt:now,
      attempts:previous?.operation==='delete'?previous.attempts:0,
      lastAttemptAt:previous?.operation==='delete'?previous.lastAttemptAt:undefined,
      lastError:previous?.operation==='delete'?previous.lastError:undefined,
    }
    await db.syncQueue.put(row)
  }
  return snapshot
}

async function storeConflict(workspaceId:string,remote:SyncCloudRecord,localPayload:unknown){
  if(!validEntityType(remote.entity_type))return
  const row:SyncConflictEntity={
    id:syncMetadataId(workspaceId,remote.entity_type,remote.entity_id),workspaceId,
    entityType:remote.entity_type,entityId:remote.entity_id,
    localPayload,remotePayload:remote.payload,remoteDeleted:remote.deleted,
    remoteRevision:remote.revision,detectedAt:new Date().toISOString(),
  }
  await db.syncConflicts.put(row)
}

async function applyRemote(workspaceId:string,remote:SyncCloudRecord){
  if(!validEntityType(remote.entity_type))return
  await applyRemoteSyncRecord(remote.entity_type,remote.entity_id,remote.payload,remote.deleted)
  await db.syncShadows.put(shadowFrom(workspaceId,remote,remote.deleted?'':syncHash(remote.payload)))
  await db.syncQueue.delete(syncMetadataId(workspaceId,remote.entity_type,remote.entity_id))
  await db.syncConflicts.delete(syncMetadataId(workspaceId,remote.entity_type,remote.entity_id))
}

async function pullRemote(workspaceId:string){
  let after=await cursor(workspaceId),pulled=0,last=after
  for(;;){
    const rows=await syncCloudTransport.pull(workspaceId,last,500)
    if(!rows.length)break
    for(const remote of rows){
      last=Math.max(last,remote.revision)
      if(!validEntityType(remote.entity_type))continue
      const id=syncMetadataId(workspaceId,remote.entity_type,remote.entity_id)
      const [shadow,queued,local]=await Promise.all([
        db.syncShadows.get(id),db.syncQueue.get(id),getLocalSyncRecord(remote.entity_type,remote.entity_id),
      ])
      if(shadow&&remote.revision<=shadow.revision)continue
      const remoteHash=remote.deleted?'':syncHash(remote.payload)
      const oversizedLocal=remote.entity_type==='attachments'&&!local?await getOversizedLocalAttachment(remote.entity_id):undefined
      if(oversizedLocal){
        await db.syncShadows.put(shadowFrom(workspaceId,remote,remoteHash))
        await db.syncQueue.delete(id);await db.syncConflicts.delete(id)
        continue
      }

      const localChanged=Boolean(queued)
        || Boolean(!shadow&&local)
        || Boolean(shadow&&local&&(shadow.deleted||shadow.hash!==local.hash))
        || Boolean(shadow&&!local&&!shadow.deleted)

      if(localChanged){
        if(remote.deleted&&!local){
          await db.syncShadows.put(shadowFrom(workspaceId,remote,''))
          await db.syncQueue.delete(id);await db.syncConflicts.delete(id)
        }else if(!remote.deleted&&local&&local.hash===remoteHash){
          await db.syncShadows.put(shadowFrom(workspaceId,remote,remoteHash))
          await db.syncQueue.delete(id);await db.syncConflicts.delete(id)
        }else{
          await storeConflict(workspaceId,remote,local?.payload)
        }
      }else{
        await applyRemote(workspaceId,remote)
        pulled++
      }
    }
    if(rows.length<500)break
  }
  if(last>after)await setCursor(workspaceId,last)
  return pulled
}

async function pushQueue(workspaceId:string,deviceId:string){
  const conflicts=new Set((await db.syncConflicts.where('workspaceId').equals(workspaceId).toArray()).map((row)=>row.id))
  const queue=(await db.syncQueue.where('workspaceId').equals(workspaceId).toArray()).sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt))
  let pushed=0
  for(const item of queue){
    if(conflicts.has(item.id))continue
    const local=await getLocalSyncRecord(item.entityType,item.entityId)
    const deleted=item.operation==='delete'||!local
    try{
      const result=await syncCloudTransport.push(workspaceId,deviceId,{
        entityType:item.entityType,entityId:item.entityId,payload:deleted?null:local!.payload,deleted,baseRevision:item.baseRevision,
      })
      if(result.ok){
        await db.syncShadows.put(shadowFrom(workspaceId,result.record,deleted?'':local!.hash))
        await db.syncQueue.delete(item.id);await db.syncConflicts.delete(item.id)
        pushed++
      }else{
        await storeConflict(workspaceId,result.conflict,local?.payload)
      }
    }catch(error){
      await db.syncQueue.put({...item,attempts:item.attempts+1,lastAttemptAt:new Date().toISOString(),lastError:error instanceof Error?error.message:String(error)})
      throw error
    }
  }
  return pushed
}

async function runSync(force=false):Promise<SyncRunResult>{
  const cfg=await config()
  const auth=await syncAuthService.getValidSession()
  if(!cfg.enabled||!cfg.workspaceId||!auth)throw new Error('Sync is not connected.')
  if(!navigator.onLine)throw new Error('Offline. Local changes will sync when the network returns.')
  if(!force&&nextRetryAt>Date.now())return {pulled:0,pushed:0,conflicts:state.conflictCount,pending:state.pendingCount,oversizedAttachments:state.oversizedAttachmentCount}

  emit({phase:'syncing',lastError:undefined,online:true})
  await syncCloudTransport.touchDevice(cfg.workspaceId,{id:cfg.deviceId,name:cfg.deviceName,platform:navigator.userAgent})
  const pulledBefore=await pullRemote(cfg.workspaceId)
  const snapshot=await queueLocalChanges(cfg.workspaceId)
  const pushed=await pushQueue(cfg.workspaceId,cfg.deviceId)
  const pulledAfter=await pullRemote(cfg.workspaceId)
  await rebuildDerivedAfterSync()
  await queueLocalChanges(cfg.workspaceId)
  const c=await counts(cfg.workspaceId)
  const stamp=new Date().toISOString()
  await saveConfig({...cfg,lastSyncAt:stamp})
  failureCount=0;nextRetryAt=0
  const result={pulled:pulledBefore+pulledAfter,pushed,conflicts:c.conflicts,pending:c.pending,oversizedAttachments:snapshot.oversizedAttachmentIds.length}
  emit({phase:c.conflicts?'conflict':'idle',pendingCount:c.pending,conflictCount:c.conflicts,oversizedAttachmentCount:result.oversizedAttachments,lastSyncAt:stamp,lastError:undefined,nextRetryAt:undefined})
  return result
}

async function backgroundSync(){
  const cfg=await config()
  if(!cfg.enabled||!cfg.workspaceId||!syncAuthService.getStoredSession())return
  if(!navigator.onLine){await refreshRuntime({phase:'offline'});return}
  if(nextRetryAt>Date.now())return
  try{await syncService.syncNow(false)}
  catch(error){
    failureCount++
    nextRetryAt=Date.now()+Math.min(5*60_000,5_000*Math.pow(2,Math.min(failureCount,6)))
    await refreshRuntime({phase:'error',lastError:error instanceof Error?error.message:String(error),nextRetryAt:new Date(nextRetryAt).toISOString()})
  }
}

export const syncService={
  subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)},
  getSnapshot(){return state},

  async initialize(){await refreshRuntime()},

  async listWorkspaces():Promise<SyncCloudWorkspace[]>{return syncCloudTransport.listWorkspaces()},
  async createWorkspace(name:string){return syncCloudTransport.createWorkspace(name)},
  async listDevices(){
    const cfg=await config();if(!cfg.workspaceId)return[]
    return syncCloudTransport.listDevices(cfg.workspaceId)
  },
  async getConfig(){return config()},

  async configureWorkspace(workspace:{id:string;name:string},enable=true){
    const cfg=await config()
    const next={...cfg,workspaceId:workspace.id,workspaceName:workspace.name,enabled:enable}
    await saveConfig(next);await refreshRuntime()
    if(enable&&navigator.onLine&&syncAuthService.getStoredSession())void backgroundSync()
  },

  async setDeviceName(name:string){
    const cfg=await config();const value=name.trim()
    if(!value)throw new Error('Device name is required.')
    await saveConfig({...cfg,deviceName:value.slice(0,120)});await refreshRuntime()
  },

  async setEnabled(enabled:boolean){
    const cfg=await config()
    if(enabled&&!cfg.workspaceId)throw new Error('Choose a cloud workspace first.')
    await saveConfig({...cfg,enabled});await refreshRuntime()
    if(enabled)void backgroundSync()
  },

  async signOut(){
    const cfg=await config()
    await saveConfig({...cfg,enabled:false})
    await syncAuthService.signOut()
    await refreshRuntime({phase:'disconnected'})
  },

  async syncNow(force=true){
    if(running)return running
    running=runSync(force).catch(async(error)=>{
      failureCount++
      nextRetryAt=Date.now()+Math.min(5*60_000,5_000*Math.pow(2,Math.min(failureCount,6)))
      await refreshRuntime({phase:navigator.onLine?'error':'offline',lastError:error instanceof Error?error.message:String(error),nextRetryAt:new Date(nextRetryAt).toISOString()})
      throw error
    }).finally(()=>{running=null})
    return running
  },

  async getQueue(){
    const cfg=await config();if(!cfg.workspaceId)return[]
    return db.syncQueue.where('workspaceId').equals(cfg.workspaceId).toArray()
  },

  async getConflicts(){
    const cfg=await config();if(!cfg.workspaceId)return[]
    return db.syncConflicts.where('workspaceId').equals(cfg.workspaceId).toArray()
  },

  async resolveConflict(id:string,winner:'local'|'cloud'){
    const conflict=await db.syncConflicts.get(id);if(!conflict)throw new Error('Sync conflict no longer exists.')
    const cfg=await config();if(!cfg.workspaceId||cfg.workspaceId!==conflict.workspaceId)throw new Error('This conflict belongs to another sync workspace.')
    if(winner==='cloud'){
      await applyRemoteSyncRecord(conflict.entityType,conflict.entityId,conflict.remotePayload,conflict.remoteDeleted)
      const remote:SyncCloudRecord={workspace_id:conflict.workspaceId,entity_type:conflict.entityType,entity_id:conflict.entityId,payload:conflict.remotePayload,deleted:conflict.remoteDeleted,revision:conflict.remoteRevision,device_id:'remote',updated_at:new Date().toISOString()}
      await db.syncShadows.put(shadowFrom(conflict.workspaceId,remote,conflict.remoteDeleted?'':syncHash(conflict.remotePayload)))
      await db.syncQueue.delete(id);await db.syncConflicts.delete(id)
      await rebuildDerivedAfterSync();await refreshRuntime()
      return
    }

    const local=await getLocalSyncRecord(conflict.entityType,conflict.entityId)
    const result=await syncCloudTransport.push(conflict.workspaceId,cfg.deviceId,{
      entityType:conflict.entityType,entityId:conflict.entityId,payload:local?.payload??null,deleted:!local,baseRevision:conflict.remoteRevision,
    })
    if(!result.ok){
      await storeConflict(conflict.workspaceId,result.conflict,local?.payload)
      throw new Error('Cloud changed again while resolving the conflict. Review the newest version.')
    }
    await db.syncShadows.put(shadowFrom(conflict.workspaceId,result.record,local?.hash??''))
    await db.syncQueue.delete(id);await db.syncConflicts.delete(id);await refreshRuntime()
  },

  async resetDeviceSyncState(){
    const cfg=await config();if(!cfg.workspaceId)return
    const [shadows,queue,conflicts]=await Promise.all([
      db.syncShadows.where('workspaceId').equals(cfg.workspaceId).primaryKeys(),
      db.syncQueue.where('workspaceId').equals(cfg.workspaceId).primaryKeys(),
      db.syncConflicts.where('workspaceId').equals(cfg.workspaceId).primaryKeys(),
    ])
    await Promise.all([
      db.syncShadows.bulkDelete(shadows as string[]),
      db.syncQueue.bulkDelete(queue as string[]),
      db.syncConflicts.bulkDelete(conflicts as string[]),
      setCursor(cfg.workspaceId,0),
    ])
    await refreshRuntime()
  },

  async refreshStatus(){await refreshRuntime()},

  start(){
    if(started)return
    started=true
    void refreshRuntime().then(()=>backgroundSync())
    const wake=()=>{if(document.visibilityState==='visible')void backgroundSync()}
    window.addEventListener('online',wake);window.addEventListener('focus',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',wake)
    timer=window.setInterval(()=>void backgroundSync(),30_000)
    ;(this as any)._cleanup=()=>{window.removeEventListener('online',wake);window.removeEventListener('focus',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',wake)}
  },

  stop(){
    if(!started)return
    started=false
    ;(this as any)._cleanup?.()
    if(timer!==null)window.clearInterval(timer)
    timer=null
  },
}
