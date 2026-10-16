import { useEffect, useState } from 'react';
import { createFolioHubDailySummary, FOLIO_HUB_DEVICE_MESSAGE } from '../services/folioHubDailySummary';
import './folioHubBridge.css';

const REQUEST = /^[0-9a-f]{32}$/;
function bridgeRequest(): string | null {
  try {
    const url = new URL(window.location.href);
    const request = url.searchParams.get('hubBridge');
    if (!request || !REQUEST.test(request)) return null;
    url.searchParams.delete('hubBridge');
    // No private request token in browser history, Referer or service worker caches.
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    if (location.origin !== 'https://thiepn.dev' && location.hostname !== 'localhost') return null;
    if (!window.opener || window.opener === window) return null;
    if (window.opener.location.origin !== location.origin || window.opener.location.pathname !== '/') return null;
    return request;
  } catch { return null; }
}

export function FolioHubBridge() {
  const [request] = useState(bridgeRequest);
  const [status, setStatus] = useState<'ready' | 'busy' | 'sent'>('ready');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!request) return;
    const cancel = () => { /* This bridge never schedules unattended sharing. */ };
    window.addEventListener('pagehide', cancel);
    return () => window.removeEventListener('pagehide', cancel);
  }, [request]);
  if (!request) return null;
  async function share() {
    if (status !== 'ready') return;
    setError('');
    setStatus('busy');
    try {
      const snapshot = await createFolioHubDailySummary();
      if (!window.opener || window.opener.closed || window.opener.location.origin !== window.location.origin ||
          window.opener.location.pathname !== '/') throw new Error('Hub is no longer available.');
      window.opener.postMessage({
        type: FOLIO_HUB_DEVICE_MESSAGE, nonce: request, snapshot,
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
      <p>The snapshot remains in the current Hub tab only. It does not enable automatic cloud access or write anything to Folio.</p>
      {error && <p role="alert" className="folio-hub-error">{error}</p>}
      {status === 'sent' ? <p role="status">Summary sent. You can close this tab and return to Hub.</p> :
        <div className="folio-hub-actions">
          <button type="button" disabled={status === 'busy'} onClick={() => void share()}>
            {status === 'busy' ? 'Reading Folio…' : 'Share summary once'}
          </button>
          <button type="button" className="folio-hub-secondary" onClick={() => window.close()}>Cancel</button>
        </div>}
    </section>
  </div>;
}
