import type { Transaction } from 'dexie'

function normalizeTagName(value: string) {
  return value.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase()
}

function tagIdFor(normalized: string) {
  let hash = 2166136261
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `tag-v19-${(hash >>> 0).toString(36)}`
}

export async function migrateV18ToV19(tx: Transaction) {
  const tasks = tx.table('tasks')
  const series = tx.table('recurringSeries')
  const tags = tx.table('tags')
  const now = new Date().toISOString()

  const names = new Map<string, string>()
  const remember = (value: unknown) => {
    if (typeof value !== 'string') return
    const name = value.trim().replace(/^#/, '').replace(/\s+/g, ' ')
    if (!name) return
    const normalized = normalizeTagName(name)
    if (!names.has(normalized)) names.set(normalized, name)
  }

  for (const task of await tasks.toArray()) for (const value of task.tags ?? []) remember(value)
  for (const item of await series.toArray()) {
    for (const value of item.taskTemplate?.tags ?? []) remember(value)
    for (const exception of Object.values(item.exceptions ?? {}) as any[]) for (const value of exception?.tags ?? []) remember(value)
  }

  const entities = [...names.entries()].map(([normalizedName, name], index) => ({
    id: tagIdFor(normalizedName),
    name,
    normalizedName,
    favorite: false,
    archived: false,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))
  if (entities.length) await tags.bulkPut(entities)

  const idsByName = new Map(entities.map((tag) => [tag.normalizedName, tag.id]))
  const tagIds = (values: unknown[]) => [...new Set(values.flatMap((value) => {
    if (typeof value !== 'string') return []
    const id = idsByName.get(normalizeTagName(value))
    return id ? [id] : []
  }))]

  await tasks.toCollection().modify((task: any) => {
    task.listId = task.listId ?? undefined
    task.sectionId = task.sectionId ?? undefined
    task.tagIds = Array.isArray(task.tagIds) && task.tagIds.length ? task.tagIds : tagIds(task.tags ?? [])
  })

  await series.toCollection().modify((item: any) => {
    item.taskTemplate = {
      ...item.taskTemplate,
      listId: item.taskTemplate?.listId ?? undefined,
      sectionId: item.taskTemplate?.sectionId ?? undefined,
      tagIds: Array.isArray(item.taskTemplate?.tagIds) && item.taskTemplate.tagIds.length
        ? item.taskTemplate.tagIds
        : tagIds(item.taskTemplate?.tags ?? []),
    }
    item.exceptions = Object.fromEntries(Object.entries(item.exceptions ?? {}).map(([date, raw]) => {
      const exception = raw as any
      return [date, {
        ...exception,
        tagIds: Array.isArray(exception?.tagIds) && exception.tagIds.length
          ? exception.tagIds
          : tagIds(exception?.tags ?? []),
      }]
    }))
  })
}
