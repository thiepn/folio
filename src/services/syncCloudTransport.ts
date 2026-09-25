import { FOLIO_SYNC_CLOUD } from '../config/syncCloud'
import { syncAuthService } from './syncAuthService'

export interface SyncCloudWorkspace {
  id:string
  name:string
  created_at:string
  updated_at:string
}

export interface SyncCloudDevice {
  workspace_id:string
  device_id:string
  name:string
  platform?:string
  last_seen_at:string
}

export interface SyncCloudRecord {
  workspace_id:string
  entity_type:string
  entity_id:string
  payload:unknown
  deleted:boolean
  revision:number
  device_id:string
  updated_at:string
}

export type SyncPushResult =
  | {ok:true;record:SyncCloudRecord}
  | {ok:false;conflict:SyncCloudRecord}

async function authorized(path:string,options:RequestInit={},retry=true){
  const session=await syncAuthService.getValidSession()
  if(!session)throw new Error('Sign in to sync first.')
  const response=await fetch(FOLIO_SYNC_CLOUD.url+path,{
    ...options,
    headers:{
      apikey:FOLIO_SYNC_CLOUD.publishableKey,
      Authorization:'Bearer '+session.accessToken,
      'Content-Type':'application/json',
      ...(options.headers??{}),
    },
  })
  if(response.status===401&&retry){
    await syncAuthService.refresh()
    return authorized(path,options,false)
  }
  return response
}
async function json<T>(response:Response):Promise<T>{
  const data=await response.json().catch(()=>null)
  if(!response.ok){
    const message=(data as any)?.message||(data as any)?.details||(data as any)?.hint||(data as any)?.code||'Sync cloud request failed.'
    throw new Error(String(message))
  }
  return data as T
}
function query(path:string,params:Record<string,string|number|undefined>){
  const url=new URL(FOLIO_SYNC_CLOUD.url+path)
  for(const [key,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(key,String(value))
  return url.pathname+url.search
}

export const syncCloudTransport={
  async listWorkspaces(){
    const response=await authorized(query('/rest/v1/folio_sync_workspaces',{select:'id,name,created_at,updated_at',order:'updated_at.desc'}))
    return json<SyncCloudWorkspace[]>(response)
  },

  async createWorkspace(name:string){
    const id=crypto.randomUUID()
    const response=await authorized('/rest/v1/folio_sync_workspaces',{
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({id,name:name.trim()||'Folio'}),
    })
    const rows=await json<SyncCloudWorkspace[]>(response)
    if(!rows[0])throw new Error('Cloud workspace was not created.')
    return rows[0]
  },

  async listDevices(workspaceId:string){
    const response=await authorized(query('/rest/v1/folio_sync_devices',{
      select:'workspace_id,device_id,name,platform,last_seen_at',
      workspace_id:'eq.'+workspaceId,
      order:'last_seen_at.desc',
    }))
    return json<SyncCloudDevice[]>(response)
  },

  async touchDevice(workspaceId:string,device:{id:string;name:string;platform?:string}){
    const response=await authorized(query('/rest/v1/folio_sync_devices',{on_conflict:'user_id,workspace_id,device_id'}),{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify({workspace_id:workspaceId,device_id:device.id,name:device.name,platform:device.platform,last_seen_at:new Date().toISOString()}),
    })
    return json<SyncCloudDevice[]>(response)
  },

  async pull(workspaceId:string,afterRevision:number,limit=500){
    const response=await authorized(query('/rest/v1/folio_sync_records',{
      select:'workspace_id,entity_type,entity_id,payload,deleted,revision,device_id,updated_at',
      workspace_id:'eq.'+workspaceId,
      revision:'gt.'+afterRevision,
      order:'revision.asc',
      limit,
    }))
    return json<SyncCloudRecord[]>(response)
  },

  async getRecord(workspaceId:string,entityType:string,entityId:string){
    const response=await authorized(query('/rest/v1/folio_sync_records',{
      select:'workspace_id,entity_type,entity_id,payload,deleted,revision,device_id,updated_at',
      workspace_id:'eq.'+workspaceId,
      entity_type:'eq.'+entityType,
      entity_id:'eq.'+entityId,
      limit:1,
    }))
    return (await json<SyncCloudRecord[]>(response))[0]
  },

  async push(workspaceId:string,deviceId:string,change:{entityType:string;entityId:string;payload:unknown;deleted:boolean;baseRevision:number}):Promise<SyncPushResult>{
    const body={workspace_id:workspaceId,entity_type:change.entityType,entity_id:change.entityId,payload:change.deleted?null:change.payload,deleted:change.deleted,device_id:deviceId}
    if(change.baseRevision===0){
      const response=await authorized('/rest/v1/folio_sync_records',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify(body),
      })
      if(response.status===409){
        const conflict=await this.getRecord(workspaceId,change.entityType,change.entityId)
        if(!conflict)throw new Error('Remote record changed during sync.')
        return {ok:false,conflict}
      }
      const rows=await json<SyncCloudRecord[]>(response)
      if(!rows[0])throw new Error('Cloud did not acknowledge the synced record.')
      return {ok:true,record:rows[0]}
    }

    const response=await authorized(query('/rest/v1/folio_sync_records',{
      workspace_id:'eq.'+workspaceId,
      entity_type:'eq.'+change.entityType,
      entity_id:'eq.'+change.entityId,
      revision:'eq.'+change.baseRevision,
    }),{
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({payload:change.deleted?null:change.payload,deleted:change.deleted,device_id:deviceId}),
    })
    const rows=await json<SyncCloudRecord[]>(response)
    if(rows[0])return {ok:true,record:rows[0]}
    const conflict=await this.getRecord(workspaceId,change.entityType,change.entityId)
    if(!conflict)throw new Error('Remote record disappeared during sync.')
    return {ok:false,conflict}
  },
}
