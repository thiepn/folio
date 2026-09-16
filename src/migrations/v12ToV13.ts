import type { Transaction } from 'dexie'

export async function migrateV12ToV13(tx: Transaction) {
  const now = new Date().toISOString()
  await tx.table('projects').toCollection().modify((project: Record<string, unknown>) => {
    if (!project.status) project.status = 'active'
    if (typeof project.notes !== 'string') project.notes = ''
    if (!Array.isArray(project.milestones)) project.milestones = []
    if (!Array.isArray(project.activity)) {
      project.activity = [{ id: crypto.randomUUID(), kind: 'project', label: 'Project upgraded to workflow model', at: now }]
    }
  })
}
