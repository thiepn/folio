import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import type { SyncConflictEntity } from '../../domain/models'
import { useSyncState } from '../../hooks/useSyncState'
import { syncAuthService } from '../../services/syncAuthService'
import { syncService } from '../../services/syncService'
import type { SyncCloudDevice, SyncCloudWorkspace } from '../../services/syncCloudTransport'
import { MAX_SYNC_ATTACHMENT_BYTES } from '../../services/syncSerialization'

function bytes(value:number){return value<1024*1024?(value/1024).toFixed(0)+' KB':(value/(1024*1024)).toFixed(1)+' MB'}
function phaseLabel(value:string){
  if(value==='syncing')return 'Syncing'
  if(value==='offline')return 'Offline'
  if(value==='error')return 'Needs attention'
  if(value==='conflict')return 'Conflicts'
  if(value==='idle')return 'Up to date'
  return 'Disconnected'
}
function payloadSummary(payload:unknown,deleted=false){
  if(deleted)return 'Deleted'
  if(!payload||typeof payload!=='object')return 'No data'
  const row=payload as Record<string,unknown>
  const title=String(row.title??row.name??row.key??row.date??row.id??'Record')
  const detail=[row.status,row.plannedDate,row.deadline,row.updatedAt].filter(Boolean).map(String).join(' · ')
  return detail?title+' · '+detail:title
}
function conflictTitle(conflict:SyncConflictEntity){
  const local=conflict.localPayload as Record<string,unknown>|undefined
  const remote=conflict.remotePayload as Record<string,unknown>|undefined
  return String(local?.title??local?.name??remote?.title??remote?.name??conflict.entityId)
}

export function SyncView(){
  const sync=useSyncState()
  const [email,setEmail]=useState(syncAuthService.getStoredSession()?.email??'')
  const [password,setPassword]=useState('')
  const [workspaces,setWorkspaces]=useState<SyncCloudWorkspace[]>([])
  const [devices,setDevices]=useState<SyncCloudDevice[]>([])
  const [workspaceName,setWorkspaceName]=useState('Folio')
  const [deviceName,setDeviceName]=useState(sync.deviceName??'')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const conflicts=useLiveQuery(()=>syncService.getConflicts(),[sync.workspaceId],[])??[]
  const queue=useLiveQuery(()=>syncService.getQueue(),[sync.workspaceId],[])??[]
  const session=syncAuthService.getStoredSession()

  useEffect(()=>{setDeviceName(sync.deviceName??'')},[sync.deviceName])
  useEffect(()=>{if(session)void refreshCloudLists()},[sync.authenticated,sync.workspaceId])

  async function refreshCloudLists(){
    try{
      const [nextWorkspaces,nextDevices]=await Promise.all([syncService.listWorkspaces(),syncService.listDevices()])
      setWorkspaces(nextWorkspaces);setDevices(nextDevices)
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load sync cloud state.')}
  }
  async function signIn(create=false){
    setBusy(true);setError('');setMessage('')
    try{
      if(create){
        const result=await syncAuthService.signUp(email,password)
        if(result.confirmationRequired){setMessage('Account created. Confirm the email if Supabase asks you to, then sign in.');return}
      }else await syncAuthService.signIn(email,password)
      setPassword('')
      await syncService.initialize()
      await refreshCloudLists()
      setMessage('Signed in to Folio Sync.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Sync sign-in failed.')}
    finally{setBusy(false)}
  }
  async function createWorkspace(){
    setBusy(true);setError('');setMessage('')
    try{
      const workspace=await syncService.createWorkspace(workspaceName)
      await syncService.configureWorkspace(workspace,true)
      await syncService.syncNow(true)
      await refreshCloudLists()
      setMessage('Cloud workspace created and first sync completed.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create sync workspace.')}
    finally{setBusy(false)}
  }
  async function connect(workspace:SyncCloudWorkspace){
    setBusy(true);setError('');setMessage('')
    try{
      await syncService.configureWorkspace(workspace,true)
      const result=await syncService.syncNow(true)
      await refreshCloudLists()
      setMessage('Workspace connected · '+result.pulled+' pulled · '+result.pushed+' pushed.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not connect workspace.')}
    finally{setBusy(false)}
  }
  async function syncNow(){
    setBusy(true);setError('');setMessage('')
    try{
      const result=await syncService.syncNow(true)
      await refreshCloudLists()
      setMessage(result.pulled+' pulled · '+result.pushed+' pushed · '+result.pending+' pending.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Sync failed.')}
    finally{setBusy(false)}
  }
  async function resolve(id:string,winner:'local'|'cloud'){
    setBusy(true);setError('');setMessage('')
    try{
      await syncService.resolveConflict(id,winner)
      setMessage(winner==='local'?'This device won the conflict.':'Cloud version applied locally.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Conflict could not be resolved.')}
    finally{setBusy(false)}
  }

  const recentQueue=useMemo(()=>[...queue].sort((a,b)=>b.queuedAt.localeCompare(a.queuedAt)).slice(0,12),[queue])

  return <div className="sync-view">
    <PageHeader kicker="Multi-device without silent overwrites" title="Sync" subtitle="Keep Folio local-first on every device while synchronizing through an authenticated, revision-checked cloud workspace." />
    {message?<div className="sync-notice">{message}</div>:null}
    {error?<div className="form-error">{error}</div>:null}

    <section className="sync-status-grid">
      <article className={'sync-status-card phase-'+sync.phase}><span>State</span><strong>{phaseLabel(sync.phase)}</strong><small>{sync.online?'Network available':'Network unavailable'}</small></article>
      <article className="sync-status-card"><span>Pending</span><strong>{sync.pendingCount}</strong><small>Local changes waiting to push</small></article>
      <article className="sync-status-card"><span>Conflicts</span><strong>{sync.conflictCount}</strong><small>Require an explicit winner</small></article>
      <article className="sync-status-card"><span>Last sync</span><strong>{sync.lastSyncAt?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(sync.lastSyncAt)):'Never'}</strong><small>{sync.nextRetryAt?'Retry '+new Date(sync.nextRetryAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Automatic retry enabled'}</small></article>
    </section>

    {!session?<section className="sync-section">
      <div className="sync-section-head"><div><span className="eyebrow">Account</span><h2>Sign in to Folio Sync</h2></div></div>
      <p className="sync-explainer">Sync uses the THIEPN Core Supabase project with authenticated row-level security. The browser contains only the public publishable key; your session token stays on this device and is excluded from Folio backups.</p>
      <div className="sync-auth-form"><label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></label><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)}/></label><div><Button variant="primary" disabled={busy||!email||password.length<8} onClick={()=>void signIn(false)}>Sign in</Button><Button disabled={busy||!email||password.length<8} onClick={()=>void signIn(true)}>Create account</Button></div></div>
    </section>:<>
      <section className="sync-section">
        <div className="sync-section-head"><div><span className="eyebrow">Account</span><h2>{session.email??'Authenticated user'}</h2></div><Button onClick={()=>void syncService.signOut().then(()=>{setWorkspaces([]);setDevices([]);setMessage('Signed out. Local Folio data was not changed.')})}>Sign out</Button></div>
        <div className="sync-account-meta"><span>User {session.userId.slice(0,8)}…</span><span>Cloud credentials are device-local</span></div>
      </section>

      <section className="sync-section">
        <div className="sync-section-head"><div><span className="eyebrow">Cloud workspace</span><h2>{sync.workspaceName??'Choose or create a workspace'}</h2></div>{sync.workspaceId?<label className="sync-toggle"><input type="checkbox" checked={sync.enabled} onChange={(e)=>void syncService.setEnabled(e.target.checked)}/><span>Background sync</span></label>:null}</div>
        <div className="sync-workspace-list">{workspaces.map((workspace)=><article className={workspace.id===sync.workspaceId?'is-current':''} key={workspace.id}><div><strong>{workspace.name}</strong><span>{workspace.id.slice(0,8)}… · created {new Date(workspace.created_at).toLocaleDateString()}</span></div>{workspace.id===sync.workspaceId?<em>Connected</em>:<Button disabled={busy} onClick={()=>void connect(workspace)}>Connect</Button>}</article>)}{!workspaces.length?<p>No cloud workspace exists for this account yet.</p>:null}</div>
        <div className="sync-create-workspace"><input value={workspaceName} maxLength={120} onChange={(e)=>setWorkspaceName(e.target.value)} placeholder="Workspace name"/><Button disabled={busy||!workspaceName.trim()} onClick={()=>void createWorkspace()}>Create cloud workspace</Button></div>
      </section>

      {sync.workspaceId?<section className="sync-section">
        <div className="sync-section-head"><div><span className="eyebrow">This device</span><h2>{sync.deviceName}</h2></div><Button variant="primary" disabled={busy||sync.phase==='syncing'||!sync.online} onClick={()=>void syncNow()}>{sync.phase==='syncing'?'Syncing…':'Sync now'}</Button></div>
        <div className="sync-device-form"><input value={deviceName} maxLength={120} onChange={(e)=>setDeviceName(e.target.value)}/><Button disabled={busy||!deviceName.trim()||deviceName===sync.deviceName} onClick={()=>void syncService.setDeviceName(deviceName).then(()=>setMessage('Device name updated.'))}>Rename device</Button></div>
        {sync.lastError?<div className="sync-error-detail">{sync.lastError}</div>:null}
        {sync.oversizedAttachmentCount?<div className="sync-warning"><strong>{sync.oversizedAttachmentCount} large attachment{sync.oversizedAttachmentCount===1?'':'s'} remain device-local.</strong><span>D18 syncs attachment files up to {bytes(MAX_SYNC_ATTACHMENT_BYTES)} each. The rest of the task/note still syncs normally.</span></div>:null}
      </section>:null}

      {conflicts.length?<section className="sync-section">
        <div className="sync-section-head"><div><span className="eyebrow">Conflict resolution</span><h2>{conflicts.length} concurrent change{conflicts.length===1?'':'s'}</h2></div></div>
        <p className="sync-explainer">Folio never silently overwrites concurrent edits. Pick the version to keep; the loser remains recoverable through normal backups if you exported one.</p>
        <div className="sync-conflict-list">{conflicts.map((conflict)=><article key={conflict.id}><header><div><span>{conflict.entityType}</span><strong>{conflictTitle(conflict)}</strong></div><time>{new Date(conflict.detectedAt).toLocaleString()}</time></header><div className="sync-conflict-versions"><div><span>This device</span><p>{payloadSummary(conflict.localPayload,!conflict.localPayload)}</p><Button disabled={busy} onClick={()=>void resolve(conflict.id,'local')}>Keep this device</Button></div><div><span>Cloud</span><p>{payloadSummary(conflict.remotePayload,conflict.remoteDeleted)}</p><Button disabled={busy} onClick={()=>void resolve(conflict.id,'cloud')}>Use cloud</Button></div></div></article>)}</div>
      </section>:null}

      {sync.workspaceId?<div className="sync-two-col">
        <section className="sync-section"><div className="sync-section-head"><div><span className="eyebrow">Pending queue</span><h2>{queue.length} changes</h2></div></div><div className="sync-queue-list">{recentQueue.map((item)=><div key={item.id}><span>{item.operation}</span><strong>{item.entityType} · {item.entityId.slice(0,18)}</strong><em>{item.attempts?item.attempts+' retries':'Queued'}</em></div>)}{!queue.length?<p>No local changes are waiting.</p>:null}</div></section>
        <section className="sync-section"><div className="sync-section-head"><div><span className="eyebrow">Devices</span><h2>{devices.length} known device{devices.length===1?'':'s'}</h2></div><Button onClick={()=>void refreshCloudLists()}>Refresh</Button></div><div className="sync-device-list">{devices.map((device)=><div className={device.device_id===sync.deviceId?'is-current':''} key={device.device_id}><strong>{device.name}</strong><span>{device.device_id===sync.deviceId?'This device · ':''}seen {new Date(device.last_seen_at).toLocaleString()}</span></div>)}{!devices.length?<p>Devices appear after their first successful sync.</p>:null}</div></section>
      </div>:null}

      {sync.workspaceId?<section className="sync-section sync-danger">
        <div className="sync-section-head"><div><span className="eyebrow">Recovery</span><h2>Forget this device's sync baseline</h2></div></div>
        <p className="sync-explainer">This does not delete planner data or cloud data. It clears this device's revision baseline, queue, cursor, and conflicts. The next sync performs a fresh merge and may surface conflicts.</p>
        <Button onClick={()=>{if(window.confirm('Forget this device sync baseline and re-merge on next sync?'))void syncService.resetDeviceSyncState().then(()=>setMessage('Local sync baseline cleared.'))}}>Reset device sync state</Button>
      </section>:null}
    </>}
  </div>
}
