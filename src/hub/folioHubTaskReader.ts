import { createFolioHubTaskRead, FOLIO_HUB_TASK_READ_MESSAGE, FOLIO_HUB_LIVE_GRANT_KEY } from '../services/folioHubTaskRead'
import { FOLIO_HUB_TASK_ACTION_MESSAGE, FOLIO_HUB_TASK_WRITE_GRANT_KEY,
  FolioHubTaskActions, type HubTaskActionResult } from '../services/folioHubTaskActions'
import { claimFolioTaskCommand, recordFolioTaskCommand } from '../services/folioHubTaskReceipts'
import { createFolioHubTaskQuery, FOLIO_HUB_TASK_QUERY_MESSAGE } from '../services/folioHubTaskQuery'

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
  const requested=url.searchParams.get('hubTasksRead')
  url.searchParams.delete('hubTasksRead')
  // Do not expose the approved grant in a URL, Referer, or server access log.
  // It remains only in Folio-issued, same-tab session storage.
  let nonce:string|null=null
  try {
    const saved=JSON.parse(sessionStorage.getItem(FOLIO_HUB_LIVE_GRANT_KEY)||'null')
    if(saved && typeof saved.grant==='string' && NONCE.test(saved.grant) &&
       typeof saved.expiresAt==='number' && Date.now()<saved.expiresAt)nonce=saved.grant
  } catch { /* Fail closed. */ }
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
    approved=requested==='1' && !!nonce && NONCE.test(nonce) && window.parent!==window &&
      (location.origin==='https://thiepn.dev' || ['localhost','127.0.0.1'].includes(location.hostname)) &&
      parent.location.origin===location.origin && parent.location.pathname==='/home/tasks/' &&
      approvedGrant()
  } catch { approved=false }
  if(!approved || !nonce) return
  const root=document.getElementById('root')
  if(root) root.textContent='Folio read-only task source'
  let busy=false
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==parent || !event.data ||
      event.data.type!==FOLIO_HUB_TASK_READ_MESSAGE+':read' || event.data.nonce!==nonce ||
      typeof event.data.requestId!=='string' || !REQUEST.test(event.data.requestId) || busy) return
    let originStillValid=false
    try {originStillValid=parent.location.origin===location.origin && parent.location.pathname==='/home/tasks/'}catch{}
    if(!originStillValid||!approvedGrant())return
    const requestId=event.data.requestId as string
    busy=true
    void createFolioHubTaskRead().then(snapshot=>{
      parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':result',nonce,requestId,snapshot},location.origin)
    }).catch(()=>{
      parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':error',nonce,requestId},location.origin)
    }).finally(()=>{busy=false})
  })
  // On-demand read-only pages. Every request is independently consent
  // checked, bounded, and tied to the same approved reader iframe.
  let activeQueries=0
  window.addEventListener('message',event=>{
    const data=event.data
    if(event.origin!==location.origin||event.source!==parent||!data||
       data.type!==FOLIO_HUB_TASK_QUERY_MESSAGE+':read'||data.nonce!==nonce||
       typeof data.requestId!=='string'||!REQUEST.test(data.requestId))return
    let parentValid=false
    try{parentValid=parent.location.origin===location.origin&&parent.location.pathname==='/home/tasks/'}catch{}
    if(!parentValid||!approvedGrant())return
    const requestId=data.requestId as string
    if(activeQueries>=3){
      parent.postMessage({type:FOLIO_HUB_TASK_QUERY_MESSAGE+':error',nonce,requestId},location.origin)
      return
    }
    activeQueries++
    void createFolioHubTaskQuery(data.query).then(result=>{
      if(approvedGrant())parent.postMessage({
        type:FOLIO_HUB_TASK_QUERY_MESSAGE+':result',nonce,requestId,result,
      },location.origin)
    }).catch(()=>{
      parent.postMessage({type:FOLIO_HUB_TASK_QUERY_MESSAGE+':error',nonce,requestId},location.origin)
    }).finally(()=>{activeQueries--})
  })
  const taskActions=new FolioHubTaskActions()
  const seen=new Map<string,{input:string;result:HubTaskActionResult}>()
  const pending=new Set<string>()
  let actionBusy=false
  function approvedWriteGrant(provided:unknown):boolean {
    if(typeof provided!=='string'||!NONCE.test(provided)||!approvedGrant())return false
    try {
      const saved=JSON.parse(sessionStorage.getItem(FOLIO_HUB_TASK_WRITE_GRANT_KEY)||'null')
      return saved?.grant===provided && saved?.readGrant===nonce &&
        typeof saved.expiresAt==='number' && Number.isFinite(saved.expiresAt) &&
        Date.now()<saved.expiresAt
    }catch{return false}
  }
  function reply(id:string,writeGrant:string,result:HubTaskActionResult){
    parent.postMessage({
      type:FOLIO_HUB_TASK_ACTION_MESSAGE+':result',nonce,writeGrant,requestId:id,result,
    },location.origin)
  }
  window.addEventListener('message',event=>{
    const data=event.data
    if(event.origin!==location.origin||event.source!==parent||!data||
       data.type!==FOLIO_HUB_TASK_ACTION_MESSAGE+':request'||data.nonce!==nonce||
       typeof data.requestId!=='string'||!REQUEST.test(data.requestId)||
       !approvedWriteGrant(data.writeGrant))return
    let openerValid=false
    try {openerValid=parent.location.origin===location.origin&&parent.location.pathname==='/home/tasks/'}catch{}
    if(!openerValid)return
    const requestId=data.requestId as string
    let serialized:string
    try {serialized=JSON.stringify(data.action)}catch{return}
    if(!serialized||serialized.length>2_000)return
    const previous=seen.get(requestId)
    if(previous){
      reply(requestId,data.writeGrant,previous.input===serialized?previous.result:{
        ok:false,code:'invalid',message:'Request ID was reused with different contents',
      })
      return
    }
    if(pending.has(requestId))return // In-flight duplicate cannot execute twice
    if(actionBusy){
      reply(requestId,data.writeGrant,{ok:false,code:'unavailable',message:'A Folio action is already running'})
      return
    }
    pending.add(requestId)
    actionBusy=true
    const uncertain:HubTaskActionResult={ok:false,code:'unavailable',
      message:'Outcome uncertain. Check Folio before retrying or reopening this task'}
    const run=async()=>{
      // Reader instances in different same-origin tabs cooperate through Web Locks
      // when available. Native Folio UI code does not use this lock, so the
      // source version and side-effect guards remain mandatory.
      let claim:Awaited<ReturnType<typeof claimFolioTaskCommand>>
      try{claim=await claimFolioTaskCommand(data.writeGrant,requestId,data.action)}
      catch{reply(requestId,data.writeGrant,{ok:false,code:'unavailable',
        message:'Safe command receipts are unavailable. Nothing was submitted'});return}
      if(claim.kind!=='new'){
        reply(requestId,data.writeGrant,claim.result)
        return
      }
      let result:HubTaskActionResult
      try{result=await taskActions.execute(data.action)}
      catch{result=uncertain}
      try{recordFolioTaskCommand(requestId,claim.hash,result)}
      catch{
        // A task may have been written, but its receipt was not confirmed.
        // Never acknowledge success or replay it after this failure.
        reply(requestId,data.writeGrant,uncertain)
        return
      }
      seen.set(requestId,{input:serialized,result})
      if(seen.size>80)seen.delete(seen.keys().next().value!)
      reply(requestId,data.writeGrant,result)
    }
    void (async()=>{
      if(typeof navigator.locks?.request==='function')
        await navigator.locks.request('folio-hub-task-command-v1',run)
      else await run()
    })().catch(()=>reply(requestId,data.writeGrant,uncertain)).finally(()=>{
      pending.delete(requestId)
      actionBusy=false
    })
  })
  parent.postMessage({type:FOLIO_HUB_TASK_READ_MESSAGE+':ready',nonce},location.origin)
}
