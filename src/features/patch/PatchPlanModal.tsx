import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { PatchAnalysis } from './patchTypes'
import { analyzePatch, applyPatch, getPatchInstructions, listPatchHistory, revertPatch } from '../../services/patchService'
import type { UndoableMutation } from '../../services/undo'

export function PatchPlanModal({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: (undo: UndoableMutation) => void }) {
  const [tab, setTab] = useState<'prepare'|'preview'|'history'>('prepare')
  const [raw, setRaw] = useState('')
  const [analysis, setAnalysis] = useState<PatchAnalysis | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listPatchHistory>>>([])
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (open) { setMessage(''); setDestructiveConfirmed(false); void listPatchHistory().then(setHistory) } }, [open])

  async function copyInstructions() {
    setBusy(true); setMessage('')
    try { await navigator.clipboard.writeText(await getPatchInstructions()); setMessage('Patch context copied. The exact updatedAt timestamps are part of its concurrency guard.') } finally { setBusy(false) }
  }
  async function preview() {
    setBusy(true); setMessage(''); setDestructiveConfirmed(false)
    try { setAnalysis(await analyzePatch(raw)); setTab('preview') } finally { setBusy(false) }
  }
  async function apply() {
    if (!analysis?.document || analysis.issues.some((item) => item.severity === 'error')) return
    setBusy(true); setMessage('')
    try {
      const result = await applyPatch(raw, { source: 'chatgpt', confirmDestructive: destructiveConfirmed })
      onApplied(result.undo); setHistory(await listPatchHistory()); setMessage('Patch applied atomically.'); setRaw(''); setAnalysis(null); setDestructiveConfirmed(false); setTab('history')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Patch failed.') } finally { setBusy(false) }
  }
  async function revert(id: string) {
    setBusy(true); setMessage('')
    try { await revertPatch(id); setHistory(await listPatchHistory()); setMessage('Patch reverted to its exact before snapshots.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Revert blocked.') } finally { setBusy(false) }
  }
  async function loadFile(file?: File) { if (file) { setRaw(await file.text()); setAnalysis(null); setTab('prepare') } }

  const blocked = Boolean(analysis?.issues.some((item) => item.severity === 'error'))
  const destructiveNeedsConfirmation = Boolean(analysis?.destructiveCount && !destructiveConfirmed)

  return <Modal open={open} title="ChatGPT patch" onClose={onClose} className="protocol-modal protocol-modal--patch" footer={<>
    <span className="protocol-footer-note">Stable IDs · optimistic locking · atomic rollback</span>
    {tab !== 'history' ? <Button variant="primary" disabled={busy || !raw.trim()} onClick={() => void preview()}>{busy ? 'Checking…' : 'Preview patch'}</Button> : null}
  </>}>
    <div className="protocol-tabs" role="tablist">{(['prepare','preview','history'] as const).map((item) => <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'prepare' ? 'Prepare' : item === 'preview' ? 'Diff preview' : 'History'}</button>)}</div>
    {message ? <div className="protocol-message">{message}</div> : null}

    {tab === 'prepare' ? <div className="protocol-stack">
      <section className="protocol-intro"><div><span className="section-label">1 · Copy current state</span><h3>Generate against stable IDs</h3><p>The copied context includes exact IDs and <code>updatedAt</code> values. ChatGPT must echo both for every UPDATE/DELETE. Any local change makes stale output fail safely.</p></div><Button disabled={busy} onClick={() => void copyInstructions()}>Copy patch context</Button></section>
      <section><span className="section-label">2 · Paste patch JSON</span><textarea className="protocol-json" value={raw} onChange={(event) => { setRaw(event.target.value); setAnalysis(null) }} placeholder={'{"format":"folio-patch","version":1,"operations":[…]}'} spellCheck={false} /></section>
      <div className="protocol-file-row"><label className="button button--outline"><span>Load .json file</span><input type="file" accept="application/json,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])} /></label><span>Execution history, database IDs and provenance are never patchable.</span></div>
    </div> : null}

    {tab === 'preview' ? analysis ? <div className="protocol-stack">
      <section className="patch-summary-band"><div><b>{analysis.diffs.length}</b><span>Operations</span></div><div><b>{analysis.diffs.filter((item) => item.op === 'create').length}</b><span>Create</span></div><div><b>{analysis.diffs.filter((item) => item.op === 'update').length}</b><span>Update</span></div><div><b>{analysis.destructiveCount}</b><span>Delete</span></div></section>
      <PatchIssues issues={analysis.issues} />
      <section><span className="section-label">Before → after</span><div className="patch-diffs">{analysis.diffs.map((diff) => <article key={`${diff.operationIndex}-${diff.target}`} className={diff.destructive ? 'is-destructive' : ''}><header><b>{String(diff.operationIndex + 1).padStart(2, '0')} · {diff.op.toUpperCase()} {diff.entity}</b><strong>{diff.label}</strong></header><p>{diff.effect}</p>{diff.fields.length ? <dl>{diff.fields.map((field) => <div key={field.field}><dt>{field.field}</dt><dd><span>{field.before}</span><i>→</i><strong>{field.after}</strong></dd></div>)}</dl> : null}</article>)}</div></section>
      {analysis.dayImpacts.length ? <section><span className="section-label">Capacity impact</span><div className="protocol-impact-list">{analysis.dayImpacts.slice(0, 14).map((item) => <div key={item.date}><span>{item.date}</span><strong>{formatMinutes(item.beforeMinutes)} → {formatMinutes(item.afterMinutes)}</strong><em className={item.overloadedBy ? 'is-warning' : ''}>{item.deltaMinutes > 0 ? '+' : ''}{formatMinutesSigned(item.deltaMinutes)}{item.overloadedBy ? ` · over ${formatMinutes(item.overloadedBy)}` : ''}</em></div>)}</div></section> : null}
      {analysis.destructiveCount ? <label className="destructive-ack"><input type="checkbox" checked={destructiveConfirmed} onChange={(event) => setDestructiveConfirmed(event.target.checked)} /><span><b>Confirm {analysis.destructiveCount} destructive operation{analysis.destructiveCount === 1 ? '' : 's'}</b><small>Task deletion goes to Trash; Projects/Habits archive; Series end; Time Blocks are removed but retained in patch snapshots for Undo/Revert.</small></span></label> : null}
      <div className="protocol-apply-row"><span>{blocked ? 'Blocking validation errors must be fixed.' : destructiveNeedsConfirmation ? 'Confirm destructive changes before Apply.' : 'Apply writes the entire diff in one transaction.'}</span><Button variant="primary" disabled={busy || blocked || destructiveNeedsConfirmation} onClick={() => void apply()}>{busy ? 'Applying…' : 'Apply patch'}</Button></div>
    </div> : <p>Paste JSON and run Preview first.</p> : null}

    {tab === 'history' ? <div className="protocol-history">{history.length ? history.map((batch) => <article key={batch.id}><div><b>{batch.title}</b><span>{new Date(batch.createdAt).toLocaleString()} · {batch.operations.length} operations</span></div><strong>{batch.status}</strong>{batch.status === 'applied' ? <Button disabled={busy} onClick={() => void revert(batch.id)}>Revert</Button> : null}</article>) : <p>No patches yet.</p>}</div> : null}
  </Modal>
}

function PatchIssues({ issues }: { issues: PatchAnalysis['issues'] }) {
  if (!issues.length) return <div className="protocol-clean">No blocking errors or warnings.</div>
  return <section><span className="section-label">Validation</span><div className="protocol-issues">{issues.map((item, index) => <div key={`${item.code}-${index}`} className={`is-${item.severity}`}><b>{item.severity === 'error' ? 'BLOCK' : 'WARN'}</b><span>{item.message}</span>{item.operationIndex !== undefined ? <code>operation {item.operationIndex + 1}</code> : null}</div>)}</div></section>
}
function formatMinutes(value: number) { const abs = Math.abs(value); const h = Math.floor(abs/60); const m=abs%60; return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m` }
function formatMinutesSigned(value: number) { return `${value < 0 ? '−' : ''}${formatMinutes(value)}` }
