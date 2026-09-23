import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { noteRepository } from '../../repositories/noteRepository'
import { noteService } from '../../services/noteService'
import { contentSearchService, type ContentSearchHit } from '../../services/contentSearchService'
import { MarkdownEditor } from './MarkdownEditor'
import { AttachmentPanel } from './AttachmentPanel'

export function NotesView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const notes = useLiveQuery(() => noteRepository.listAll(), [], []) ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = notes.find((note) => note.id === selectedId) ?? null
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ContentSearchHit[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => { if (!selectedId && notes[0]) setSelectedId(notes[0].id) }, [notes, selectedId])
  useEffect(() => { setTitle(selected?.title ?? ''); setBody(selected?.body ?? '') }, [selected?.id, selected?.updatedAt])
  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => { void contentSearchService.search(query).then((result) => { if (active) setHits(result) }) }, 120)
    return () => { active = false; window.clearTimeout(handle) }
  }, [query])

  const dirty = Boolean(selected && (title.trim() !== selected.title || body !== selected.body))
  const noteHits = useMemo(() => hits.filter((hit) => hit.ownerType === 'note'), [hits])
  const taskHits = useMemo(() => hits.filter((hit) => hit.ownerType === 'task'), [hits])

  async function createNote() {
    const note = await noteService.create({ title: 'Untitled note', body: '' })
    setSelectedId(note.id); setQuery(''); setMessage('')
  }
  async function save() {
    if (!selected || !title.trim()) return
    await noteService.update(selected.id, { title: title.trim(), body })
    setMessage('Saved')
  }
  async function archive() {
    if (!selected) return
    await noteService.archive(selected.id, true)
    setSelectedId(null); setMessage('Note archived')
  }
  async function makeTask() {
    if (!selected) return
    if (dirty) await save()
    const task = await noteService.createTaskFromNote(selected.id)
    setMessage('Inbox task created with this note and its attachments.')
    onOpenTask(task.id)
  }

  return <div className="notes-workspace">
    <header className="notes-page-head"><div><div className="eyebrow">Content workspace</div><h1>Notes</h1><p>Markdown notes, research fragments, reference material, and task context. Everything stays local and searchable offline.</p></div><Button variant="primary" onClick={() => void createNote()}>New note</Button></header>
    <div className="notes-layout">
      <aside className="notes-sidebar">
        <label className="notes-search"><span>Search tasks & notes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content or attachment names…" /></label>
        {query.trim() ? <div className="notes-search-results">
          {noteHits.length ? <section><small>Notes</small>{noteHits.map((hit) => <button key={'n-' + hit.ownerId} onClick={() => { setSelectedId(hit.ownerId); setQuery('') }}><strong>{hit.title}</strong><span>{hit.snippet || 'Note'}</span></button>)}</section> : null}
          {taskHits.length ? <section><small>Tasks</small>{taskHits.map((hit) => <button key={'t-' + hit.ownerId} onClick={() => onOpenTask(hit.ownerId)}><strong>{hit.title}</strong><span>{hit.snippet || 'Task'}</span></button>)}</section> : null}
          {!hits.length ? <p>No indexed content matches.</p> : null}
        </div> : <div className="notes-list">{notes.map((note) => <button key={note.id} className={note.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(note.id)}><strong>{note.title}</strong><span>{note.body.replace(/[#>*_\`\\[\\]]/g, '').slice(0, 90) || 'Empty note'}</span><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt))}</time></button>)}{!notes.length ? <p>No standalone notes yet.</p> : null}</div>}
      </aside>
      <main className="note-editor-pane">
        {selected ? <>
          <div className="note-title-row"><input aria-label="Note title" value={title} onChange={(event) => setTitle(event.target.value)} /><div><Button onClick={() => void makeTask()}>Create inbox task</Button><Button onClick={() => void archive()}>Archive</Button><Button variant="primary" disabled={!dirty || !title.trim()} onClick={() => void save()}>{dirty ? 'Save note' : 'Saved'}</Button></div></div>
          {selected.sourceTaskId ? <button className="note-source-link" type="button" onClick={() => onOpenTask(selected.sourceTaskId!)}>Created from task · open source</button> : null}
          <MarkdownEditor value={body} onChange={setBody} label="Note content · Markdown" placeholder="Write a standalone note. Use headings, lists, quotes, code blocks, links, and interactive checkboxes." />
          <AttachmentPanel ownerType="note" ownerId={selected.id} />
          {message ? <div className="note-message">{message}</div> : null}
        </> : <div className="notes-empty"><strong>Select or create a note</strong><span>Standalone notes can be converted into Inbox tasks without losing content or attachments.</span><Button variant="primary" onClick={() => void createNote()}>Create note</Button></div>}
      </main>
    </div>
  </div>
}
