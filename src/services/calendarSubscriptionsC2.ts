/** Calendar C2: local, credential-free subscribed-feed reconciliation.
 * The feed URL/ICS bytes are deliberately NOT stored, backed up, or synced.
 * Metadata and source baselines live under storage.* (excluded from D18 sync).
 * A future Account/Core feed proxy must be separately authorized and deployed.
 */
import { db } from '../db/database'
import type { LocalDate, TimeBlockEntity } from '../domain/models'
import { parseSubscribedIcs, type FeedSnapshotC2 } from './calendarFeedC2'
export type FeedSourceStateC2 = {
  id: string; label: string; revision: number; lastAppliedAt?: string
  from?: LocalDate; through?: LocalDate; count: number
  sourceName?: string
}
type Baseline = Record<string,{ blockId:string; fingerprint:string }>
type SavedFeed = FeedSourceStateC2 & { baseline: Baseline }
export type FeedChangeC2 = { kind: 'create'|'update'|'remove'|'unchanged'|'conflict'; key: string; title: string }
export interface FeedPreviewC2 {
  id: string; expectedRevision: number; label: string; snapshot: FeedSnapshotC2
  changes: FeedChangeC2[]
}
const idsKey='storage.calendarC2.feedIds'
const feedKey=(id:string)=>'storage.calendarC2.feed.'+id
const sourceKey=(id:string)=>'klips:'+id
function fingerprint(block:Pick<TimeBlockEntity,'title'|'description'|'location'|'start'|'end'|'allDay'|'timeZone'|'source'|'sourceUid'|'sourceCalendar'>) {
  return JSON.stringify([block.title,block.description??'',block.location??'',block.start,block.end,Boolean(block.allDay),block.timeZone??'',block.source??'',block.sourceUid??'',block.sourceCalendar??''])
}
function asBlock(feedId:string,event:FeedSnapshotC2['events'][number]): TimeBlockEntity {
  const sourceUid=event.sourceKey??event.uid
  if(!sourceUid||sourceUid.length>480)throw new Error('Feed event has invalid external identity.')
  const now=new Date().toISOString()
  return { id:crypto.randomUUID(),kind:'event',title:event.summary,description:event.description,
    location:event.location,source:'klips',sourceCalendar:sourceKey(feedId),sourceUid,
    allDay:Boolean(event.allDay),timeZone:event.timezone??'local',
    start:event.start,end:event.end,createdAt:now,updatedAt:now }
}
const allowedLabel=(label:string)=>label.trim().length>0&&label.length<=90
async function savedFeed(id:string):Promise<SavedFeed|undefined> {
  return (await db.settings.get(feedKey(id)))?.value as SavedFeed|undefined
}
async function sourceBlocks(id:string) {
  return (await db.timeBlocks.toArray()).filter(b=>b.source==='klips'&&b.sourceCalendar===sourceKey(id))
}
function touchedInWindow(block:TimeBlockEntity, from:LocalDate,through:LocalDate) {
  const first=Date.parse(from+'T00:00:00Z')-86_400_000
  const last=Date.parse(through+'T00:00:00Z')+2*86_400_000
  return Date.parse(block.start)<last && Date.parse(block.end)>first
}
function stagedChanges(saved:SavedFeed, blocks:TimeBlockEntity[],snapshot:FeedSnapshotC2):FeedChangeC2[] {
  const byKey=new Map(blocks.filter(b=>b.sourceUid).map(b=>[b.sourceUid!,b]))
  if(byKey.size!==blocks.filter(b=>b.sourceUid).length)throw new Error('Duplicate external event identity requires manual repair.')
  const changes:FeedChangeC2[]=[]
  const remote=new Map<string,TimeBlockEntity>()
  for(const event of snapshot.events) {
    const desired=asBlock(saved.id,event)
    const key=desired.sourceUid!
    if(remote.has(key))throw new Error('Duplicate UID/recurrence instance in feed.')
    remote.set(key,desired)
    const existing=byKey.get(key), baseline=saved.baseline[key]
    if(!existing){changes.push({kind:baseline?'conflict':'create',key,title:desired.title});continue}
    if(!baseline || baseline.blockId!==existing.id || baseline.fingerprint!==fingerprint(existing)){
      changes.push({kind:'conflict',key,title:desired.title});continue
    }
    changes.push({kind:fingerprint(existing)===fingerprint(desired)?'unchanged':'update',key,title:desired.title})
  }
  for(const current of blocks){
    if(!current.sourceUid||remote.has(current.sourceUid)||!touchedInWindow(current,snapshot.from,snapshot.through))continue
    const baseline=saved.baseline[current.sourceUid]
    changes.push({kind:baseline&&baseline.blockId===current.id&&baseline.fingerprint===fingerprint(current)?'remove':'conflict',
      key:current.sourceUid,title:current.title})
  }
  return changes
}
export const calendarSubscriptionsC2 = {
  async list():Promise<FeedSourceStateC2[]> {
    const ids=(await db.settings.get(idsKey))?.value as string[]|undefined
    const records=await Promise.all((ids??[]).map(savedFeed))
    return records.filter((x):x is SavedFeed=>Boolean(x)).map(({baseline:_baseline,...x})=>x)
  },
  async add(label:string) {
    if(!allowedLabel(label))throw new Error('Provide a source name of 1–90 characters.')
    const id=crypto.randomUUID()
    const feed:SavedFeed={id,label:label.trim(),revision:0,count:0,baseline:{}}
    await db.transaction('rw',db.settings,async()=>{
      const current=((await db.settings.get(idsKey))?.value as string[]|undefined)??[]
      if(current.length>=12)throw new Error('Maximum of 12 local feeds.')
      const now=new Date().toISOString()
      await db.settings.put({key:feedKey(id),value:feed,updatedAt:now})
      await db.settings.put({key:idsKey,value:[...current,id],updatedAt:now})
    })
    return feed.id
  },
  async preview(id:string,text:string,from:LocalDate,through:LocalDate):Promise<FeedPreviewC2> {
    const saved=await savedFeed(id)
    if(!saved)throw new Error('Source not found.')
    const snapshot=parseSubscribedIcs(text,from,through)
    if(!snapshot.complete)throw new Error('Feed contains unsupported or invalid entries. No data changed. '+snapshot.warnings.slice(0,3).join('; '))
    if(snapshot.events.length>4000)throw new Error('Feed exceeds 4000 events.')
    const changes=stagedChanges(saved,await sourceBlocks(id),snapshot)
    return { id,expectedRevision:saved.revision,label:saved.label,snapshot,changes }
  },
  async apply(preview:FeedPreviewC2) {
    if(!preview.snapshot.complete)throw new Error('Incomplete feed cannot replace a saved snapshot.')
    if(preview.changes.some(c=>c.kind==='conflict'))throw new Error('Resolve conflicting local records before applying this feed.')
    return db.transaction('rw',db.settings,db.timeBlocks,async()=>{
      const saved=await savedFeed(preview.id)
      if(!saved||saved.revision!==preview.expectedRevision)throw new Error('Subscription changed since preview. Preview again.')
      const blocks=await sourceBlocks(preview.id)
      const fresh=stagedChanges(saved,blocks,preview.snapshot)
      if(fresh.some(c=>c.kind==='conflict')||JSON.stringify(fresh)!==JSON.stringify(preview.changes))throw new Error('Source changed since preview. Preview again.')
      const byKey=new Map(blocks.filter(b=>b.sourceUid).map(b=>[b.sourceUid!,b]))
      let created=0,updated=0,removed=0
      for(const change of fresh){
        if(change.kind==='unchanged')continue
        if(change.kind==='remove'){await db.timeBlocks.delete(byKey.get(change.key)!.id);removed++;continue}
        const event=preview.snapshot.events.find(e=>(e.sourceKey??e.uid)===change.key)
        if(!event)throw new Error('Missing source event.')
        const desired=asBlock(preview.id,event)
        if(change.kind==='update'){const old=byKey.get(change.key)!;await db.timeBlocks.put({...desired,id:old.id,createdAt:old.createdAt});updated++}
        else if(change.kind==='create'){await db.timeBlocks.put(desired);created++}
      }
      const nextRows=await sourceBlocks(preview.id)
      const baseline:Baseline={}
      for(const block of nextRows)if(block.sourceUid)baseline[block.sourceUid]={blockId:block.id,fingerprint:fingerprint(block)}
      const now=new Date().toISOString()
      await db.settings.put({key:feedKey(preview.id),value:{
        ...saved,baseline,revision:saved.revision+1,from:preview.snapshot.from,through:preview.snapshot.through,
        sourceName:preview.snapshot.calendarName,lastAppliedAt:now,count:nextRows.length
      } satisfies SavedFeed,updatedAt:now})
      return {created,updated,removed,unchanged:fresh.filter(c=>c.kind==='unchanged').length}
    })
  },
  async remove(id:string) {
    await db.transaction('rw',db.settings,db.timeBlocks,async()=>{
      const saved=await savedFeed(id)
      if(!saved)throw new Error('Source no longer exists.')
      const blocks=await sourceBlocks(id)
      // Never delete a locally altered event as if it were still source-owned.
      if(blocks.some(b=>!b.sourceUid||saved.baseline[b.sourceUid]?.fingerprint!==fingerprint(b)))throw new Error('Source has locally changed records; removal blocked.')
      await db.timeBlocks.bulkDelete(blocks.map(b=>b.id))
      const ids=((await db.settings.get(idsKey))?.value as string[]|undefined)??[]
      await db.settings.put({key:idsKey,value:ids.filter(x=>x!==id),updatedAt:new Date().toISOString()})
      await db.settings.delete(feedKey(id))
      return blocks.length
    })
  },
  async readUrlOnce(url:string):Promise<string> {
    let parsed:URL
    try {parsed=new URL(url)}catch{throw new Error('Enter a valid KLIPS iCal URL.')}
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||!(parsed.hostname==='uni-koeln.de'||parsed.hostname.endsWith('.uni-koeln.de')))
      throw new Error('Only HTTPS University of Cologne iCal addresses are allowed.')
    const abort=new AbortController()
    const timer=setTimeout(()=>abort.abort(),15000)
    try {
      const response=await fetch(parsed.toString(),{credentials:'omit',cache:'no-store',redirect:'error',signal:abort.signal})
      if(!response.ok)throw new Error('KLIPS feed request failed ('+response.status+').')
      if(Number(response.headers.get('content-length')??0)>2_000_000)throw new Error('Feed is too large.')
      const text=await response.text()
      if(text.length>2_000_000)throw new Error('Feed is too large.')
      return text
    } catch(error){
      if(error instanceof TypeError)throw new Error('Browser could not read the KLIPS feed (possibly blocked by CORS). Paste an exported ICS snapshot instead.')
      throw error
    } finally {clearTimeout(timer)}
  },
}
