import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import type { ListEntity, ReviewRecordEntity } from '../../domain/models'
import type { ProjectSummary } from '../../repositories/projectRepository'
import type { TaskPreview } from '../../types/ui'
import {
  collaborationService, type CollaborationAccess, type CollaborationPackage,
  type CollaborationPreview, type CollaborationScope,
} from '../../services/collaborationService'
import { templateService } from '../../services/templateService'
import type { UndoableMutation } from '../../services/undo'

type Tab='share'|'receive'|'history'
const tabs=[{value:'share',label:'Share'},{value:'receive',label:'Receive'},{value:'history',label:'History'}] as const

function downloadFile(file:File){
  const url=URL.createObjectURL(file)
  const anchor=document.createElement('a')
  anchor.href=url;anchor.download=file.name;document.body.appendChild(anchor);anchor.click();anchor.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),0)
}
function scopeLabel(scope:CollaborationScope){return scope[0].toUpperCase()+scope.slice(1)}

export function CollaborationView({tasks,projects,lists,reviews,onUndo,onOpenImported}:{tasks:TaskPreview[];projects:ProjectSummary[];lists:ListEntity[];reviews:ReviewRecordEntity[];onUndo:(undo:UndoableMutation)=>void;onOpenImported:(target:{type:'task'|'project'|'list'|'review'|'template';id:string})=>void}){
  const [tab,setTab]=useState<Tab>('share')
  const templates=useLiveQuery(()=>templateService.listAll(),[],[])??[]
  const history=useLiveQuery(()=>collaborationService.listHistory(),[],[])??[]
  const [scope,setScope]=useState<CollaborationScope>('task')
  const [entityId,setEntityId]=useState('')
  const [access,setAccess]=useState<CollaborationAccess>('copy')
  const [message,setMessage]=useState('')
  const [includeAttachments,setIncludeAttachments]=useState(false)
  const [pkg,setPkg]=useState<CollaborationPackage|null>(null)
  const [receiveText,setReceiveText]=useState('')
  const [preview,setPreview]=useState<CollaborationPreview|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const rootTasks=useMemo(()=>tasks.filter((task)=>!task.parentTaskId&&!task.deletedAt&&task.status!=='cancelled'),[tasks])
  const entities=scope==='task'
    ?rootTasks.map((item)=>({id:item.id,label:item.title}))
    :scope==='project'
      ?projects.filter((item)=>!item.archived).map((item)=>({id:item.id,label:item.name}))
      :scope==='list'
        ?lists.filter((item)=>!item.archived).map((item)=>({id:item.id,label:item.name}))
        :scope==='review'
          ?reviews.map((item)=>({id:item.id,label:item.title}))
          :templates.map((item)=>({id:item.id,label:item.name}))

  function chooseScope(next:CollaborationScope){setScope(next);setEntityId('');setPkg(null);setError('');setNotice('')}

  async function create(){
    setError('');setNotice('')
    try{
      if(!entityId)throw new Error('Choose something to share.')
      const created=await collaborationService.createPackage({scope,entityId,access,message,includeAttachments})
      setPkg(created);setNotice('Share package created locally.')
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create share package.')}
  }

  async function shareFile(){
    if(!pkg)return
    const file=collaborationService.toFile(pkg)
    try{
      if(navigator.share){
        const data:{title:string;text:string;files?:File[]}={title:'Folio · '+pkg.title,text:collaborationService.summary(pkg)}
        if(!navigator.canShare||navigator.canShare({files:[file]}))data.files=[file]
        await navigator.share(data)
        setNotice(data.files?'Share sheet opened with package file.':'Share sheet opened with text summary.')
        return
      }
      downloadFile(file);setNotice('Web Share is unavailable; package downloaded instead.')
    }catch(reason){
      if((reason as DOMException)?.name==='AbortError')return
      downloadFile(file);setNotice('Sharing failed; package downloaded instead.')
    }
  }

  async function copySummary(){
    if(!pkg)return
    await navigator.clipboard.writeText(collaborationService.summary(pkg))
    setNotice('Readable summary copied.')
  }

  async function copyJson(){
    if(!pkg)return
    await navigator.clipboard.writeText(JSON.stringify(pkg,null,2))
    setNotice('Share-package JSON copied.')
  }

  async function previewReceive(){
    setError('');setNotice('')
    try{
      const next=collaborationService.parse(receiveText)
      setPreview(next)
      await collaborationService.recordViewed(next.package)
    }catch(reason){setPreview(null);setError(reason instanceof Error?reason.message:'Invalid share package.')}
  }

  async function loadFile(file?:File){
    if(!file)return
    if(file.size>60*1024*1024){setError('Share package is larger than the 60 MB preview limit.');return}
    const text=await file.text();setReceiveText(text);setPreview(null);setError('');setNotice('')
    try{const next=collaborationService.parse(text);setPreview(next);await collaborationService.recordViewed(next.package)}
    catch(reason){setError(reason instanceof Error?reason.message:'Invalid share package.')}
  }

  async function importCopy(){
    if(!preview)return
    setError('');setNotice('')
    try{
      const result=await collaborationService.importPackage(preview)
      onUndo(result.undo)
      setNotice('Shared package imported as a new local copy.')
      if(result.open)onOpenImported(result.open)
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not import share package.')}
  }

  return <div className="collaboration-view">
    <PageHeader kicker="Portable collaboration, explicit boundaries" title="Share & collaborate" subtitle="Hand off focused Folio context as view-only snapshots or copyable local packages—without pretending a local-first workspace already has cloud multiplayer." />
    <Tabs<Tab> value={tab} tabs={tabs} onChange={setTab} label="Share and collaboration views" />
    {error?<div className="form-error">{error}</div>:null}
    {notice?<div className="collaboration-notice">{notice}</div>:null}

    {tab==='share'?<>
      <section className="collaboration-builder">
        <div className="collaboration-form-grid">
          <label><span>Share</span><select value={scope} onChange={(e)=>chooseScope(e.target.value as CollaborationScope)}><option value="task">Task tree</option><option value="project">Project</option><option value="list">List</option><option value="review">Saved review</option><option value="template">Template</option></select></label>
          <label><span>{scopeLabel(scope)}</span><select value={entityId} onChange={(e)=>{setEntityId(e.target.value);setPkg(null)}}><option value="">Choose…</option>{entities.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Access</span><select value={access} onChange={(e)=>{setAccess(e.target.value as CollaborationAccess);setPkg(null)}}><option value="copy">Copy allowed</option><option value="view">View only</option></select></label>
        </div>
        <label className="collaboration-message"><span>Handoff note <small>optional</small></span><textarea rows={3} maxLength={1000} value={message} onChange={(e)=>{setMessage(e.target.value);setPkg(null)}} placeholder="What should the receiver know about this handoff?"/></label>
        {(scope==='task'||scope==='project'||scope==='list')?<label className="collaboration-attachment-toggle"><input type="checkbox" checked={includeAttachments} onChange={(e)=>{setIncludeAttachments(e.target.checked);setPkg(null)}}/><span><strong>Include attachments</strong><small>Binary files are embedded in the JSON package and can make it much larger.</small></span></label>:null}
        <div className="collaboration-access-note"><strong>{access==='view'?'View-only boundary':'Copyable boundary'}</strong><span>{access==='view'?'The receiver can inspect and share the snapshot but Folio will disable Import.':'The receiver can preview first, then explicitly import a remapped local copy. Nothing links back to your original workspace.'}</span></div>
        <Button variant="primary" disabled={!entityId} onClick={()=>void create()}>Create share package</Button>
      </section>

      {pkg?<section className="collaboration-package-preview">
        <header><div><span className="eyebrow">Ready to hand off</span><h2>{pkg.title}</h2><p>{scopeLabel(pkg.scope)} · {pkg.access==='view'?'View only':'Copy allowed'} · package {pkg.shareId.slice(0,8)}</p></div><strong>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(pkg.createdAt))}</strong></header>
        {pkg.message?<blockquote>{pkg.message}</blockquote>:null}
        <pre>{collaborationService.summary(pkg)}</pre>
        <div className="collaboration-actions"><Button variant="primary" onClick={()=>void shareFile()}>Share</Button><Button onClick={()=>downloadFile(collaborationService.toFile(pkg))}>Download .json</Button><Button onClick={()=>void copySummary()}>Copy summary</Button><Button onClick={()=>void copyJson()}>Copy JSON</Button></div>
      </section>:null}
    </>:null}

    {tab==='receive'?<>
      <section className="collaboration-receive">
        <div className="collaboration-file-row"><label className="button button--outline"><span>Load .json package</span><input type="file" accept="application/json,.json" hidden onChange={(e)=>void loadFile(e.target.files?.[0])}/></label><span>or paste a Folio share package below</span></div>
        <textarea rows={10} value={receiveText} onChange={(e)=>{setReceiveText(e.target.value);setPreview(null)}} placeholder='{"format":"folio-share","version":1,…}' spellCheck={false}/>
        <Button disabled={!receiveText.trim()} onClick={()=>void previewReceive()}>Preview package</Button>
      </section>
      {preview?<section className="collaboration-incoming">
        <header><div><span className="eyebrow">Incoming {scopeLabel(preview.package.scope)}</span><h2>{preview.package.title}</h2><p>{preview.package.access==='view'?'View only':'Copy allowed'} · shared {new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(preview.package.createdAt))}</p></div><strong>{preview.importable?'Importable':'Read only'}</strong></header>
        {preview.package.message?<blockquote>{preview.package.message}</blockquote>:null}
        <div className="collaboration-counts"><div><strong>{preview.counts.tasks}</strong><span>Tasks</span></div><div><strong>{preview.counts.notes}</strong><span>Notes</span></div><div><strong>{preview.counts.sections}</strong><span>Sections</span></div><div><strong>{preview.counts.attachments}</strong><span>Attachments</span></div></div>
        {preview.warnings.length?<div className="collaboration-warnings">{preview.warnings.map((warning)=><div key={warning}>{warning}</div>)}</div>:null}
        <pre>{collaborationService.summary(preview.package)}</pre>
        <div className="collaboration-actions"><Button onClick={()=>void navigator.clipboard.writeText(collaborationService.summary(preview.package))}>Copy summary</Button>{preview.importable?<Button variant="primary" onClick={()=>void importCopy()}>Import as local copy</Button>:null}</div>
      </section>:null}
    </>:null}

    {tab==='history'?<section className="collaboration-history">
      <div className="collaboration-section-head"><div><span className="eyebrow">Local audit trail</span><h2>Share history</h2></div>{history.length?<Button onClick={()=>void collaborationService.clearHistory()}>Clear history</Button>:null}</div>
      <div>{history.map((entry)=><article key={entry.id}><i className={'is-'+entry.direction}/><div><strong>{entry.title}</strong><span>{scopeLabel(entry.scope)} · {entry.access==='view'?'view only':'copy allowed'} · {entry.direction}</span></div><em>{entry.status}</em><time>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.at))}</time></article>)}{!history.length?<p>No packages have been shared or received on this device yet.</p>:null}</div>
    </section>:null}
  </div>
}
