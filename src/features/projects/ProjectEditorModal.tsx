import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { ProjectSummary, ProjectCreateInput, ProjectUpdateInput } from '../../repositories/projectRepository'

const PROJECT_COLORS = ['#4169FF', '#7657FF', '#34C6D3', '#3AB58A', '#76B947', '#D8A54A', '#E07B49', '#D45C8C']

export function ProjectEditorModal({ open, project, onClose, onCreate, onUpdate }: {
  open: boolean
  project?: ProjectSummary | null
  onClose: () => void
  onCreate: (input: ProjectCreateInput) => Promise<void>
  onUpdate: (id: string, input: ProjectUpdateInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [icon, setIcon] = useState('')
  const [type, setType] = useState<'standard' | 'academic'>('standard')
  const [favorite, setFavorite] = useState(false)
  const [examDate, setExamDate] = useState('')
  const [weeklyTarget, setWeeklyTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setColor(project?.color ?? PROJECT_COLORS[0])
    setIcon(project?.icon ?? '')
    setType(project?.type ?? 'standard')
    setFavorite(project?.favorite ?? false)
    setExamDate(project?.examDate ?? '')
    setWeeklyTarget(project?.weeklyTargetMinutes ? String(project.weeklyTargetMinutes) : '')
    setError('')
  }, [open, project])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    const common = {
      name: name.trim(),
      description,
      color,
      icon: icon.trim() || undefined,
      type,
      favorite,
    }
    try {
      if (project) {
        await onUpdate(project.id, {
          ...common,
          examDate: type === 'academic' ? (examDate || null) : null,
          weeklyTargetMinutes: type === 'academic' ? (weeklyTarget ? Number(weeklyTarget) : null) : null,
        })
      } else {
        await onCreate({
          ...common,
          examDate: type === 'academic' && examDate ? examDate : undefined,
          weeklyTargetMinutes: type === 'academic' && weeklyTarget ? Number(weeklyTarget) : undefined,
        })
      }
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The project could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || !name.trim()} onClick={() => document.getElementById('project-editor-submit')?.click()}>{saving ? 'Saving…' : project ? 'Save project' : 'Create project'}</Button></>}
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Analysis III" /></label>
        <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs in this project?" /></label>
        <div className="form-grid">
          <label className="field"><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="standard">Standard project</option><option value="academic">Academic / course</option></select></label>
          <label className="field"><span>Icon label</span><input value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="∑ or short label" maxLength={24} /></label>
        </div>
        <div className="field">
          <span>Project color</span>
          <div className="project-color-row">
            {PROJECT_COLORS.map((value) => <button type="button" aria-label={`Use ${value}`} className={`project-color-swatch ${color === value ? 'is-active' : ''}`} style={{ background: value }} key={value} onClick={() => setColor(value)} />)}
            <input aria-label="Custom project color" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} />
          </div>
        </div>
        {type === 'academic' ? <div className="form-grid">
          <label className="field"><span>Exam date</span><input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>
          <label className="field"><span>Weekly study target</span><input type="number" min="1" max="10080" value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} placeholder="Minutes" /></label>
        </div> : null}
        <label className="check-field"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /><span>Show in Favorites</span></label>
        {error ? <div className="form-error">{error}</div> : null}
        <button id="project-editor-submit" type="submit" hidden />
      </form>
    </Modal>
  )
}
