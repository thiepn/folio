import { useEffect, useState } from 'react'
import type { ProjectEntity } from '../../domain/models'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { buildImportInstructions } from './importInstructions'
import type { ImportAnalysis } from './importTypes'
import { analyzeImport, applyImport, listImportHistory, revertImport } from '../../services/importService'
import type { UndoableMutation } from '../../services/undo'

export function ImportPlanModal({ open, projects, onClose, onApplied }: { open: boolean; projects: ProjectEntity[]; onClose: () => void; onApplied: (undo: UndoableMutation) => void }) {
  const [tab, setTab] = useState<'prepare'|'preview'|'history'>('prepare')
  const [raw, setRaw] = useState('')
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listImportHistory>>>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setMessage('')
    void listImportHistory().then(setHistory)
  }, [open])

  async function copyInstructions() {
    await navigator.clipboard.writeText(buildImportInstructions(projects))
    setMessage('AI instructions copied.')
  }
  async function preview() {
    setBusy(true); setMessage('')
    try { const result = await analyzeImport(raw); setAnalysis(result); setTab('preview') } finally { setBusy(false) }
  }
  async function apply() {
    if (!analysis?.document || analysis.issues.some((item) => item.severity === 'error')) return
    setBusy(true); setMessage('')
    try {
      const result = await applyImport(raw, 'chatgpt')
      onApplied(result.undo)
      setHistory(await listImportHistory())
      setMessage('Import applied.')
      setRaw(''); setAnalysis(null); setTab('history')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.') } finally { setBusy(false) }
  }
  async function revert(id: string) {
    setBusy(true); setMessage('')
    try { await revertImport(id); setHistory(await listImportHistory()); setMessage('Import reverted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Revert blocked.') } finally { setBusy(false) }
  }
  async function loadFile(file?: File) {
    if (!file) return
    setRaw(await file.text()); setAnalysis(null); setTab('prepare')
  }

  return <Modal open={open} title="Import ChatGPT plan" onClose={onClose} className="protocol-modal" footer={<>
    <span className="protocol-footer-note">CREATE-only · local validation · human approval</span>
    {tab !== 'history' ? <Button variant="primary" disabled={busy || !raw.trim()} onClick={() => void preview()}>{busy ? 'Checking…' : 'Preview import'}</Button> : null}
  </>}>
    <div className="protocol-tabs" role="tablist">
      {(['prepare','preview','history'] as const).map((item) => <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'prepare' ? 'Prepare' : item === 'preview' ? 'Preview' : 'History'}</button>)}
    </div>
    {message ? <div className="protocol-message">{message}</div> : null}

    {tab === 'prepare' ? <div className="protocol-stack">
      <section className="protocol-intro"><div><span className="section-label">1 · Ask ChatGPT</span><h3>Copy the planner contract</h3><p>The app sends nothing automatically. Copy the local protocol/context, paste it into ChatGPT, describe your plan, then bring the returned JSON back here.</p></div><Button onClick={() => void copyInstructions()}>Copy AI instructions</Button></section>
      <section><span className="section-label">2 · Paste result</span><textarea className="protocol-json" value={raw} onChange={(event) => { setRaw(event.target.value); setAnalysis(null) }} placeholder={'{"format":"folio-import","version":1,…}'} spellCheck={false} /></section>
      <div className="protocol-file-row"><label className="button button--outline"><span>Load .json file</span><input type="file" accept="application/json,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])} /></label><span>Unknown fields and non-CREATE commands are rejected.</span></div>
    </div> : null}

    {tab === 'preview' ? analysis ? <div className="protocol-stack">
      <section className="protocol-counts"><div><b>{analysis.counts.projects}</b><span>Projects</span></div><div><b>{analysis.counts.tasks}</b><span>Tasks</span></div><div><b>{analysis.counts.habits}</b><span>Habits</span></div><div><b>{analysis.counts.timeBlocks}</b><span>Blocks</span></div><div><b>{analysis.counts.recurringSeries}</b><span>Series</span></div><div><b>{analysis.counts.generatedOccurrences}</b><span>Generated</span></div></section>
      <IssueList issues={analysis.issues} />
      {analysis.dayImpacts.length ? <section><span className="section-label">Capacity impact</span><div className="protocol-impact-list">{analysis.dayImpacts.slice(0, 14).map((item) => <div key={item.date}><span>{item.date}</span><strong>{formatMinutes(item.existingMinutes)} + {formatMinutes(item.importedMinutes)} → {formatMinutes(item.totalMinutes)}</strong><em className={item.overloadedBy ? 'is-warning' : ''}>{item.overloadedBy ? `Over ${formatMinutes(item.overloadedBy)}` : `${formatMinutes(item.capacityMinutes - item.totalMinutes)} free`}</em></div>)}</div></section> : null}
      {analysis.document ? <section><span className="section-label">What will be created</span><div className="protocol-entity-list">{analysis.document.projects.map((item) => <div key={`p-${item.ref}`}><b>PROJECT</b><span>{item.name}</span></div>)}{analysis.document.tasks.slice(0, 80).map((item) => <div key={`t-${item.ref}`}><b>TASK</b><span>{item.title}</span><em>{item.plannedDate ?? 'Unplanned'}{item.estimatedMinutes ? ` · ${formatMinutes(item.estimatedMinutes)}` : ''}</em></div>)}{analysis.document.tasks.length > 80 ? <p>+ {analysis.document.tasks.length - 80} more Tasks</p> : null}{analysis.document.recurringSeries.map((item) => <div key={`s-${item.ref}`}><b>SERIES</b><span>{item.title}</span></div>)}</div></section> : null}
      <div className="protocol-apply-row"><span>{analysis.issues.some((item) => item.severity === 'error') ? 'Fix blocking errors before Apply.' : 'Warnings are advisory; no data changes until Apply.'}</span><Button variant="primary" disabled={busy || analysis.issues.some((item) => item.severity === 'error')} onClick={() => void apply()}>{busy ? 'Applying…' : 'Apply import'}</Button></div>
    </div> : <p>Paste JSON and run Preview first.</p> : null}

    {tab === 'history' ? <div className="protocol-history">{history.length ? history.map((batch) => <article key={batch.id}><div><b>{batch.title}</b><span>{new Date(batch.createdAt).toLocaleString()} · {batch.affectedEntities.length} entities</span></div><strong>{batch.status}</strong>{batch.status === 'applied' ? <Button disabled={busy} onClick={() => void revert(batch.id)}>Revert</Button> : null}</article>) : <p>No ChatGPT imports yet.</p>}</div> : null}
  </Modal>
}

function IssueList({ issues }: { issues: ImportAnalysis['issues'] }) {
  if (!issues.length) return <div className="protocol-clean">No blocking errors or warnings.</div>
  return <section><span className="section-label">Validation</span><div className="protocol-issues">{issues.map((item, index) => <div key={`${item.code}-${index}`} className={`is-${item.severity}`}><b>{item.severity === 'error' ? 'BLOCK' : 'WARN'}</b><span>{item.message}</span>{item.path ? <code>{item.path}</code> : null}</div>)}</div></section>
}
function formatMinutes(value: number) { const hours = Math.floor(value / 60); const minutes = value % 60; return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m` }
