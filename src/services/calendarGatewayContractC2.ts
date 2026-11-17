/** Calendar provider gateway contract — a dormant interface, NOT a remote client.
 *
 * Account/Core does not yet expose a Calendar OAuth product. This file must
 * NOT be used to infer that a Google sign-in or Folio Sync token grants access.
 * No fetch, OAuth client ID, redirect, secret, browser token vault, or fake
 * authorization state is installed in Folio by this contract.
 */
import type { GoogleEventC2, GooglePageC2 } from './calendarGoogleC2'
import type { GooglePendingC2 } from './calendarGoogleStoreC2'
import type { TimeBlockEntity } from '../domain/models'
import { googleBlockHash } from './calendarGoogleReconcileC2'
import { googleSourceKey } from './calendarGoogleC2'
export type CalendarGatewayStatusC2 =
  | { state:'unavailable'; reason:'not-deployed'|'not-registered'|'consent-required'|'expired'|'revoked'|'offline' }
  | { state:'connected'; provider:'google'; verifiedAccountUserId:string; calendarId:string;
      grantedCapabilities:('events.read'|'events.write')[]; grantRevision:string; expiresAt?:string }
export interface CalendarGatewayContextC2 {
  /** Core MUST verify the actual Account token, not trust any client-provided identity. */
  accountSubject:string
  connectorId:string
  calendarId:string
  grantRevision:string
  requestId:string
}
export type CalendarGatewayDispatchC2 =
  | { protocol:'thiepn.calendar.c2'; op:'create'; context:CalendarGatewayContextC2;
      idempotencyKey:string; expectedFolioId:string; expectedLocalHash:string;
      event:{summary:string;description?:string;location?:string;start:string;end:string;allDay:boolean;timeZone:string} }
  | { protocol:'thiepn.calendar.c2'; op:'update'; context:CalendarGatewayContextC2;
      idempotencyKey:string; eventId:string; ifMatch:string;
      patch:NonNullable<GooglePendingC2['patch']> }
  | { protocol:'thiepn.calendar.c2'; op:'delete'; context:CalendarGatewayContextC2;
      idempotencyKey:string; eventId:string; ifMatch:string }
export interface CalendarGatewayC2 {
  /** Authenticated operation: no bearer token, KLIPS URL or refresh token returned. */
  status():Promise<CalendarGatewayStatusC2>
  /** Authenticated Google read. The server owns scope, pagination and 410 handling. */
  listEvents(context:CalendarGatewayContextC2, params:{syncToken?:string;pageToken?:string;maxResults:250;singleEvents:true;showDeleted:true}):Promise<GooglePageC2>
  /** Core verifies Account subject, consent, calendar ACL, revision and IF-MATCH. */
  dispatch(input:CalendarGatewayDispatchC2):Promise<{acknowledged:boolean;event:GoogleEventC2|null;serverRevision:string}>
  /** Server-side token revocation or gateway credential removal — not a local reset. */
  disconnect(context:CalendarGatewayContextC2):Promise<{revoked:boolean}>
}
/** Local, inspectable dispatch proposal. An authenticated Core service must
 * construct its own context from a verified session; browser-provided context
 * cannot authorize this or any operation.
 */
export function buildGoogleDispatchProposalC2(
  calendarId:string, pending:GooglePendingC2,
  block:TimeBlockEntity|undefined,ctx:CalendarGatewayContextC2,
):CalendarGatewayDispatchC2 {
  if(!ctx.accountSubject||!ctx.connectorId||!ctx.grantRevision||
    !ctx.requestId||ctx.calendarId!==calendarId)
    throw new Error('Complete verified gateway context is required.')
  if(pending.status!=='awaiting-gateway')throw new Error('Invalid pending Google mutation.')
  if(!/^[a-f0-9-]{36}$/.test(pending.id))throw new Error('Invalid mutation idempotency identity.')
  if(pending.operation==='create'){
    if(!block||block.id!==pending.folioBlockId||block.source!=='folio'||
      block.kind!=='event'||Boolean(block.taskId)||!pending.folioHash||
      pending.folioHash!==googleBlockHash(block))
      throw new Error('The source Folio event changed; cancel and prepare a new proposal.')
    return {protocol:'thiepn.calendar.c2',op:'create',context:ctx,
      idempotencyKey:pending.id,expectedFolioId:block.id,expectedLocalHash:pending.folioHash,
      event:{summary:block.title,description:block.description,location:block.location,
        start:block.start,end:block.end,allDay:Boolean(block.allDay),timeZone:block.timeZone??'local'}}
  }
  const prefix=googleSourceKey(calendarId)+':'
  if(!pending.providerKey?.startsWith(prefix)||!pending.baseEtag||
    !/^"[^"]+"$/.test(pending.baseEtag))
    throw new Error('Google write requires a canonical source and strong provider ETag.')
  const eventId=decodeURIComponent(pending.providerKey.slice(prefix.length))
  if(!eventId||eventId.length>450)throw new Error('Invalid Google event identity.')
  if(pending.operation==='update'){
    if(!pending.patch||!Object.keys(pending.patch).length)
      throw new Error('Google update needs an explicit field patch.')
    return {protocol:'thiepn.calendar.c2',op:'update',context:ctx,
      idempotencyKey:pending.id,eventId,ifMatch:pending.baseEtag,patch:pending.patch}
  }
  return {protocol:'thiepn.calendar.c2',op:'delete',context:ctx,
    idempotencyKey:pending.id,eventId,ifMatch:pending.baseEtag}
}
