import { createFolioHubTaskRead, FOLIO_HUB_TASK_READ_MESSAGE, FOLIO_HUB_LIVE_GRANT_KEY } from '../services/folioHubTaskRead'

const NONCE=/^[0-9a-f]{32}$/
const REQUEST=/^[a-zA-Z0-9-]{1,64}$/
/** A source-owned, no-UI, read-only same-origin iframe endpoint.
 * The Hub only creates this frame after a real Folio popup's explicit live consent.
 * This is not an authorization boundary against other same-origin JavaScript:
 * independent Account/cloud access requires its own separately reviewed contract.
 */
export function isFolioHubTaskReaderRequest():boolean {
  return new URL(location.href).searchParams.has('hubTasksRead')
}
export function mountFolioHubTaskReader():void {
  const url=new URL(location.href)
  const nonce=url.searchParams.get('hubTasksRead')
  url.searchParams.delete('hubTasksRead')
  history.replaceState(history.state,'',url.pathname+url.search+url.hash)
  function approvedGrant():boolean {
    if(!nonce)return false
    try {
      const grant=JSON.parse(sessionStorage.getItem(FOLIO_HUB_LIVE_GRANT_KEY)||'null') as
        {grant?:unknown;expiresAt?:unknown}|null
      return !!grant && grant.grant===nonce && typeof grant.expiresAt==='number' &&
        Number.isFinite(grant.expiresAt) && Date.now()<grant.expiresAt
    } catch {return false}
  }
  let approved=false
  try {
    approved=!!nonce && NONCE.test(nonce) && window.parent!==window &&
      (location.origin==='https://thiepn.dev' || ['localhost','127.0.0.1'].includes(location.hostname)) &&
      parent.location.origin===location.origin && parent.location.pathname==='/home/tasks/' &&
      approvedGrant()
  } catch { approved=false }
  if(!approved || !nonce) return
  const root=document.getElementById('root')
  if(root) root.textContent='Folio read-only task source'
  let busy=false
  let lastRead=0
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==parent || !event.data ||
      event.data.type!==FOLIO_HUB_TASK_READ_MESSAGE+':read' || event.data.nonce!==nonce ||
      typeof event.data.requestId!=='string' || !REQUEST.test(event.data.requestId) || busy) return
    let originStillValid=false
    try {originStillValid=parent.location.origin===location.origin && parent.location.pathname==='/home/tasks/'}catch{}
    if(!originStillValid||!approvedGrant())return
    const requestId=event.data.requestId as string
    if(Date.now()-lastRead<900)return
    lastRead=Date.now()
    busy=true
    void createFolioHubTaskRead().then(snapshot=>{
      parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':result',nonce,requestId,snapshot},location.origin)
    }).catch(()=>{
      parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':error',nonce,requestId},location.origin)
    }).finally(()=>{busy=false})
  })
  parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':ready',nonce},location.origin)
}
