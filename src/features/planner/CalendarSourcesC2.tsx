import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addLocalDays } from '../../domain/date'
import type { LocalDate } from '../../domain/models'
import { calendarSubscriptionsC2, type FeedPreviewC2 } from '../../services/calendarSubscriptionsC2'

/** Real read-only local KLIPS feed updates; no stored capability URL or server proxy. */
export function CalendarSourcesC2({selectedDate}:{selectedDate:LocalDate}) {
  const sources=useLiveQuery(()=>calendarSubscriptionsC2.list(),[],[])??[]
  const [label,setLabel]=useState('KLIPS 2.0')
  const [selected,setSelected]=useState('')
  const [url,setUrl]=useState('')
  const [pasted,setPasted]=useState('')
  const [from,setFrom]=useState(()=>addLocalDays(selectedDate,-30))
  const [through,setThrough]=useState(()=>addLocalDays(selectedDate,365))
  const [preview,setPreview]=useState<FeedPreviewC2|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const current=selected||sources[0]?.id||''
  async function guarded(action:()=>Promise<void>){
    if(busy)return
    setBusy(true);setError('');setNotice('')
    try{await action()}catch(reason){setError(reason instanceof Error?reason.message:'Feed operation failed.')}
    finally{setBusy(false)}
  }
  return <section className="calendar-c2-sources" aria-label="Calendar sources">
    <header><span className="eyebrow">Connected sources</span><strong>{sources.length} local feeds</strong></header>
    <p><strong>Folio</strong> · Live on this device. <strong>Google Calendar</strong> · Not connected (Account/Core consent and proxy required).</p>
    <p>KLIPS read-only timetable. The generated iCal address may act like a password; it is never saved or sent to THIEPN servers by this screen.</p>
    <div className="calendar-c2-source-controls">
      <label>New source name <input value={label} maxLength={90} onChange={event=>setLabel(event.target.value)} /></label>
      <button type="button" disabled={busy||!label.trim()} onClick={()=>void guarded(async()=>{const id=await calendarSubscriptionsC2.add(label);setSelected(id);setPreview(null);setNotice('Local source created. Add timetable events below.')})}>Add KLIPS source</button>
      {sources.length?<label>Selected feed <select value={current} onChange={event=>{setSelected(event.target.value);setPreview(null)}}>
        {sources.map(source=><option key={source.id} value={source.id}>{source.label} · {source.count} events</option>)}
      </select></label>:null}
      {current?<><label>From <input type="date" value={from} onChange={event=>{setFrom(event.target.value);setPreview(null)}} /></label>
      <label>Through <input type="date" value={through} onChange={event=>{setThrough(event.target.value);setPreview(null)}} /></label>
      <label>KLIPS HTTPS iCal URL (this session only)
        <input type="url" autoComplete="off" placeholder="https://klips2.uni-koeln.de/…" value={url} onChange={event=>setUrl(event.target.value)} />
      </label>
      <label>Or paste complete .ics content
        <textarea rows={3} value={pasted} onChange={event=>setPasted(event.target.value)} placeholder="BEGIN:VCALENDAR…" />
      </label>
      <button type="button" disabled={busy||(!pasted.trim()&&!url.trim())} onClick={()=>void guarded(async()=>{
        const text=pasted.trim()||await calendarSubscriptionsC2.readUrlOnce(url.trim())
        const result=await calendarSubscriptionsC2.preview(current,text,from,through)
        setPreview(result);setUrl('');setPasted('')
        setNotice('Review changes; nothing has been written yet.')
      })}>Preview timetable refresh</button>
      {preview?<div className="calendar-c2-preview" role="status">
        <strong>Review {preview.label}</strong>
        <span>{['create','update','remove','unchanged','conflict'].map(kind=>kind+': '+preview.changes.filter(c=>c.kind===kind).length).join(' · ')}</span>
        {preview.changes.some(c=>c.kind==='conflict')?<p>Local conflict detected. No changes will be applied; reconcile source records first.</p>:null}
        <button type="button" disabled={busy||preview.changes.some(c=>c.kind==='conflict')} onClick={()=>void guarded(async()=>{
          const counts=await calendarSubscriptionsC2.apply(preview)
          setNotice('Timetable updated: '+counts.created+' added, '+counts.updated+' changed, '+counts.removed+' removed.')
          setPreview(null)
        })}>Apply verified refresh</button>
        <button type="button" disabled={busy} onClick={()=>setPreview(null)}>Cancel preview</button>
      </div>:null}
      <button type="button" disabled={busy} className="calendar-c2-danger" onClick={()=>void guarded(async()=>{
        if(!window.confirm('Remove this local source and all its unmodified imported timetable events?'))return
        const count=await calendarSubscriptionsC2.remove(current)
        setSelected('');setPreview(null);setNotice('Removed '+count+' source-owned events.')
      })}>Remove selected source</button>
      </>:null}
    </div>
    {sources.map(item=><small key={item.id}>{item.label}: {item.lastAppliedAt?'Last applied '+new Date(item.lastAppliedAt).toLocaleString():'Never refreshed'} · {item.count} events · local only</small>)}
    <small>Direct browser fetch requires the university to permit CORS. If blocked, paste the ICS feed. This is a manual local refresh, not automatic background sync.</small>
    {error?<p role="alert" className="calendar-c2-error">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
  </section>
}
