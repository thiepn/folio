/** Read-only KLIPS/iCalendar materialization.
 * Unlike generic one-shot ICS import, this bounds and expands supported
 * daily/weekly series. Any unsupported rule rejects replacement of an existing
 * subscribed snapshot instead of silently removing previously visible classes.
 */
import { addLocalDays } from '../domain/date'
import type { LocalDate } from '../domain/models'
import { parseIcs, parseIcsDate, calendarFingerprint, type ParsedIcsEvent } from '../features/interop/icsLogic'

export interface FeedSnapshotC2 {
  calendarName?: string
  events: ParsedIcsEvent[]
  warnings: string[]
  complete: boolean
  from: LocalDate
  through: LocalDate
}
interface FeedProperty { name: string; value: string; params: Record<string,string> }
const days: Record<string,number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 }
function property(line:string): FeedProperty | null {
  const i=line.indexOf(':')
  if(i<=0)return null
  const [name,...segments]=line.slice(0,i).split(';')
  const params:Record<string,string>={}
  for(const item of segments){const j=item.indexOf('=');if(j>0)params[item.slice(0,j).toUpperCase()]=item.slice(j+1).replace(/^"|"$/g,'')}
  return {name:name.toUpperCase(),value:line.slice(i+1),params}
}
function dateOf(iso:string) {return iso.slice(0,10)}
function localDayOf(compact:string) {
  const match=/^(\d{4})(\d{2})(\d{2})/.exec(compact)
  if(!match)throw new Error('Unsupported recurring date format.')
  const day=`${match[1]}-${match[2]}-${match[3]}`
  if(new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Invalid recurring date.')
  return day
}
function translateCompact(raw:string, date:LocalDate){
  return date.replaceAll('-','')+raw.slice(8)
}
function dayWeek(date:LocalDate) {return new Date(date+'T12:00:00Z').getUTCDay()}
function numberOfDays(from:LocalDate,to:LocalDate) {
  return Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)
}
function recurrenceFields(value:string){
  const rule:Record<string,string>={}
  for(const item of value.split(';')){const [key,v]=item.split('=');if(!key||!v||rule[key.toUpperCase()])throw new Error('Invalid RRULE.');rule[key.toUpperCase()]=v}
  const allowed=new Set(['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','WKST'])
  if(Object.keys(rule).some(k=>!allowed.has(k)))throw new Error('Unsupported RRULE modifier.')
  if(rule.FREQ!=='DAILY'&&rule.FREQ!=='WEEKLY')throw new Error('Only daily and weekly RRULE are qualified.')
  const interval=Number(rule.INTERVAL||1)
  const count=rule.COUNT?Number(rule.COUNT):undefined
  if(!Number.isSafeInteger(interval)||interval<1||interval>52)throw new Error('Invalid recurrence interval.')
  if(count!==undefined&&(!Number.isSafeInteger(count)||count<1||count>5000))throw new Error('Invalid recurrence count.')
  if(count!==undefined&&rule.UNTIL)throw new Error('COUNT and UNTIL must not be combined for this feed adapter.')
  if(rule.WKST&&rule.WKST!=='MO')throw new Error('Only Monday-start weekly rules are supported.')
  const byday=rule.BYDAY?.split(',')??[]
  if(byday.some(x=>!(x in days)))throw new Error('Ordinal or unrecognized BYDAY is unsupported.')
  if(rule.FREQ==='DAILY'&&byday.length)throw new Error('Daily BYDAY is not supported by this bounded feed adapter.')
  return { frequency:rule.FREQ,interval,count,until:rule.UNTIL,byday:byday.map(x=>days[x]) }
}
function eventsRaw(text:string) {
  const lines=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n')
  const unfolded:string[]=[]
  for(const line of lines){if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);else unfolded.push(line)}
  const events:string[][]=[]
  let current:string[]|null=null
  for(const line of unfolded){
    if(line.trim().toUpperCase()==='BEGIN:VEVENT'){if(current)throw new Error('Nested VEVENT.');current=[line];continue}
    if(line.trim().toUpperCase()==='END:VEVENT'){if(!current)throw new Error('Unpaired VEVENT end.');current.push(line);events.push(current);current=null;continue}
    if(current)current.push(line)
  }
  if(current)throw new Error('Unterminated VEVENT.')
  if(!unfolded.some(x=>x.trim().toUpperCase()==='BEGIN:VCALENDAR'))throw new Error('Missing VCALENDAR.')
  return events
}
export function parseSubscribedIcs(text:string, from:LocalDate, through:LocalDate):FeedSnapshotC2 {
  if(text.length>2_000_000||through<from||numberOfDays(from,through)>730)throw new Error('Feed or date window exceeds the safe limit.')
  const warnings:string[]=[]
  const emitted=new Map<string,ParsedIcsEvent>()
  const suppressed=new Set<string>()
  const raw=eventsRaw(text)
  if(raw.length>5000)throw new Error('Too many VEVENT entries.')
  const parsed=raw.map(lines=>{
    const properties=lines.map(property).filter((p):p is FeedProperty=>Boolean(p))
    const get=(name:string)=>properties.find(p=>p.name===name)
    const uid=get('UID')?.value
    if(!uid||uid.length>512)throw new Error('Feed VEVENT must have bounded UID.')
    const recurrence=get('RECURRENCE-ID')
    const slot=recurrence?parseIcsDate(recurrence.value,recurrence.params):undefined
    if(slot)suppressed.add(uid+'#'+slot)
    const eventText=['BEGIN:VCALENDAR',...lines.filter(line=>!['RRULE','EXDATE','RDATE'].includes(property(line)?.name??'')),'END:VCALENDAR'].join('\r\n')
    const event=parseIcs(eventText)
    if(event.warnings.length){warnings.push(...event.warnings);return {uid,slot,base:undefined,properties,get}}
    return {uid,slot,base:event.events[0],properties,get}
  })
  for(const entry of parsed){
    if(entry.get('STATUS')?.value.toUpperCase()==='CANCELLED')continue
    if(!entry.base){continue}
    if(entry.get('RDATE')){warnings.push(entry.uid+': RDATE is not supported; feed update rejected.');continue}
    if(entry.slot || !entry.get('RRULE')){
      const key=entry.uid+(entry.slot?'#'+entry.slot:'')
      if(entry.base.start.slice(0,10)<=through && entry.base.end.slice(0,10)>=from)
        emitted.set(key,{...entry.base,sourceKey:key})
      continue
    }
    const startProp=entry.get('DTSTART')!
    const endProp=entry.get('DTEND')
    const ruleProp=entry.get('RRULE')!
    if(!endProp){warnings.push(entry.uid+': recurring event needs explicit DTEND.');continue}
    const excluded=new Set<string>()
    try {
      const rule=recurrenceFields(ruleProp.value)
      const baseDay=localDayOf(startProp.value)
            const maxWindowDay=through
      for(const prop of entry.properties.filter(x=>x.name==='EXDATE')){
        for(const rawDate of prop.value.split(','))excluded.add(parseIcsDate(rawDate,prop.params))
      }
      let generated=0
      for(let offset=0;offset<=Math.min(2000,numberOfDays(baseDay,maxWindowDay));offset++){
        const date=addLocalDays(baseDay,offset)
        const startWeek=numberOfDays(addLocalDays(baseDay,-((dayWeek(baseDay)+6)%7)),addLocalDays(date,-((dayWeek(date)+6)%7)))/7
        const include=rule.frequency==='DAILY'?offset%rule.interval===0:
          startWeek%rule.interval===0 && (rule.byday.length?rule.byday:[dayWeek(baseDay)]).includes(dayWeek(date))
        if(!include)continue
        generated++
        if(rule.count!==undefined&&generated>rule.count)break
        const dateValue=translateCompact(startProp.value,date)
        const start=parseIcsDate(dateValue,startProp.params)
        if(rule.until){
          if(rule.until.length===8?date>localDayOf(rule.until):Date.parse(start)>Date.parse(parseIcsDate(rule.until,rule.until.endsWith('Z')?{}:startProp.params)))break
        }
        if(excluded.has(start)||suppressed.has(entry.uid+'#'+start))continue
        const endDate=addLocalDays(localDayOf(endProp.value),offset)
        const end=parseIcsDate(translateCompact(endProp.value,endDate),endProp.params)
        if(Date.parse(end)<=Date.parse(start))throw new Error('Invalid recurrent duration.')
        if(date>through||endDate<from)continue
        const key=entry.uid+'#'+start
        emitted.set(key,{...entry.base,sourceKey:key,recurrenceId:start,start,end,
          startDate:entry.base.allDay?date:undefined,endDateExclusive:entry.base.allDay?endDate:undefined,
          fingerprint:calendarFingerprint(entry.uid,entry.base.summary,start,end)})
        if(emitted.size>5000)throw new Error('Too many expanded events.')
      }
      if(numberOfDays(baseDay,maxWindowDay)>2000)warnings.push(entry.uid+': recurrence expansion horizon limited to 2000 days.')
      // A series may be valid but have no occurrences inside the requested window.
    } catch(error){warnings.push(entry.uid+': '+(error instanceof Error?error.message:String(error)))}
  }
  return {calendarName:parseIcs(text.replace(/^RRULE:.*$/gm,'')).calendarName,
    events:[...emitted.values()].sort((a,b)=>a.start.localeCompare(b.start)),
    warnings,complete:warnings.length===0,from,through}
}
