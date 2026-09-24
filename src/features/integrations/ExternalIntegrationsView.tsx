import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import type { SchedulePreview, TaskPreview } from '../../types/ui'
import type { ProjectSummary } from '../../repositories/projectRepository'
import { externalIntegrationService, type IntegrationIntent, type ParsedEmailCapture } from '../../services/externalIntegrationService'
import { templateService } from '../../services/templateService'
import { automationService } from '../../services/automationService'
import type { UndoableMutation } from '../../services/undo'

type Tab='calendar'|'capture'|'protocol'|'history'
const tabs=[{value:'calendar',label:'Calendar'},{value:'capture',label:'Capture'},{value:'protocol',label:'Protocol'},{value:'history',label:'History'}] as const

function downloadText(text:string,fileName:string,type:string){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a')
  anchor.href=url;anchor.download=fileName;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),0)
}
function intentTitle(intent:IntegrationIntent,templates:Array<{id:string;name:string}>,rules:Array<{id:string;name:string}>){
  if(intent.type==='capture')return intent.title
  if(intent.type==='template')return templates.find((item)=>item.id===intent.templateId)?.name??'Template request'
  return rules.find((item)=>item.id===intent.ruleId)?.name??'Automation request'
}
function intentDetail(intent:IntegrationIntent){
  if(intent.type==='capture')return [intent.text,intent.url,intent.plannedDate?'Plan '+intent.plannedDate:undefined].filter(Boolean).join(' · ')
  if(intent.type==='template')return 'Create from template'+(intent.anchorDate?' · anchor '+intent.anchorDate:'')
  return 'Run automation for task '+intent.taskId
}

export function ExternalIntegrationsView({blocks,tasks,projects,incomingIntent,onConsumeIntent,onUndo,onOpenTarget,onOpenInterop}:{blocks:SchedulePreview[];tasks:TaskPreview[];projects:ProjectSummary[];incomingIntent:IntegrationIntent|null;onConsumeIntent:()=>void;onUndo:(undo:UndoableMutation)=>void;onOpenTarget:(target:{type:'task'|'project';id:string})=>void;onOpenInterop:()=>void}){
  const [tab,setTab]=useState<Tab>(incomingIntent?'protocol':'calendar')
  const templates=useLiveQuery(()=>templateService.listAll(),[],[])??[]
  const rules=useLiveQuery(()=>automationService.listRules(),[],[])??[]
  const history=useLiveQuery(()=>externalIntegrationService.listHistory(),[],[])??[]
  const [selectedBlockId,setSelectedBlockId]=useState('')
  const [emailText,setEmailText]=useState('')
  const [emailPreview,setEmailPreview]=useState<ParsedEmailCapture|null>(null)
  const [captureTitle,setCaptureTitle]=useState('')
  const [captureText,setCaptureText]=useState('')
  const [captureUrl,setCaptureUrl]=useState('')
  const [captureProject,setCaptureProject]=useState('')
  const [captureDate,setCaptureDate]=useState('')
  const [endpointKind,setEndpointKind]=useState<'capture'|'template'|'automation'>('capture')
  const [endpointTemplate,setEndpointTemplate]=useState('')
  const [endpointRule,setEndpointRule]=useState('')
  const [endpointTask,setEndpointTask]=useState('')
  const [endpointUrl,setEndpointUrl]=useState('')
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')

  const appBase=useMemo(()=>new URL(import.meta.env.BASE_URL,window.location.href).toString(),[])
  const upcoming=useMemo(()=>[...blocks].filter((block)=>Date.parse(block.end)>=Date.now()-86_400_000).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,120),[blocks])
  const openTasks=useMemo(()=>tasks.filter((task)=>!task.deletedAt&&(task.status==='todo'||task.status==='inbox')&&!task.parentTaskId),[tasks])

  async function openCalendar(provider:'google'|'outlook'){
    if(!selectedBlockId)return
    setError('')
    try{
      const links=await externalIntegrationService.calendarLinks(selectedBlockId)
      const target=provider==='google'?links.google:links.outlook
      window.open(target,'_blank','noopener,noreferrer')
      await externalIntegrationService.recordCalendarOpen(provider,links.block)
      setNotice((provider==='google'?'Google Calendar':'Outlook Calendar')+' opened with this Folio item prefilled.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Calendar integration failed.')}
  }

  async function downloadIcs(){
    if(!selectedBlockId)return
    try{
      const result=await externalIntegrationService.singleEventIcs(selectedBlockId)
      downloadText(result.text,'folio-'+result.block.id.slice(0,8)+'.ics','text/calendar;charset=utf-8')
      setNotice('Single-event .ics file created.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create .ics file.')}
  }

  async function createEmail(){
    if(!emailText.trim())return
    setError('')
    try{
      const result=await externalIntegrationService.createTaskFromEmail(emailText)
      onUndo(result.undo);setEmailPreview(result.preview);setNotice('Email captured to Inbox.');onOpenTarget({type:'task',id:result.taskId})
    }catch(reason){setError(reason instanceof Error?reason.message:'Email could not be captured.')}
  }

  function buildEndpoint(){
    let url=''
    if(endpointKind==='capture')url=externalIntegrationService.buildCaptureUrl(appBase,{title:captureTitle,text:captureText,url:captureUrl,projectId:captureProject,plannedDate:captureDate})
    else if(endpointKind==='template'){
      if(!endpointTemplate){setError('Choose a template first.');return}
      url=externalIntegrationService.buildTemplateUrl(appBase,endpointTemplate,captureDate||undefined)
    }else{
      if(!endpointRule||!endpointTask){setError('Choose an automation and task first.');return}
      url=externalIntegrationService.buildAutomationUrl(appBase,endpointRule,endpointTask)
    }
    setEndpointUrl(url);setError('')
  }

  async function executeIncoming(){
    if(!incomingIntent)return
    setError('')
    try{
      const result=await externalIntegrationService.executeIntent(incomingIntent)
      onUndo(result.undo);onConsumeIntent();setNotice('External request confirmed and applied.')
      if(result.open)onOpenTarget(result.open)
    }catch(reason){setError(reason instanceof Error?reason.message:'External request could not be applied.')}
  }

  return <div className="integrations-view">
    <PageHeader kicker="External bridges, local authority" title="Integrations" subtitle="Connect Folio to calendar apps, email, browser sharing, shortcuts, and local automation URLs without handing your workspace to a remote integration server." />
    <Tabs<Tab> value={tab} tabs={tabs} onChange={setTab} label="External integration views"/>
    {notice?<div className="integrations-notice">{notice}</div>:null}
    {error?<div className="form-error">{error}</div>:null}

    {incomingIntent?<section className="integration-intent-card">
      <div><span className="eyebrow">Incoming external request</span><h2>{intentTitle(incomingIntent,templates,rules)}</h2><p>{intentDetail(incomingIntent)||'No additional content.'}</p><small>Source: {incomingIntent.source}. Nothing changes until Confirm.</small></div>
      <div><Button onClick={onConsumeIntent}>Dismiss</Button><Button variant="primary" onClick={()=>void executeIncoming()}>Confirm</Button></div>
    </section>:null}

    {tab==='calendar'?<>
      <section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Outbound calendar bridge</span><h2>Send a Folio time block elsewhere</h2></div><Button onClick={onOpenInterop}>Full .ics import/export</Button></div>
        <div className="calendar-bridge-grid"><label><span>Folio calendar item</span><select value={selectedBlockId} onChange={(e)=>setSelectedBlockId(e.target.value)}><option value="">Choose upcoming item…</option>{upcoming.map((block)=><option key={block.id} value={block.id}>{block.date} · {block.time} · {block.name}</option>)}</select></label><div className="calendar-bridge-actions"><Button disabled={!selectedBlockId} onClick={()=>void openCalendar('google')}>Open in Google Calendar</Button><Button disabled={!selectedBlockId} onClick={()=>void openCalendar('outlook')}>Open in Outlook Calendar</Button><Button disabled={!selectedBlockId} onClick={()=>void downloadIcs()}>Download one-event .ics</Button></div></div>
        <div className="integration-boundary"><strong>Outbound only</strong><span>Google and Outlook links prefill an event in their web calendar. Folio does not claim two-way calendar sync or OAuth access.</span></div>
      </section>
    </>:null}

    {tab==='capture'?<>
      <section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Email → task</span><h2>Turn a forwarded email into Inbox work</h2></div></div>
        <textarea className="integration-email-input" rows={10} value={emailText} onChange={(e)=>{setEmailText(e.target.value);setEmailPreview(null)}} placeholder={'Subject: Send revised proposal\nFrom: person@example.com\nDate: …\n\nEmail body…'}/>
        <div className="integration-actions"><Button disabled={!emailText.trim()} onClick={()=>setEmailPreview(externalIntegrationService.parseEmail(emailText))}>Preview email</Button>{emailPreview?<Button variant="primary" onClick={()=>void createEmail()}>Create Inbox task</Button>:null}</div>
        {emailPreview?<div className="email-capture-preview"><strong>{emailPreview.subject}</strong><span>{emailPreview.from??'Unknown sender'}{emailPreview.date?' · '+emailPreview.date:''}</span><p>{emailPreview.body.slice(0,600)||'No email body.'}</p>{emailPreview.firstUrl?<small>First link will become source URL: {emailPreview.firstUrl}</small>:null}</div>:null}
      </section>
      <section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Share-to-Folio</span><h2>Receive text and links from other apps</h2></div></div>
        <div className="integration-feature-grid"><article><strong>PWA Share Target</strong><p>When supported by the installed PWA platform, Folio appears as a share destination for title, text, and URL. Shared content opens as a confirmation request rather than being created silently.</p></article><article><strong>Browser bookmarklet</strong><p>Capture the current page title, URL, and selected text into Folio through the same confirmation protocol.</p><Button onClick={()=>void navigator.clipboard.writeText(externalIntegrationService.bookmarklet(appBase)).then(()=>setNotice('Bookmarklet copied. Create a browser bookmark and paste it as the URL.'))}>Copy bookmarklet</Button></article></div>
      </section>
    </>:null}

    {tab==='protocol'?<>
      <section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Folio Integration Protocol v1</span><h2>Build a confirmation URL</h2></div><Button onClick={()=>void externalIntegrationService.registerProtocolHandler().then(()=>setNotice('Browser protocol-handler registration requested.')).catch((reason)=>setError(reason.message))}>Register web+folio:</Button></div>
        <div className="integration-boundary"><strong>No remote webhook server</strong><span>GitHub Pages cannot receive authenticated POST webhooks. D17 exposes safe URL endpoints instead, suitable for Shortcuts, Tasker, bookmarklets, launchers, and other tools that can open a URL.</span></div>
        <div className="integration-protocol-builder"><label><span>Endpoint</span><select value={endpointKind} onChange={(e)=>{setEndpointKind(e.target.value as typeof endpointKind);setEndpointUrl('')}}><option value="capture">Capture task</option><option value="template">Create from template</option><option value="automation">Run automation</option></select></label>
          {endpointKind==='capture'?<><label><span>Title</span><input value={captureTitle} onChange={(e)=>setCaptureTitle(e.target.value)}/></label><label className="is-wide"><span>Text</span><textarea rows={3} value={captureText} onChange={(e)=>setCaptureText(e.target.value)}/></label><label><span>URL</span><input value={captureUrl} onChange={(e)=>setCaptureUrl(e.target.value)} placeholder="https://…"/></label><label><span>Project</span><select value={captureProject} onChange={(e)=>setCaptureProject(e.target.value)}><option value="">Inbox / no project</option>{projects.filter((p)=>!p.archived).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>Planned date</span><input type="date" value={captureDate} onChange={(e)=>setCaptureDate(e.target.value)}/></label></>:null}
          {endpointKind==='template'?<><label><span>Template</span><select value={endpointTemplate} onChange={(e)=>setEndpointTemplate(e.target.value)}><option value="">Choose…</option>{templates.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label><span>Anchor date</span><input type="date" value={captureDate} onChange={(e)=>setCaptureDate(e.target.value)}/></label></>:null}
          {endpointKind==='automation'?<><label><span>Automation</span><select value={endpointRule} onChange={(e)=>setEndpointRule(e.target.value)}><option value="">Choose…</option>{rules.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span>Task</span><select value={endpointTask} onChange={(e)=>setEndpointTask(e.target.value)}><option value="">Choose…</option>{openTasks.map((task)=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label></>:null}
        </div>
        <div className="integration-actions"><Button variant="primary" onClick={buildEndpoint}>Build URL</Button>{endpointUrl?<><Button onClick={()=>void navigator.clipboard.writeText(endpointUrl).then(()=>setNotice('Integration URL copied.'))}>Copy URL</Button><Button onClick={()=>window.open(endpointUrl,'_blank','noopener,noreferrer')}>Test URL</Button></>:null}</div>
        {endpointUrl?<pre className="integration-url-output">{endpointUrl}</pre>:null}
      </section>
      <section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Custom protocol</span><h2>web+folio examples</h2></div></div><div className="protocol-examples"><code>{externalIntegrationService.protocolExample('capture',{title:'Read this',url:'https://example.com'})}</code>{templates[0]?<code>{externalIntegrationService.protocolExample('template',{templateId:templates[0].id})}</code>:null}{rules[0]&&openTasks[0]?<code>{externalIntegrationService.protocolExample('automation',{ruleId:rules[0].id,taskId:openTasks[0].id})}</code>:null}</div></section>
    </>:null}

    {tab==='history'?<section className="integrations-section"><div className="integrations-section-head"><div><span className="eyebrow">Local audit trail</span><h2>Integration activity</h2></div>{history.length?<Button onClick={()=>void externalIntegrationService.clearHistory()}>Clear history</Button>:null}</div><div className="integration-history">{history.map((entry)=><article key={entry.id}><strong>{entry.label}</strong><span>{entry.kind.replaceAll('-',' ')}{entry.detail?' · '+entry.detail:''}</span><time>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.at))}</time></article>)}{!history.length?<p>No external integration actions recorded yet.</p>:null}</div></section>:null}
  </div>
}
