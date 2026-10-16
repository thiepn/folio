/** Optional KLIPS refresh for an open browser tab only.
 * URLs are never persisted in IndexedDB, localStorage, D18 or exports.
 * Every auto-refresh uses the already approved read-only source and CAS apply.
 * No background service worker, server credentials or cross-origin bypass.
 */
import type { LocalDate } from '../domain/models'
import { calendarSubscriptionsC2 } from './calendarSubscriptionsC2'

export interface KlipsSessionStateC2 {
  id:string
  phase:'active'|'offline'|'error'|'conflict'|'paused'
  lastAttemptAt?:string
  lastSuccessAt?:string
  nextAttemptAt:number
  failures:number
  message?:string
}
interface Runtime extends KlipsSessionStateC2 {
  /** Capability URL lives in this module's memory only. */
  url:string
  from:LocalDate
  through:LocalDate
  active:Promise<KlipsSessionStateC2>|null
}
const SCHEDULE_MS=20*60*1000
const MAX_BACKOFF_MS=60*60*1000
const map=new Map<string,Runtime>()
function publicState(s:Runtime):KlipsSessionStateC2 {
  return {id:s.id,phase:s.phase,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.lastSuccessAt,
    nextAttemptAt:s.nextAttemptAt,failures:s.failures,message:s.message}
}
function safeUrl(raw:string) {
  let parsed:URL
  try{parsed=new URL(raw)}catch{throw new Error('Valid HTTPS KLIPS URL required.')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||
    !(parsed.hostname==='uni-koeln.de'||parsed.hostname.endsWith('.uni-koeln.de')))
    throw new Error('Only HTTPS University of Cologne KLIPS feeds may refresh.')
  return parsed.toString()
}
export function mayRefreshSession(s:KlipsSessionStateC2,now:number,online=true,visible=true) {
  return s.phase!=='paused'&&s.phase!=='conflict'&&online&&visible&&now>=s.nextAttemptAt
}
export const calendarKlipsSessionC2={
  start(id:string,url:string,from:LocalDate,through:LocalDate) {
    const normalized=safeUrl(url)
    if(!id||through<from)throw new Error('Invalid source or date range.')
    // Replacing an existing session intentionally clears the previous URL.
    map.set(id,{id,url:normalized,from,through,phase:'active',nextAttemptAt:Date.now()+SCHEDULE_MS,
      failures:0,active:null,message:'Refresh enabled only while this tab remains open.'})
    return this.status(id)
  },
  stop(id:string) { map.delete(id) },
  stopAll() { map.clear() },
  status(id:string):KlipsSessionStateC2|undefined {
    const s=map.get(id);return s?publicState(s):undefined
  },
  async refresh(id:string,force=false):Promise<KlipsSessionStateC2|undefined> {
    const s=map.get(id);if(!s)return undefined
    if(s.active)return s.active
    if(!force && !mayRefreshSession(s,Date.now(),
      typeof navigator==='undefined'||navigator.onLine,
      typeof document==='undefined'||document.visibilityState==='visible'))return publicState(s)
    if(typeof navigator!=='undefined'&&!navigator.onLine) {
      s.phase='offline';s.nextAttemptAt=Date.now()+60_000;s.message='Offline; prior timetable remains available.'
      return publicState(s)
    }
    s.active=(async()=>{
      const now=Date.now();s.lastAttemptAt=new Date(now).toISOString()
      try {
        const text=await calendarSubscriptionsC2.readUrlOnce(s.url)
        const preview=await calendarSubscriptionsC2.preview(s.id,text,s.from,s.through)
        if(preview.changes.some(c=>c.kind==='conflict')){
          s.phase='conflict';s.nextAttemptAt=Number.POSITIVE_INFINITY
          s.message='Source conflict: automatic refresh paused. Review the timetable manually.'
          return publicState(s)
        }
        const applied=await calendarSubscriptionsC2.apply(preview)
        s.phase='active';s.failures=0;s.lastSuccessAt=new Date().toISOString()
        s.nextAttemptAt=Date.now()+SCHEDULE_MS
        s.message=`Updated ${applied.created} new, ${applied.updated} changed, ${applied.removed} removed.`
      }catch(error){
        s.failures++
        s.phase='error';s.nextAttemptAt=Date.now()+Math.min(MAX_BACKOFF_MS,Math.max(2*60_000,SCHEDULE_MS/4)*2**Math.min(s.failures-1,5))
        // Never expose capability URLs in errors or UI.
        s.message=error instanceof TypeError?'Feed could not be read from this browser. Existing classes retained.':
          'Refresh failed; existing timetable retained. '+(error instanceof Error?error.message.replaceAll(s.url,'[private URL]'):'')
      }
      return publicState(s)
    })()
    try{return await s.active}finally{s.active=null}
  },
  async refreshAllDue():Promise<KlipsSessionStateC2[]>{
    const values=await Promise.all([...map.keys()].map(id=>this.refresh(id)))
    return values.filter((s):s is KlipsSessionStateC2=>Boolean(s))
  },
}
