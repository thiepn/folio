import { useState } from 'react'
import { parseHubShareNonce, shareFolioDailyOnClick } from '../../services/folioHubDailyShare'

/**
 * Explicit local-source approval. A query parameter alone never authorizes
 * sharing. Only an opened Folio tab on https://thiepn.dev may send the bounded
 * original-record projection to its existing Hub opener.
 */
export function FolioHubSharePrompt() {
  const [nonce,setNonce]=useState(()=>typeof window==='undefined'?null:
    parseHubShareNonce(window.location.search,window.location.origin,Boolean(window.opener)))
  const [busy,setBusy]=useState(false)
  const [status,setStatus]=useState('')
  if(!nonce)return null
  const clear=()=>{
    setNonce(null)
    const url=new URL(window.location.href)
    url.searchParams.delete('hubBridge')
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
  }
  const share=async()=>{
    if(busy||!nonce)return
    setBusy(true)
    try{
      const sent=await shareFolioDailyOnClick(nonce,window.opener)
      if(sent){setStatus('Shared a single bounded Folio summary with the original Hub opener.');clear()}
      else setStatus('Sharing is unavailable. No data was sent.')
    }catch {setStatus('Could not read or send the original Folio records. No source data was changed.')}
    finally{setBusy(false)}
  }
  return <section aria-label="One-time THIEPN Hub sharing" role="region" style={{
    border:'2px solid currentColor',padding:'1rem',margin:'.5rem 1rem',display:'grid',
    gap:'.7rem',background:'var(--surface,transparent)'}}>
    <h2 style={{fontSize:'1rem',margin:0}}>Share a Folio summary with THIEPN Hub?</h2>
    <p style={{margin:0}}>This shares only selected task titles, upcoming time blocks, recent note titles, and original habit statuses. Note bodies, private focus notes and account credentials are never shared. This approval expires after this one click.</p>
    {status&&<p role="status">{status}</p>}
    <div style={{display:'flex',gap:'.6rem',flexWrap:'wrap'}}>
      <button type="button" disabled={busy} onClick={()=>void share()}>{busy?'Reading original Folio data…':'Share once with Hub'}</button>
      <button type="button" disabled={busy} onClick={clear}>Cancel</button>
    </div>
  </section>
}
