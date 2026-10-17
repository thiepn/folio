import { useEffect, useState } from 'react'
import { validateDisciplineCommand, type DisciplineCommand } from '../../services/disciplineCommandGate'
import { readFolioHubActionPreview,type FolioActionPreview } from '../../services/folioHubActionPreview'
import { applyNativeReviewedDisciplineAction } from '../../services/nativeDisciplineActions'

const HUB='https://thiepn.dev'
const NONCE=/^[a-f0-9]{32}$/
const READY='thiepn:folio-fd1-ready:v1'
const COMMAND='thiepn:folio-fd1-command:v1'
const RECEIPT='thiepn:folio-fd1-receipt:v1'

/** Native, one-time approval. Hub cannot write local Folio records. */
export function FolioHubActionPrompt(){
  const [nonce]=useState<string|null>(()=>{
    if(typeof window==='undefined'||location.origin!==HUB||!window.opener)return null
    const v=new URLSearchParams(location.search).get('fd1Action')
    return v&&NONCE.test(v)?v:null
  })
  const [command,setCommand]=useState<DisciplineCommand|null>(null)
  const [preview,setPreview]=useState<FolioActionPreview|null>(null)
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const [done,setDone]=useState(false)
  useEffect(()=>{
    if(!nonce||done||!window.opener)return
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==window.opener||event.origin!==HUB||!event.data||
        event.data.type!==COMMAND||event.data.nonce!==nonce)return
      const request=validateDisciplineCommand(event.data.command)
      if(!request||request.idempotencyKey!==nonce||
        !['habit.complete','habit.reopen','focus.finish'].includes(request.operation))return
      setCommand(old=>old??request)
    }
    window.addEventListener('message',onMessage)
    window.opener.postMessage({type:READY,nonce},HUB)
    return ()=>window.removeEventListener('message',onMessage)
  },[nonce,done])
  useEffect(()=>{
    if(!command||done)return
    let active=true
    readFolioHubActionPreview(command).then(found=>{
      if(active)setPreview(found)
    }).catch(()=>{if(active){setPreview(null);setStatus('Original Folio record is unavailable.')}})
    return ()=>{active=false}
  },[command,done])
  if(!nonce)return null
  const respond=async(approve:boolean)=>{
    if(!command||busy||done)return
    setBusy(true)
    try {
      const receipt=approve?await applyNativeReviewedDisciplineAction(command,async()=>true):
        {idempotencyKey:command.idempotencyKey,resourceId:command.resourceId,
         operation:command.operation,result:'denied' as const}
      setStatus(receipt?.result==='applied'?'Original Folio action applied. Refresh Hub to see the updated source.':
        receipt?.result==='conflict'?'The original Folio record changed. No stale request was applied.':
        receipt?.result==='denied'?'Declined. Nothing changed.':'Original Folio record is unavailable. Nothing changed.')
      window.opener?.postMessage({type:RECEIPT,nonce,receipt,
        observedAt:new Date().toISOString()},HUB)
    } catch {setStatus('The Folio owner action failed. Check the original record; no success was reported.')}
    finally {
      setBusy(false);setDone(true)
      const url=new URL(location.href)
      url.searchParams.delete('fd1Action')
      history.replaceState(history.state,'',url.pathname+url.search+url.hash)
    }
  }
  return <section role="region" aria-label="Review requested Folio action" style={{
    margin:'.5rem 1rem',padding:'1rem',border:'2px solid currentColor',
    display:'grid',gap:'.65rem',background:'var(--surface,transparent)'}}>
    <h2 style={{margin:0,fontSize:'1rem'}}>Review a requested original Folio action</h2>
    {!command?<p>Waiting for a one-time request from the Hub tab. No original records have been changed.</p>:<>
      <p>Original source: <strong>{preview?.title??'Unavailable record'}</strong></p>
      <p>Requested action: <strong>{command.operation}</strong> · current status: {preview?.status??'unknown'}</p>
      <p>Owner revision: {preview?.updatedAt??'unavailable'}. {preview?.updatedAt!==command.expectedUpdatedAt?
        'The previously shared version is stale; refresh Hub before acting.':
        'The source revision will be rechecked atomically at write time.'}</p>
      {!done&&<div style={{display:'flex',flexWrap:'wrap',gap:'.7rem'}}>
        <button type="button" disabled={busy||!preview?.available||
          preview?.updatedAt!==command.expectedUpdatedAt} onClick={()=>void respond(true)}>
          {busy?'Applying in original Folio…':'Approve this Folio action once'}
        </button>
        <button type="button" disabled={busy} onClick={()=>void respond(false)}>Decline</button>
      </div>}
    </>}
    {status&&<p role="status">{status}</p>}
    <small>Hub cannot directly edit Folio. Original record IDs and revisions remain with Folio; no cross-origin token or progress is placed in the launch URL.</small>
  </section>
}
