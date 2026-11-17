import type { HubTaskActionResult } from './folioHubTaskActions'

/** Tab-scoped command receipt journal. It stores only IDs, hashes and outcomes:
 * no task titles, descriptions, auth tokens, or database schema changes.
 * A PENDING entry is intentionally never retried automatically, because the
 * source might have committed before its iframe/browser terminated. */
export const FOLIO_HUB_TASK_RECEIPTS_KEY = 'folio:hub:task-command-receipts:v1'
type Receipt = { requestId:string;hash:string;state:'pending'|'done';
  expiresAt:number;result?:HubTaskActionResult }
const MAX_RECEIPTS=80
const TTL_MS=65*60_000

async function hashRequest(grant:string, action:unknown):Promise<string>{
  const data=new TextEncoder().encode(JSON.stringify([grant,action]))
  const buffer=await crypto.subtle.digest('SHA-256',data)
  return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('')
}
function loadReceipts(now:number):Receipt[]{
  const stored=JSON.parse(sessionStorage.getItem(FOLIO_HUB_TASK_RECEIPTS_KEY)||'[]') as unknown
  if(!Array.isArray(stored))throw Error('Invalid command receipt journal')
  return stored.filter((x):x is Receipt=>{
    if(!x||typeof x!=='object')return false
    const r=x as Partial<Receipt>
    return typeof r.requestId==='string'&&typeof r.hash==='string'&&
      (r.state==='pending'||r.state==='done')&&typeof r.expiresAt==='number'&&
      r.expiresAt>now && r.expiresAt<=now+TTL_MS
  }).slice(-MAX_RECEIPTS)
}
function saveReceipts(records:Receipt[]){
  sessionStorage.setItem(FOLIO_HUB_TASK_RECEIPTS_KEY,JSON.stringify(records.slice(-MAX_RECEIPTS)))
}
const uncertain:HubTaskActionResult={
  ok:false,code:'unavailable',
  message:'A prior task action may already have run. Open Folio to verify; do not retry blindly',
}
export async function claimFolioTaskCommand(grant:string,requestId:string,action:unknown):Promise<
  |{kind:'new';hash:string}
  |{kind:'replay';result:HubTaskActionResult}
  |{kind:'unknown';result:HubTaskActionResult}
  |{kind:'mismatch';result:HubTaskActionResult}
>{
  const hash=await hashRequest(grant,action)
  const now=Date.now()
  const records=loadReceipts(now)
  const previous=records.find(x=>x.requestId===requestId)
  if(previous){
    if(previous.hash!==hash)return {kind:'mismatch',
      result:{ok:false,code:'invalid',message:'Request ID reused for a different Folio action'}}
    if(previous.state==='pending'||!previous.result)return {kind:'unknown',result:uncertain}
    // The last in-memory Undo closure is not recoverable after iframe restart.
    return {kind:'replay',result:previous.result.ok?
      {...previous.result,undoId:undefined,message:'Previously applied in Folio; undo is not available after reconnect'}:
      previous.result}
  }
  records.push({requestId,hash,state:'pending',expiresAt:now+TTL_MS})
  saveReceipts(records)
  return {kind:'new',hash}
}
export function recordFolioTaskCommand(requestId:string,hash:string,result:HubTaskActionResult):void{
  // "Unavailable" can mean an interrupted automation after the task write.
  // Preserve PENDING so a restarted reader never replays a possibly applied write.
  if(!result.ok&&result.code==='unavailable')return
  const records=loadReceipts(Date.now())
  const current=records.find(x=>x.requestId===requestId&&x.hash===hash)
  if(!current||current.state!=='pending')throw Error('Command receipt was lost')
  current.state='done'
  current.result=result
  saveReceipts(records)
}
