import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import type { AttachmentEntity, ContentOwnerType } from '../../domain/models'
import { attachmentService } from '../../services/attachmentService'

function formatBytes(value: number) {
  if (!value) return 'Link'
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
  return (value / (1024 * 1024)).toFixed(1) + ' MB'
}

function BlobMedia({ attachment }: { attachment: AttachmentEntity }) {
  const url = useMemo(() => attachment.blob ? URL.createObjectURL(attachment.blob) : '', [attachment.blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return null
  if (attachment.kind === 'image') return <img src={url} alt={attachment.name} />
  if (attachment.kind === 'audio') return <audio controls preload="metadata" src={url} />
  return null
}

function openAttachment(attachment: AttachmentEntity) {
  if (attachment.kind === 'link' && attachment.url) { window.open(attachment.url, '_blank', 'noopener,noreferrer'); return }
  if (!attachment.blob) return
  const url = URL.createObjectURL(attachment.blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function downloadAttachment(attachment: AttachmentEntity) {
  if (!attachment.blob) return
  const url = URL.createObjectURL(attachment.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function AttachmentPanel({ ownerType, ownerId }: { ownerType: ContentOwnerType; ownerId: string }) {
  const attachments = useLiveQuery(() => attachmentService.list(ownerType, ownerId), [ownerType, ownerId], []) ?? []
  const input = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({})

  useEffect(() => { void attachmentService.storageEstimate().then(setStorage) }, [attachments.length])

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(true); setError('')
    try { await attachmentService.addFiles(ownerType, ownerId, list) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault()
    if (!link.trim()) return
    setBusy(true); setError('')
    try { await attachmentService.addLink(ownerType, ownerId, link); setLink('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return <section className="attachment-panel">
    <div className="task-section-head"><div><div className="eyebrow">Attachments</div><span>{attachments.length ? attachments.length + ' attached' : 'Images, audio, files, or links · offline where possible'}</span></div><Button onClick={() => input.current?.click()} disabled={busy}>Add file</Button></div>
    <input ref={input} className="attachment-file-input" type="file" multiple onChange={(event) => void addFiles(event.target.files ?? [])} />
    <div className="attachment-dropzone" tabIndex={0}
      onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragging') }}
      onDragLeave={(event) => event.currentTarget.classList.remove('is-dragging')}
      onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('is-dragging'); void addFiles(event.dataTransfer.files) }}
      onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addFiles(files) } }}>
      <strong>Drop or paste files here</strong><span>Stored locally in this browser as IndexedDB Blobs.</span>
    </div>
    <form className="attachment-link-form" onSubmit={addLink}><input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://… attach a link" /><Button type="submit" disabled={busy || !link.trim()}>Attach link</Button></form>
    {attachments.length ? <div className="attachment-grid">{attachments.map((attachment) => <article className={'attachment-card attachment-card--' + attachment.kind} key={attachment.id}>
      <div className="attachment-preview"><BlobMedia attachment={attachment} />{attachment.kind === 'file' ? <span>FILE</span> : null}{attachment.kind === 'link' ? <span>LINK</span> : null}</div>
      <div className="attachment-card__body"><strong title={attachment.name}>{attachment.name}</strong><small>{attachment.mimeType || attachment.kind} · {formatBytes(attachment.size)}{attachment.width && attachment.height ? ` · ${attachment.width}×${attachment.height}` : ''}{attachment.durationSeconds ? ` · ${Math.round(attachment.durationSeconds)}s` : ''}</small></div>
      <div className="attachment-card__actions"><button type="button" onClick={() => openAttachment(attachment)}>Open</button>{attachment.blob ? <button type="button" onClick={() => downloadAttachment(attachment)}>Download</button> : null}<button type="button" onClick={() => void attachmentService.remove(attachment.id)}>Remove</button></div>
    </article>)}</div> : null}
    <div className="attachment-storage-note">{storage.quota ? `Local storage: ${formatBytes(storage.usage ?? 0)} of ${formatBytes(storage.quota)} used. Folio keeps 8 MB of quota headroom for safe writes.` : 'Local quota is checked before large files are written.'}</div>
    {error ? <div className="form-error">{error}</div> : null}
  </section>
}
