import { useState } from 'react';
import { createFolioHubDailySummary, FOLIO_HUB_DEVICE_MESSAGE } from '../services/folioHubDailySummary';
import { FOLIO_HUB_LIVE_GRANT_KEY } from '../services/folioHubTaskRead';
import { FOLIO_HUB_TASK_ACTION_MESSAGE, FOLIO_HUB_TASK_WRITE_GRANT_KEY } from '../services/folioHubTaskActions';
import './folioHubBridge.css';

const REQUEST = /^[0-9a-f]{32}$/;

/** Exact Hub routes permitted to request the existing one-time source summary.
 * No wildcard pathname matching or cross-origin grants. */
function approvedHubOpener(): boolean {
  if (!window.opener || window.opener === window) return false;
  return window.opener.location.origin === window.location.origin &&
    (window.opener.location.pathname === '/' || window.opener.location.pathname === '/home/tasks/');
}
function bridgeRequest(): string | null {
  try {
    const url = new URL(window.location.href);
    const request = url.searchParams.get('hubBridge');
    if (!request || !REQUEST.test(request)) return null;
    url.searchParams.delete('hubBridge');
    // No private request token in browser history, Referer or service worker caches.
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    if (location.origin !== 'https://thiepn.dev' && !['localhost', '127.0.0.1'].includes(location.hostname)) return null;
    if (!approvedHubOpener()) return null;
    return request;
  } catch { return null; }
}

export function FolioHubBridge() {
  const [request] = useState(bridgeRequest);
  const [status, setStatus] = useState<'ready' | 'busy' | 'sent'>('ready');
  const [error, setError] = useState('');
  if (!request) return null;
  const tasksOpener = (() => { try { return window.opener?.location.pathname === '/home/tasks/' } catch { return false } })();
  async function share(mode: 'once' | 'live') {
    if (status !== 'ready') return;
    setError('');
    setStatus('busy');
    try {
      const snapshot = await createFolioHubDailySummary();
      if (!window.opener || window.opener.closed || !approvedHubOpener()) throw new Error('Hub is no longer available.');
      let liveGrant: string | null = null;
      if(mode === 'live' && tasksOpener) {
        // Only the Folio-approved click can provision an ephemeral task-read
        // capability. The source iframe independently validates this marker.
        liveGrant = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          byte => byte.toString(16).padStart(2,'0')).join('');
        window.opener.sessionStorage.setItem(FOLIO_HUB_LIVE_GRANT_KEY,JSON.stringify({
          grant:liveGrant,expiresAt:Date.now()+2*60*60_000,
        }));
      }
      window.opener.postMessage({
        type: FOLIO_HUB_DEVICE_MESSAGE, nonce: request, snapshot,
        ...(liveGrant ? {liveTasks:true,liveGrant} : {}),
      }, window.location.origin);
      setStatus('sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the Folio summary.');
      setStatus('ready');
    }
  }
  return <div className="folio-hub-backdrop" role="presentation">
    <section className="folio-hub-dialog" role="dialog" aria-modal="true" aria-labelledby="folio-hub-title">
      <p className="folio-hub-eyebrow">Folio → THIEPN Hub</p>
      <h1 id="folio-hub-title">Share today’s Folio summary?</h1>
      <p>Only the titles and basic status of today's tasks, upcoming time blocks, recent note titles, and habit check-ins will be shared with the Hub tab.</p>
      <p><strong>Not shared:</strong> note bodies, attachments, descriptions, comments, passwords, tokens, cloud records, grading history or entire exports.</p>
      <p>The one-time snapshot remains in the Hub tab only. It does not enable cloud access or write to Folio.</p>
      {tasksOpener && <p>Optional: allow Hub to read task titles and dates from this device again while this Hub tab stays open. Hub refreshes automatically; revoke with “Disconnect” in Hub. Closing the tab ends the live connection. No cloud synchronization or task edits.</p>}
      {error && <p role="alert" className="folio-hub-error">{error}</p>}
      {status === 'sent' ? <p role="status">Summary sent. You can close this tab and return to Hub.</p> :
        <div className="folio-hub-actions">
          {tasksOpener && <button type="button" disabled={status === 'busy'} onClick={() => void share('live')}>Keep Hub tasks updated in this tab</button>}
          <button type="button" disabled={status === 'busy'} onClick={() => void share('once')}>
            {status === 'busy' ? 'Reading Folio…' : 'Share summary once'}
          </button>
          <button type="button" className="folio-hub-secondary" onClick={() => window.close()}>Cancel</button>
        </div>}
    </section>
  </div>;
}

/** Separate opt-in permission for modifying Folio tasks from an existing Hub
 * live-read tab. The Stage 1B read grant never implies permission to write. */
function taskWriteRequest():string|null {
  try {
    const url=new URL(location.href)
    const nonce=url.searchParams.get('hubTaskWrite')
    if(!nonce||!REQUEST.test(nonce))return null
    url.searchParams.delete('hubTaskWrite')
    history.replaceState(history.state,'',url.pathname+url.search+url.hash)
    if(location.origin!=='https://thiepn.dev'&&!['localhost','127.0.0.1'].includes(location.hostname))return null
    if(!approvedHubOpener()||window.opener!.location.pathname!=='/home/tasks/')return null
    return nonce
  }catch{return null}
}
export function FolioHubWriteConsent(){
  const [nonce]=useState(taskWriteRequest)
  const [status,setStatus]=useState<'ready'|'busy'|'sent'>('ready')
  const [error,setError]=useState('')
  if(!nonce)return null
  function approve(){
    if(status!=='ready')return
    setStatus('busy')
    setError('')
    try{
      if(!window.opener||window.opener.closed||!approvedHubOpener()||
         window.opener.location.pathname!=='/home/tasks/')throw Error('Hub is unavailable')
      const read=JSON.parse(window.opener.sessionStorage.getItem(FOLIO_HUB_LIVE_GRANT_KEY)||'null')
      if(!read||typeof read.grant!=='string'||!REQUEST.test(read.grant)||
         typeof read.expiresAt!=='number'||Date.now()>=read.expiresAt)
        throw Error('First connect the live task reader in Hub')
      const writeGrant=Array.from(crypto.getRandomValues(new Uint8Array(16)),
        byte=>byte.toString(16).padStart(2,'0')).join('')
      window.opener.sessionStorage.setItem(FOLIO_HUB_TASK_WRITE_GRANT_KEY,JSON.stringify({
        grant:writeGrant,readGrant:read.grant,expiresAt:Math.min(read.expiresAt,Date.now()+60*60_000),
      }))
      window.opener.postMessage({
        type:FOLIO_HUB_TASK_ACTION_MESSAGE+':consent',nonce,writeGrant,readGrant:read.grant,
      },location.origin)
      setStatus('sent')
    }catch(err){
      setError(err instanceof Error?err.message:'Could not authorize Folio task actions')
      setStatus('ready')
    }
  }
  return <div className="folio-hub-backdrop" role="presentation">
    <section className="folio-hub-dialog" role="dialog" aria-modal="true" aria-labelledby="folio-hub-write-title">
      <p className="folio-hub-eyebrow">Folio → THIEPN Hub</p>
      <h1 id="folio-hub-write-title">Allow Hub to change Folio tasks?</h1>
      <p>This separate permission lets this Hub Tasks tab <strong>create, complete, reopen and reschedule</strong> actual Folio tasks. Folio retains ownership, recurrence rules and its existing local database.</p>
      <p>Actions can trigger existing Folio recurrence and automation behavior. Review dates and titles before submitting. Permission expires within one hour or on Hub disconnect. No cloud permission is granted.</p>
      <p><strong>Not enabled:</strong> deleting tasks, changing reminders directly, moving projects, importing or exporting data.</p>
      {error&&<p role="alert" className="folio-hub-error">{error}</p>}
      {status==='sent'?<p role="status">Task actions authorized for this Hub tab. Return to Hub.</p>:
        <div className="folio-hub-actions">
          <button type="button" disabled={status==='busy'} onClick={approve}>Allow task actions in Hub</button>
          <button type="button" className="folio-hub-secondary" onClick={()=>window.close()}>Cancel</button>
        </div>}
    </section>
  </div>
}
