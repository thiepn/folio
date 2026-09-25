import { db } from '../db/database'
import type { SyncEntityType } from '../domain/models'
import { deserializeAttachment, serializeAttachment } from './attachmentService'

export const SYNC_ENTITY_TYPES: SyncEntityType[]=[
  'tasks','projects','habits','habitEntries','habitGroups','habitTemplates',
  'timeBlocks','dailyPlans','dailyPlanItems','focusSessions','recurringSeries',
  'settings','reviewRecords','reminders','reminderOccurrences',
  'folders','lists','sections','tags','notes','attachments',
]

export const MAX_SYNC_ATTACHMENT_BYTES=5*1024*1024

export interface SyncLocalRecord {
  entityType:SyncEntityType
  entityId:string
  payload:unknown
  hash:string
}

export interface SyncLocalSnapshot {
  records:Map<string,SyncLocalRecord>
  oversizedAttachmentIds:string[]
}

export function syncRecordKey(entityType:SyncEntityType,entityId:string){return entityType+':'+entityId}
export function syncMetadataId(workspaceId:string,entityType:SyncEntityType,entityId:string){return workspaceId+':'+entityType+':'+entityId}

function entityId(type:SyncEntityType,row:any){
  if(type==='dailyPlans')return String(row.date)
  if(type==='settings')return String(row.key)
  return String(row.id)
}
function syncableSetting(key:string){
  return !key.startsWith('sync.')&&!key.startsWith('storage.')&&!key.startsWith('pwa.')
}
function canonical(value:any):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value)
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
  const keys=Object.keys(value).sort()
  return '{'+keys.map((key)=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'
}
export function syncHash(payload:unknown){
  const value=canonical(payload)
  let hash=2166136261
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(36)
}

async function rowsFor(type:SyncEntityType):Promise<any[]>{
  if(type==='attachments'){
    const attachments=await db.attachments.toArray()
    const result:any[]=[]
    for(const attachment of attachments){
      if(attachment.kind!=='link'&&attachment.size>MAX_SYNC_ATTACHMENT_BYTES)continue
      result.push(await serializeAttachment(attachment))
    }
    return result
  }
  const rows=await (db[type] as any).toArray()
  return type==='settings'?rows.filter((row:any)=>syncableSetting(String(row.key))):rows
}

export async function buildLocalSyncSnapshot():Promise<SyncLocalSnapshot>{
  const records=new Map<string,SyncLocalRecord>()
  const oversizedAttachmentIds=(await db.attachments.toArray())
    .filter((item)=>item.kind!=='link'&&item.size>MAX_SYNC_ATTACHMENT_BYTES)
    .map((item)=>item.id)

  for(const type of SYNC_ENTITY_TYPES){
    const rows=await rowsFor(type)
    for(const row of rows){
      const id=entityId(type,row)
      const payload=structuredClone(row)
      records.set(syncRecordKey(type,id),{entityType:type,entityId:id,payload,hash:syncHash(payload)})
    }
  }
  return {records,oversizedAttachmentIds}
}

export async function getLocalSyncRecord(entityType:SyncEntityType,entityIdValue:string):Promise<SyncLocalRecord|undefined>{
  if(entityType==='attachments'){
    const row=await db.attachments.get(entityIdValue)
    if(!row)return undefined
    if(row.kind!=='link'&&row.size>MAX_SYNC_ATTACHMENT_BYTES)return undefined
    const payload=await serializeAttachment(row)
    return {entityType,entityId:entityIdValue,payload,hash:syncHash(payload)}
  }
  const key=entityType==='dailyPlans'||entityType==='settings'?entityIdValue:entityIdValue
  const row=await (db[entityType] as any).get(key)
  if(!row)return undefined
  if(entityType==='settings'&&!syncableSetting(String(row.key)))return undefined
  const payload=structuredClone(row)
  return {entityType,entityId:entityIdValue,payload,hash:syncHash(payload)}
}

export async function applyRemoteSyncRecord(entityType:SyncEntityType,entityIdValue:string,payload:unknown,deleted:boolean){
  const table=db[entityType] as any
  if(deleted){
    await table.delete(entityIdValue)
    return
  }
  if(!payload||typeof payload!=='object')throw new Error('Remote sync payload is invalid.')
  if(entityType==='attachments'){
    const attachment=deserializeAttachment(payload as any)
    if(attachment.id!==entityIdValue)throw new Error('Remote attachment ID mismatch.')
    await db.attachments.put(attachment)
    return
  }
  const row=structuredClone(payload as any)
  const id=entityId(entityType,row)
  if(id!==entityIdValue)throw new Error('Remote sync entity ID mismatch.')
  if(entityType==='settings'&&!syncableSetting(entityIdValue))return
  await table.put(row)
}

export async function rebuildDerivedAfterSync(){
  const {contentSearchService}=await import('./contentSearchService')
  const {attachmentService}=await import('./attachmentService')
  await attachmentService.cleanupOrphans()
  await contentSearchService.rebuildAll()
}

export async function getOversizedLocalAttachment(entityId:string){
  const row=await db.attachments.get(entityId)
  if(!row||row.kind==='link'||row.size<=MAX_SYNC_ATTACHMENT_BYTES)return undefined
  const {blob:_blob,...metadata}=row
  return metadata
}
