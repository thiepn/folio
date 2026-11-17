/** Calendar C2 — Google event normalization and guarded sync planning.
 * This module intentionally has NO OAuth, fetch() or token access. A reviewed
 * Account/Core gateway transport must be supplied before remote use is possible.
 */
import { atTimeInZone } from '../domain/date'
import type { TimeBlockEntity } from '../domain/models'

export interface GoogleEventC2 {
  id: string
  etag?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  recurringEventId?: string
  originalStartTime?: { date?: string; dateTime?: string }
  iCalUID?: string
}
export interface GooglePageC2 {
  items: GoogleEventC2[]
  nextPageToken?: string
  nextSyncToken?: string
}
export interface GooglePullTransportC2 {
  /** Only a server-side, scoped Account/Core adapter may implement this. */
  list(input: { calendarId: string; syncToken?: string; pageToken?: string; singleEvents: true; showDeleted: true; maxResults: 250 }): Promise<GooglePageC2>
}
export interface GoogleDeltaC2 {
  calendarId: string
  mode: 'full' | 'incremental'
  events: GoogleEventC2[]
  nextSyncToken: string
}
export class GoogleSyncTokenExpired extends Error {
  constructor() { super('Google Calendar sync token expired; a complete snapshot is required.') }
}
const validId = (value: string) => Boolean(value && value.length <= 1024 && !/[\x00-\x1f]/.test(value))
export function googleSourceKey(calendarId: string) {
  if (!validId(calendarId)) throw new Error('Invalid Google calendar ID.')
  const key='gcal:' + encodeURIComponent(calendarId)
  if(key.length>200)throw new Error('Google Calendar ID exceeds canonical source identity limits.')
  return key
}
export function googleEventKey(calendarId: string, eventId: string) {
  if (!validId(eventId)) throw new Error('Invalid Google event ID.')
  const key=googleSourceKey(calendarId) + ':' + encodeURIComponent(eventId)
  if(key.length>500)throw new Error('Google event ID exceeds Folio source identity limits.')
  return key
}
/** A page sequence must complete before its token can be persisted. */
export async function pullGoogleDelta(transport: GooglePullTransportC2, calendarId: string, syncToken?: string): Promise<GoogleDeltaC2> {
  googleSourceKey(calendarId)
  let pageToken: string | undefined
  const pages = new Set<string>()
  const events = new Map<string, GoogleEventC2>()
  for (let page = 0; page < 80; page++) {
    let response: GooglePageC2
    try {
      response = await transport.list({ calendarId, syncToken, pageToken, singleEvents: true, showDeleted: true, maxResults: 250 })
    } catch (error) {
      if (error instanceof GoogleSyncTokenExpired) throw error
      throw error
    }
    if (!response || !Array.isArray(response.items) || response.items.length > 250) throw new Error('Invalid Google Calendar page.')
    for (const event of response.items) {
      if (!validId(event.id)) throw new Error('Google Calendar returned invalid event identity.')
      events.set(event.id, event)
      if (events.size > 10000) throw new Error('Google Calendar exceeded bounded sync size.')
    }
    if (response.nextPageToken) {
      if (!validId(response.nextPageToken) || pages.has(response.nextPageToken) || response.nextSyncToken) throw new Error('Invalid Google pagination.')
      pages.add(response.nextPageToken)
      pageToken = response.nextPageToken
      continue
    }
    if (!response.nextSyncToken || !validId(response.nextSyncToken)) throw new Error('Google sync cursor missing at final page.')
    return { calendarId, mode: syncToken ? 'incremental' : 'full', events: [...events.values()], nextSyncToken: response.nextSyncToken }
  }
  throw new Error('Google Calendar pagination limit exceeded.')
}
function absoluteDate(value: string): string {
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('Google event requires offset-aware timestamps.')
  return new Date(epoch).toISOString()
}
export function normalizeGoogleEvent(calendarId: string, item: GoogleEventC2): TimeBlockEntity | null {
  if (item.status === 'cancelled') return null
  if (!item.start || !item.end || !item.id) throw new Error('Incomplete Google event.')
  const allDay = Boolean(item.start.date)
  if (allDay !== Boolean(item.end.date)) throw new Error('Mismatched Google event dates.')
  const zone = item.start.timeZone ?? item.end.timeZone ?? 'UTC'
  const start = allDay ? atTimeInZone(item.start.date!, 0, zone) : absoluteDate(item.start.dateTime ?? '')
  const end = allDay ? atTimeInZone(item.end.date!, 0, zone) : absoluteDate(item.end.dateTime ?? '')
  if (!(Date.parse(end) > Date.parse(start))) throw new Error('Google event has invalid range.')
  const sourceUid = googleEventKey(calendarId, item.id)
  const title = (item.summary || 'Untitled event').trim().slice(0,300) || 'Untitled event'
  const now = new Date().toISOString()
  return {
    id: sourceUid, kind: 'event', title, start, end,
    description: item.description?.slice(0,4000), location: item.location?.slice(0,500),
    allDay, timeZone: zone, source: 'google',
    sourceCalendar: googleSourceKey(calendarId), sourceUid,
    createdAt: now, updatedAt: now,
  }
}
export type GoogleMutationC2 =
  | { operation: 'update'; calendarId: string; eventId: string; etag: string; patch: { summary?: string; description?: string; location?: string; start?: GoogleEventC2['start']; end?: GoogleEventC2['end'] } }
  | { operation: 'delete'; calendarId: string; eventId: string; etag: string }
export function authorizeGoogleWrite(operation: GoogleMutationC2, capabilities: { accountVerified: boolean; calendarEventsWriteGranted: boolean; selectedCalendarWritable: boolean; tokenSubjectMatches: boolean }) {
  if (!capabilities.accountVerified || !capabilities.calendarEventsWriteGranted || !capabilities.selectedCalendarWritable || !capabilities.tokenSubjectMatches) throw new Error('Calendar write is not authorized by the verified Account/Core boundary.')
  googleEventKey(operation.calendarId, operation.eventId)
  if (!/^"[^"]+"$/.test(operation.etag) && !/^W\/"[^"]+"$/.test(operation.etag)) throw new Error('A valid Google ETag is required for conditional writes.')
  if (operation.operation === 'update' && (!Object.keys(operation.patch).length || Object.keys(operation.patch).some(k => !['summary','description','location','start','end'].includes(k)))) throw new Error('Disallowed or empty Google event patch.')
  return { method: operation.operation === 'delete' ? 'DELETE' as const : 'PATCH' as const,
    path: '/calendars/' + encodeURIComponent(operation.calendarId) + '/events/' + encodeURIComponent(operation.eventId),
    ifMatch: operation.etag, body: operation.operation === 'update' ? operation.patch : undefined }
}
