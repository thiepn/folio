import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../../components/ui/Button'
import { noteRepository } from '../../repositories/noteRepository'
import { noteService } from '../../services/noteService'
import { contentSearchService, markdownToSearchText, type ContentSearchHit } from '../../services/contentSearchService'
import { MarkdownEditor } from './MarkdownEditor'
import { SafeMarkdown } from './SafeMarkdown'
import { AttachmentPanel } from './AttachmentPanel'

export function NotesView({ onOpenTask, openNoteId }: { onOpenTask: (id: string) => void; openNoteId?: string }) {
  const allNotes = useLiveQuery(() => noteRepository.listAll(true), [], []) ?? []
  const [showArchived, setShowArchived] = useState(false)
  const notes = useMemo(() => allNotes.filter((note) => showArchived ? note.archived : !note.archived), [allNotes, showArchived])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = notes.find((note) => note.id === selectedId) ?? null
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ContentSearchHit[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (selectedId && !notes.some((note) => note.id === selectedId)) setSelectedId(notes[0]?.id ?? null)
    else if (!selectedId && notes[0]) setSelectedId(notes[0].id)
  }, [notes, selectedId])
  useEffect(() => {
    if (!openNoteId) return
    const target = allNotes.find((note) => note.id === openNoteId)
    if (!target) return
    void (async () => {
      if (dirty && selectedId !== target.id && !(await save())) return
      setShowArchived(target.archived)
      setSelectedId(target.id)
      setQuery('')
      setMessage('')
    })()
  }, [openNoteId, allNotes])
  useEffect(() => { setTitle(selected?.title ?? ''); setBody(selected?.body ?? '') }, [selected?.id, selected?.updatedAt])
  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => {
      if (showArchived) {
        const tokens = query.toLocaleLowerCase().normalize('NFKC').split(/\s+/).filter(Boolean)
        const result: ContentSearchHit[] = allNotes
          .filter((note) => note.archived)
          .filter((note) => {
            const haystack = (note.title + ' ' + markdownToSearchText(note.body)).toLocaleLowerCase().normalize('NFKC')
            return tokens.every((token) => haystack.includes(token))
          })
          .map((note) => ({ ownerType: 'note' as const, ownerId: note.id, title: note.title, snippet: markdownToSearchText(note.body).slice(0, 180), updatedAt: note.updatedAt, score: 1, matchedFields: ['content'], archived: true }))
        if (active) setHits(result)
        return
      }
      void contentSearchService.search(query).then((result) => { if (active) setHits(result) })
    }, 120)
    return () => { active = false; window.clearTimeout(handle) }
  }, [query, showArchived, allNotes])

  const dirty = Boolean(selected && (title.trim() !== selected.title || body !== selected.body))
  const noteHits = useMemo(() => hits.filter((hit) => hit.ownerType === 'note'), [hits])
  const taskHits = useMemo(() => hits.filter((hit) => hit.ownerType === 'task'), [hits])

  async function createNote() {
    const note = await noteService.create({ title: 'Untitled note', body: '' })
    setSelectedId(note.id); setQuery(''); setMessage('')
  }
  async function save() {
    if (!selected || !title.trim()) return false
    try {
      await noteService.update(selected.id, { title: title.trim(), body })
      setMessage('Saved')
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'The note could not be saved.')
      return false
    }
  }
  async function selectNote(id: string) {
    if (dirty && !(await save())) return
    setSelectedId(id)
    setMessage('')
  }
  async function toggleArchiveView() {
    if (dirty && !(await save())) return
    setShowArchived((value) => !value)
    setSelectedId(null)
    setQuery('')
    setMessage('')
  }
  async function archive() {
    if (!selected) return
    if (dirty && !(await save())) return
    await noteService.archive(selected.id, true)
    setSelectedId(null); setMessage('Note archived')
  }
  async function restore() {
    if (!selected) return
    try {
      await noteService.archive(selected.id, false)
      setSelectedId(null); setMessage('Note restored')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The note could not be restored.') }
  }
  async function removePermanently() {
    if (!selected || !window.confirm(`Permanently delete “${selected.title}” and its attachments? This cannot be undone.`)) return
    try {
      await noteService.deletePermanently(selected.id)
      setSelectedId(null); setMessage('Note permanently deleted')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The note could not be deleted.') }
  }
  async function makeTask() {
    if (!selected) return
    if (dirty) await save()
    const task = await noteService.createTaskFromNote(selected.id)
    setMessage('Inbox task created with this note and its attachments.')
    onOpenTask(task.id)
  }

  return <div className="notes-workspace">
    <header className="notes-page-head"><div><div className="eyebrow">Content workspace</div><h1>{showArchived ? 'Archived notes' : 'Notes'}</h1><p>Markdown notes, research fragments, reference material, and task context. Everything stays local and searchable offline.</p></div><div className="notes-page-actions"><Button onClick={() => void toggleArchiveView()}>{showArchived ? 'Active notes' : 'Archived notes'}</Button>{!showArchived ? <Button variant="primary" onClick={() => void createNote()}>New note</Button> : null}</div></header>
    <div className="notes-layout">
      <aside className="notes-sidebar">
        <label className="notes-search"><span>{showArchived ? 'Search archived notes' : 'Search tasks & notes'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={showArchived ? 'Search archived note content…' : 'Search content or attachment names…'} /></label>
        {query.trim() ? <div className="notes-search-results">
          {noteHits.length ? <section><small>Notes</small>{noteHits.map((hit) => <button key={'n-' + hit.ownerId} onClick={() => { void selectNote(hit.ownerId); setQuery('') }}><strong>{hit.title}</strong><span>{hit.snippet || 'Note'}</span></button>)}</section> : null}
          {taskHits.length ? <section><small>Tasks</small>{taskHits.map((hit) => <button key={'t-' + hit.ownerId} onClick={() => onOpenTask(hit.ownerId)}><strong>{hit.title}</strong><span>{hit.snippet || 'Task'}</span></button>)}</section> : null}
          {!hits.length ? <p>No indexed content matches.</p> : null}
        </div> : <div className="notes-list">{notes.map((note) => <button key={note.id} className={note.id === selectedId ? 'is-active' : ''} onClick={() => void selectNote(note.id)}><strong>{note.title}</strong><span>{markdownToSearchText(note.body).slice(0, 90) || 'Empty note'}</span><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt))}</time></button>)}{!notes.length ? <p>{showArchived ? 'No archived notes.' : 'No standalone notes yet.'}</p> : null}</div>}
      </aside>
      <main className="note-editor-pane">
        {selected ? <>
          <div className="note-title-row"><input aria-label="Note title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={showArchived} /><div>{showArchived ? <><Button onClick={() => void restore()}>Restore</Button><Button onClick={() => void removePermanently()}>Delete permanently</Button></> : <><Button onClick={() => void makeTask()}>Note → inbox task</Button><Button onClick={() => void archive()}>Archive</Button><Button variant="primary" disabled={!dirty || !title.trim()} onClick={() => void save()}>{dirty ? 'Save note' : 'Saved'}</Button></>}</div></div>
          {selected.sourceTaskId ? <button className="note-source-link" type="button" onClick={() => onOpenTask(selected.sourceTaskId!)}>Created from task · open source</button> : null}
          {showArchived ? <div className="markdown-reading-surface note-archived-reading"><SafeMarkdown value={selected.body} /></div> : <MarkdownEditor value={body} onChange={setBody} label="Note content · Markdown" placeholder="Write a standalone note. Use headings, lists, quotes, code blocks, links, and interactive checkboxes." />}
          {!showArchived ? <AttachmentPanel ownerType="note" ownerId={selected.id} /> : null}
          {message ? <div className="note-message">{message}</div> : null}
        </> : <div className="notes-empty"><strong>Select or create a note</strong><span>Standalone notes can be converted into Inbox tasks without losing content or attachments.</span>{!showArchived ? <Button variant="primary" onClick={() => void createNote()}>Create note</Button> : null}</div>}
      </main>
    </div>
  </div>
}
