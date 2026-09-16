import type { Transaction } from 'dexie'
import type { ProjectEntity } from '../domain/models'

export async function migrateV3ToV4(transaction: Transaction) {
  const table = transaction.table<ProjectEntity, string>('projects')
  const projects = await table.toArray()
  const now = new Date().toISOString()
  const legacyIcons: Record<string, string> = { function: '∑', language: 'FR', code: '<>', person: '•' }
  await table.bulkPut(projects.map((project) => ({
    ...project,
    icon: project.icon ? (legacyIcons[project.icon] ?? project.icon) : undefined,
    favorite: project.favorite ?? false,
    archivedAt: project.archived ? (project.archivedAt ?? project.updatedAt ?? now) : undefined,
    updatedAt: project.updatedAt ?? now,
  })))
}
