import type { Transaction } from 'dexie'

function indexText(value: string) {
  return value
    .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, ' ')
    .replace(/!\\[[^\\]]*\\]\\([^)]*\\)/g, ' ')
    .replace(/\\[([^\\]]+)\\]\\([^)]*\\)/g, '$1')
    .replace(/[*_~#>\`-]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}

export async function migrateV20ToV21(tx: Transaction) {
  const tasks = await tx.table('tasks').toArray()
  const rows = tasks
    .filter((task: any) => !task.deletedAt && task.status !== 'cancelled')
    .map((task: any) => ({
      id: `task:${task.id}`,
      ownerType: 'task',
      ownerId: task.id,
      text: indexText([task.title, task.description ?? '', ...(task.tags ?? []), ...(task.comments ?? []).map((comment: any) => comment.body ?? '')].join(' ')),
      updatedAt: task.updatedAt ?? new Date().toISOString(),
    }))
  if (rows.length) await tx.table('searchDocuments').bulkPut(rows)
}
