import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { LocalDate, ReviewKind, ReviewRecordEntity } from '../../domain/models'

export interface ReviewRecordDraft {
  kind: ReviewKind
  anchorDate: LocalDate
  title?: string
  summary?: string
  wins?: string
  friction?: string
  lessons?: string
  nextFocus?: string
}

export function ReviewRecordModal({ open, today, initialKind = 'daily', record, onClose, onSave, onDelete }: {
  open: boolean
  today: LocalDate
  initialKind?: ReviewKind
  record?: ReviewRecordEntity | null
  onClose: () => void
  onSave: (draft: ReviewRecordDraft) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}) {
  const [kind, setKind] = useState<ReviewKind>(initialKind)
  const [anchorDate, setAnchorDate] = useState(today)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [wins, setWins] = useState('')
  const [friction, setFriction] = useState('')
  const [lessons, setLessons] = useState('')
  const [nextFocus, setNextFocus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const nextKind = record?.kind ?? initialKind
    setKind(nextKind)
    setAnchorDate(record?.periodStart ?? today)
    setTitle(record?.title ?? '')
    setSummary(record?.summary ?? '')
    setWins(record?.wins ?? '')
    setFriction(record?.friction ?? '')
    setLessons(record?.lessons ?? '')
    setNextFocus(record?.nextFocus ?? '')
    setSaving(false)
    setError('')
  }, [open, record, initialKind, today])

  const month = anchorDate.slice(0, 7)

  async function save() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({ kind, anchorDate, title, summary, wins, friction, lessons, nextFocus })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!record || !onDelete || saving) return
    setSaving(true)
    setError('')
    try {
      await onDelete(record.id)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review could not be removed.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal
    open={open}
    title={record ? 'Edit review' : 'New review'}
    onClose={onClose}
    className="review-record-modal"
    footer={<div className="review-record-modal__footer">
      <div>{record && onDelete ? <Button onClick={() => void remove()}>Delete review</Button> : null}</div>
      <div><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save review'}</Button></div>
    </div>}
  >
    <div className="review-record-form">
      <div className="review-record-form__top">
        <label className="field"><span>Review type</span><select disabled={Boolean(record)} value={kind} onChange={(event) => setKind(event.target.value as ReviewKind)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        {kind === 'monthly'
          ? <label className="field"><span>Month</span><input type="month" value={month} onChange={(event) => setAnchorDate(`${event.target.value}-01`)} /></label>
          : <label className="field"><span>{kind === 'weekly' ? 'A day in the week' : 'Date'}</span><input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} /></label>}
      </div>
      <label className="field"><span>Title <small>optional</small></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Leave blank for an automatic title" /></label>
      <label className="field"><span>Summary</span><textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What happened in this period?" /></label>
      <div className="review-record-form__grid">
        <label className="field"><span>Wins</span><textarea rows={4} value={wins} onChange={(event) => setWins(event.target.value)} placeholder="What went well?" /></label>
        <label className="field"><span>Friction</span><textarea rows={4} value={friction} onChange={(event) => setFriction(event.target.value)} placeholder="What got in the way?" /></label>
        <label className="field"><span>Lessons</span><textarea rows={4} value={lessons} onChange={(event) => setLessons(event.target.value)} placeholder="What should change?" /></label>
        <label className="field"><span>Next focus</span><textarea rows={4} value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} placeholder="What deserves attention next?" /></label>
      </div>
      {record ? <div className="review-record-snapshot-note">Metric snapshots are recalculated when this review is saved. The historical text remains yours to edit.</div> : null}
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  </Modal>
}
