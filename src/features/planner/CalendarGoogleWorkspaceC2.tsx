import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { timeBlockRepository } from '../../repositories/timeBlockRepository'
import { calendarGoogleStoreC2, type GoogleConflictChoiceC2 } from '../../services/calendarGoogleStoreC2'
import { googleSourceKey } from '../../services/calendarGoogleC2'

/** Local review and consent decisions only; no Account/Core Calendar grant exists. */
export function CalendarGoogleWorkspaceC2(){
  const [calendarId,setCalendarId]=useState('primary')
  const [confirmedId,setConfirmedId]=useState('primary')
  const [chosenBlock,setChosenBlock]=useState('')
  const [selectedMirror,setSelectedMirror]=useState('')
  const [rename,setRename]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [disconnectMode,setDisconnectMode]=useState<'preserve-as-folio'|'remove-mirror'>('preserve-as-folio')
  const status=useLiveQuery(()=>calendarGoogleStoreC2.status(confirmedId),[confirmedId])
  const pending=useLiveQuery(()=>calendarGoogleStoreC2.pending(confirmedId),[confirmedId],[])
  const conflicts=useLiveQuery(()=>calendarGoogleStoreC2.conflicts(confirmedId),[confirmedId],[])
  const allBlocks=useLiveQuery(()=>timeBlockRepository.listAll(),[],[])
  const nativeEvents=allBlocks.filter(b=>b.kind==='event'&&b.source==='folio'&&!b.taskId)
  const remoteEvents=allBlocks.filter(b=>b.source==='google'&&b.sourceCalendar===googleSourceKey(confirmedId))
  const selectedNative=nativeEvents.find(b=>b.id===chosenBlock)
  const selectedRemote=remoteEvents.find(b=>b.id===selectedMirror)
  async function act(action:()=>Promise<void>){
    if(busy)return
    setBusy(true);setNotice('');setError('')
    try{await action()}catch(reason){setError(reason instanceof Error?reason.message:'Local calendar operation failed.')}
    finally{setBusy(false)}
  }
  const hasMirror=Boolean(status?.hasCursor||remoteEvents.length||pending.length||conflicts.length)
  return <section className="calendar-google-workspace" aria-label="Google Calendar local workspace">
    <header><span className="eyebrow">Google Calendar</span><strong>Local preparation · disconnected</strong></header>
    <p>No Google access has been granted. Staging an export does not send anything, and Account sign-in is not a Calendar permission. Core's authenticated Calendar gateway must be reviewed and deployed separately.</p>
    <label>Target Google calendar ID
      <span className="calendar-google-workspace__field">
        <input value={calendarId} maxLength={190} onChange={event=>setCalendarId(event.target.value)} aria-label="Google calendar ID"/>
        <button type="button" disabled={busy||!calendarId.trim()} onClick={()=>{setConfirmedId(calendarId.trim());setSelectedMirror('');setNotice('Local target selected; no Google connection was opened.')}}>Inspect local target</button>
      </span>
    </label>
    <p role="status">Target: {confirmedId} · {remoteEvents.length} mirrored events · {pending.length} unsent operations · {conflicts.length} conflicts · cursor {status?.hasCursor?'stored locally':'not available'}.</p>
    <div className="calendar-google-workspace__section">
      <strong>Prepare event export</strong>
      <label>Folio event
        <select aria-label="Folio event to prepare for Google" value={chosenBlock} onChange={event=>setChosenBlock(event.target.value)}>
          <option value="">Choose a Folio event…</option>
          {nativeEvents.slice(0,100).map(block=><option key={block.id} value={block.id}>{block.title} · {new Date(block.start).toLocaleDateString()}</option>)}
        </select>
      </label>
      {selectedNative?<small>{selectedNative.title} · {new Date(selectedNative.start).toLocaleString()} — source remains Folio.</small>:null}
      <button type="button" disabled={busy||!selectedNative} onClick={()=>void act(async()=>{
        const intent=await calendarGoogleStoreC2.queueCreate(selectedNative!.id,confirmedId)
        setNotice('Prepared local unsent export '+intent.clientMutationId.slice(0,8)+'. No event was sent.')
      })}>Prepare local export (not sent)</button>
    </div>
    {remoteEvents.length?<div className="calendar-google-workspace__section">
      <strong>Existing mirrored events</strong>
      <label>Mirrored event
        <select aria-label="Google mirrored event" value={selectedMirror} onChange={event=>{setSelectedMirror(event.target.value);setRename('')}}>
          <option value="">Choose imported event…</option>
          {remoteEvents.slice(0,100).map(block=><option key={block.id} value={block.id}>{block.title}</option>)}
        </select>
      </label>
      {selectedRemote?<><label>Proposed title change (not sent)
        <input maxLength={300} value={rename} onChange={event=>setRename(event.target.value)} placeholder={selectedRemote.title} />
      </label>
      <div className="calendar-google-workspace__actions">
        <button type="button" disabled={busy||!rename.trim()||rename.trim()===selectedRemote.title}
          onClick={()=>void act(async()=>{
            await calendarGoogleStoreC2.queueChange(confirmedId,selectedRemote.id,'update',{summary:rename.trim()})
            setNotice('Google update prepared, not dispatched.')
          })}>Prepare update</button>
        <button type="button" disabled={busy} onClick={()=>void act(async()=>{
          if(!window.confirm('Queue a local, unsent Google delete request? The event remains visible until authorized server acknowledgement.'))return
          await calendarGoogleStoreC2.queueChange(confirmedId,selectedRemote.id,'delete')
          setNotice('Google delete prepared, not dispatched.')
        })}>Prepare delete</button>
      </div></>:null}
    </div>:null}
    {pending.length?<div className="calendar-google-workspace__section" aria-label="Google pending operations">
      <strong>Awaiting gateway · {pending.length}</strong>
      {pending.map(item=><div className="calendar-google-workspace__item" key={item.id}>
        <span>{item.operation} · {item.providerKey?.slice(0,40)??'Folio event'} · {new Date(item.createdAt).toLocaleString()}</span>
        <button type="button" disabled={busy} onClick={()=>void act(async()=>{await calendarGoogleStoreC2.cancelPending(confirmedId,item.id);setNotice('Unsent operation cancelled.')})}>Cancel unsent</button>
      </div>)}
    </div>:null}
    {conflicts.length?<div className="calendar-google-workspace__section" aria-label="Google conflicts">
      <strong>Conflicts requiring a decision · {conflicts.length}</strong>
      {conflicts.map(item=><div className="calendar-google-workspace__item" key={item.key}>
        <span>{item.remote?.summary??'Removed by provider'} · {item.reason}</span>
        <div className="calendar-google-workspace__actions">
          {([['accept-provider','Accept provider'],['keep-local-copy','Keep Folio copy']] as [GoogleConflictChoiceC2,string][]).map(([value,label])=><button key={value} type="button" disabled={busy}
            onClick={()=>void act(async()=>{
              if(!window.confirm(value==='keep-local-copy'?'Keep the current local version as a new Folio event and accept the provider version?':'Replace the local mirror with the provider version?'))return
              const result=await calendarGoogleStoreC2.resolve(confirmedId,item.key,value)
              setNotice(result.copiedId?'Preserved a separate Folio event and accepted the provider version.':'Accepted provider version.')
            })}>{label}</button>)}
        </div>
      </div>)}
    </div>:null}
    {hasMirror?<div className="calendar-google-workspace__section">
      <strong>Disconnect local mirror</strong>
      <p>This affects this device only. It does NOT revoke a Google OAuth consent or disconnect a real Core connector.</p>
      <label>How to handle mirrored events
        <select value={disconnectMode} onChange={event=>setDisconnectMode(event.target.value as typeof disconnectMode)}>
          <option value="preserve-as-folio">Keep separate Folio copies</option>
          <option value="remove-mirror">Remove source-owned local copies</option>
        </select>
      </label>
      <button type="button" disabled={busy||Boolean(pending.length)} onClick={()=>void act(async()=>{
        if(!window.confirm('Clear local Google mirror and cursor? No remote Google access will be revoked.'))return
        const result=await calendarGoogleStoreC2.disconnectLocal(confirmedId,disconnectMode,status?.revision??0)
        setSelectedMirror('')
        setNotice('Local mirror cleared. '+result.retained+' independent Folio events kept. Google authorization unchanged.')
      })}>Disconnect local mirror</button>
      {pending.length?<small>Cancel unsent operations before disconnecting.</small>:null}
    </div>:null}
    {!hasMirror?<small>No provider mirror or saved Google cursor for this target. Reconnection requires a real Account/Core permission flow, which is not available here.</small>:null}
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
  </section>
}
